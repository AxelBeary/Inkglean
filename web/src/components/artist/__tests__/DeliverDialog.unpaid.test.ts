// 审计 #21 条目 1：交付弹窗的未收尾款提示与二次确认门槛
// 覆盖：pendingCents>0 时展示金额提示；文件交付模式在有余额时也需二次确认（此前只有无文件交付要确认）；
//       已付清/无余额时文件交付保持零确认直接提交（不新增摩擦）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DeliverDialog from '../DeliverDialog.vue'

const confirmMock = vi.fn()
const deliverMock = vi.fn()
const deliverableUploadMock = vi.fn()

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: (...args: unknown[]) => confirmMock(...args) }
  }
})

vi.mock('../../../api/index', () => ({
  artistApi: {
    deliver: (...args: unknown[]) => deliverMock(...args),
    deliverNoFile: vi.fn()
  },
  uploadApi: {
    deliverable: (...args: unknown[]) => deliverableUploadMock(...args)
  }
}))

const ElUploadStub = {
  name: 'ElUploadStub',
  props: ['onChange', 'onRemove'],
  template: '<div class="upload-stub"><slot /><slot name="tip" /></div>'
}

const EP_STUBS = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-radio-group': { props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="radio-group"><slot /></div>' },
  'el-radio-button': { props: ['value'], template: '<button class="radio-btn"><slot /></button>' },
  'el-upload': ElUploadStub,
  'el-alert': { props: ['type', 'closable', 'showIcon'], template: '<div class="alert-stub" :data-type="type"><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': {
    props: ['type', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  },
  Upload: { template: '<span />' }
}

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(DeliverDialog, {
    props: { modelValue: true, orderId: 7, orderVersion: 3, ...props },
    global: {
      stubs: EP_STUBS,
      mocks: { $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }
    }
  })
}

/** 走 el-upload 的 on-change 回调塞入一个合法交付文件（.png，远小于 50MB 上限） */
async function attachFile(wrapper: ReturnType<typeof mountDialog>) {
  const onChange = wrapper.findComponent(ElUploadStub).props('onChange') as (f: unknown) => void
  onChange({ name: 'final.png', size: 12, raw: new File(['x'], 'final.png', { type: 'image/png' }) })
  await flushPromises()
}

function submitButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('button').find(b => b.text().includes('orderDetail.confirmDeliver'))
}

beforeEach(() => {
  confirmMock.mockReset()
  deliverMock.mockReset()
  deliverableUploadMock.mockReset()
})

describe('DeliverDialog 未收尾款提示（#21-1）', () => {
  it('有未收余额时展示金额提示', () => {
    const wrapper = mountDialog({ pendingCents: 20000 })
    const alert = wrapper.find('.alert-stub[data-type="warning"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('deliverMode.unpaidWarning')
    // 20000 分 → ¥200.00
    expect(alert.text()).toContain('"amount":"¥200.00"')
  })

  it('无余额 / 未提供余额数据时不展示提示', () => {
    expect(mountDialog({ pendingCents: 0 }).find('.alert-stub[data-type="warning"]').exists()).toBe(false)
    expect(mountDialog({ pendingCents: null }).find('.alert-stub[data-type="warning"]').exists()).toBe(false)
  })

  it('有余额时文件交付也需二次确认，确认文案带金额', async () => {
    const wrapper = mountDialog({ pendingCents: 5000 })
    await attachFile(wrapper)
    await submitButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0][0]).toContain('deliverMode.unpaidFileConfirm')
    expect(confirmMock.mock.calls[0][0]).toContain('"amount":"¥50.00"')
    // 用户取消（confirm reject）→ 不发请求
    confirmMock.mockImplementationOnce(() => Promise.reject(new Error('cancel')))
    deliverMock.mockResolvedValue({ statusChanged: true })
    await submitButton(wrapper)!.trigger('click')
    await flushPromises()
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('无余额时文件交付保持原样：不弹确认，直接提交', async () => {
    deliverableUploadMock.mockResolvedValue({ filePath: 'deliverables/7/final.png', originalName: 'final.png' })
    deliverMock.mockResolvedValue({ statusChanged: true })
    const wrapper = mountDialog({ pendingCents: 0 })
    await attachFile(wrapper)
    await submitButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(confirmMock).not.toHaveBeenCalled()
    expect(deliverMock).toHaveBeenCalledWith(7, { filePath: 'deliverables/7/final.png', fileName: 'final.png', version: 3 })
  })
})
