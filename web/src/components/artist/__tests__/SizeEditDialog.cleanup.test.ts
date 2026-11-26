// F0200 回归：SizeEditDialog 孤儿图清理（staged 模型）
// 覆盖（CROSSEND-PLAN §3 组件测试要求）：
//   1. 新建模式上传 → 取消关闭 → cleanup 带正确路径（孤儿回收）
//   2. 上传 → 保存成功 → 关闭 → cleanup 不被调用（已引用的活图绝不能删）
//   3. 编辑模式上传后 PUT 失败回滚 → 关闭 → cleanup 带该路径
//   4. 移除本次 staged 未提交的图 → 立即 cleanup（不等关窗）
//   5. cleanup 请求失败 → 可见警告（不静默、不阻塞）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  updateSize: vi.fn(),
  createSize: vi.fn(),
  uploadImage: vi.fn(),
  cleanup: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  /** el-upload stub 捕获的 http-request（uploadSizeImage 本体） */
  httpRequests: [] as Array<(o: { file: File }) => Promise<void>>
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    updateStyleSize: h.updateSize,
    createStyleSize: h.createSize
  },
  uploadApi: { image: h.uploadImage, cleanup: h.cleanup }
}))

// 组件里 ElMessage 两种用法并存：ElMessage({...}) 直接调用 + ElMessage.success/error/warning 方法
vi.mock('element-plus', () => {
  const fn = vi.fn()
  Object.assign(fn, { success: h.success, error: h.error, warning: h.warning, info: vi.fn() })
  return { ElMessage: fn }
})

import SizeEditDialog from '../SizeEditDialog.vue'

const BUTTON_STUB = {
  name: 'ElButton',
  props: ['text', 'type', 'size', 'loading'],
  emits: ['click'],
  template: '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
}

/** el-upload stub：捕获 http-request 供测试直接驱动 uploadSizeImage（真 el-upload 的选件 UI 无法在 stub 里模拟） */
const UPLOAD_STUB = {
  name: 'ElUpload',
  props: ['httpRequest', 'autoUpload', 'showFileList', 'accept', 'limit', 'fileList'],
  template: '<div class="upload-stub"><slot /></div>',
  mounted(this: { httpRequest: (o: { file: File }) => Promise<void> }) {
    h.httpRequests.push(this.httpRequest)
  }
}

function mountDialog(size: Record<string, unknown> | null) {
  h.httpRequests.length = 0
  return mount(SizeEditDialog, {
    props: { modelValue: false, styleId: 3, size: size as never, artworks: [] },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: {
        'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width', 'destroyOnClose'] },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': {
          props: ['label', 'required'],
          template: '<div class="form-item"><span class="form-label">{{ label }}</span><slot /></div>'
        },
        'el-input': {
          name: 'ElInput',
          props: ['modelValue', 'placeholder', 'maxlength', 'type', 'rows'],
          emits: ['update:modelValue'],
          template: '<input class="text-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        'el-input-number': {
          name: 'ElInputNumber',
          props: ['modelValue', 'min', 'max', 'step', 'precision'],
          template: '<input class="num-stub" />'
        },
        'el-image': { template: '<img />' },
        'el-upload': UPLOAD_STUB,
        'el-button': BUTTON_STUB,
        'el-empty': { template: '<div />' }
      }
    }
  })
}

/** 模拟一次「上传成功」：驱动捕获到的 http-request（uploadSizeImage 本体） */
async function driveUpload(filePath: string) {
  expect(h.httpRequests.length).toBeGreaterThan(0)
  h.uploadImage.mockResolvedValueOnce({ filePath, url: `/uploads/${filePath}` })
  await h.httpRequests[0]({ file: new File(['x'], 'a.png', { type: 'image/png' }) })
  await flushPromises()
}

/** 点取消按钮 → 应用父级回写（模拟 v-model 双向）→ 关窗分支执行 */
async function cancelClose(wrapper: ReturnType<typeof mountDialog>) {
  const cancelBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.cancel')
  expect(cancelBtn).toBeTruthy()
  await cancelBtn!.trigger('click')
  const emitted = wrapper.emitted('update:modelValue')
  expect(emitted).toBeTruthy()
  expect(emitted!.at(-1)).toEqual([false])
  await wrapper.setProps({ modelValue: false })
  await flushPromises()
}

beforeEach(() => {
  h.updateSize.mockReset().mockResolvedValue({})
  h.createSize.mockReset().mockResolvedValue({})
  h.uploadImage.mockReset()
  h.cleanup.mockReset().mockResolvedValue({ deleted: [] })
  h.success.mockClear()
  h.error.mockClear()
  h.warning.mockClear()
  h.httpRequests.length = 0
})

describe('SizeEditDialog 孤儿图清理（F0200 staged 模型）', () => {
  it('新建模式上传后取消关闭 → cleanup 带上传路径', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/orphan-a.png')
    await cancelClose(wrapper)

    // 未提交即关窗 → 该文件无人引用，fire-and-forget 清理带走它
    expect(h.cleanup).toHaveBeenCalledTimes(1)
    expect(h.cleanup).toHaveBeenCalledWith(['images/3/orphan-a.png'])
    wrapper.unmount()
  })

  it('上传后保存成功再关闭 → cleanup 不被调用（防误删已引用活图）', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/live-b.png')
    // 名称必填：填上再保存
    await wrapper.find('.text-stub').setValue('半身')
    const saveBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.save')
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(h.createSize).toHaveBeenCalledTimes(1)
    // 保存成功后关闭：提交路径已摘出 staged，关窗清理不发生（活图不能删）
    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    expect(h.cleanup).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('连传两张只保存最后一张 → 关窗时前一张被清理（staged 只摘除已提交那条）', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/replaced-first.png')
    await driveUpload('images/3/kept-last.png')
    await wrapper.find('.text-stub').setValue('全身')
    const saveBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'common.save')
    await saveBtn!.trigger('click')
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    await flushPromises()

    // 提交的是后传那张（payload.image = kept-last）；先传的成了孤儿，关窗回收
    const payload = h.createSize.mock.calls[0]?.[1] as { image?: string | null }
    expect(payload!.image).toBe('images/3/kept-last.png')
    expect(h.cleanup).toHaveBeenCalledTimes(1)
    expect(h.cleanup).toHaveBeenCalledWith(['images/3/replaced-first.png'])
    wrapper.unmount()
  })

  it('编辑模式上传后 PUT 失败回滚 → 关闭时 cleanup 带刚上传的路径', async () => {
    h.updateSize.mockReset().mockRejectedValueOnce(new Error('PUT 失败'))
    const wrapper = mountDialog({ id: 9, name: '半身', base_price: 200, image: 'images/3/old-live.png' })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/put-failed.png')
    // PUT 失败：表单回滚到 old-live，错误可见
    expect(h.error).toHaveBeenCalledWith('PUT 失败')
    await cancelClose(wrapper)

    expect(h.cleanup).toHaveBeenCalledWith(['images/3/put-failed.png'])
    // 回滚后的活图（旧引用）绝不能进清理清单
    const calledWith = h.cleanup.mock.calls[0]?.[0] as string[]
    expect(calledWith).not.toContain('images/3/old-live.png')
    wrapper.unmount()
  })

  it('移除本次 staged 未提交的图 → 立即 cleanup，不等关窗', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/removed-at-once.png')
    const removeBtn = wrapper.findAll('.btn-stub').find(b => b.text() === 'styleManage.sizeImageRemove')
    expect(removeBtn).toBeTruthy()
    await removeBtn!.trigger('click')
    await flushPromises()

    // 新建模式无 PUT：摘掉即无引用，立即清理
    expect(h.cleanup).toHaveBeenCalledTimes(1)
    expect(h.cleanup).toHaveBeenCalledWith(['images/3/removed-at-once.png'])
    // 之后关窗不再重复清理（staged 已空）
    await cancelClose(wrapper)
    expect(h.cleanup).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('cleanup 请求失败 → 可见警告（不静默吞掉）', async () => {
    h.cleanup.mockRejectedValueOnce(new Error('network down'))
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    await driveUpload('images/3/warn-me.png')
    await cancelClose(wrapper)

    // fire-and-forget 的 catch 弹通用网络错误提示（locales 不在本批清单内，复用 common.networkError）
    expect(h.warning).toHaveBeenCalledWith('common.networkError')
    wrapper.unmount()
  })

  it('无上传直接取消 → cleanup 不发请求（零 staged 零调用）', async () => {
    const wrapper = mountDialog(null)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    await cancelClose(wrapper)
    expect(h.cleanup).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
