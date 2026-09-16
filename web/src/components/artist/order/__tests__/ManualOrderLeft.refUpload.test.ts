// WEB-04 回归测试：手动录单参考图——粘贴显示 + 拖拽/粘贴两路径上限统一
// 覆盖场景：
//   1. v-model:file-list 双向绑定（粘贴推入的项被 EP 渲染）
//   2. 粘贴上限使用 uploadedRefs.length（拖拽成功后粘贴正确计数）
//   3. 先拖 3 再粘 3 → 第 6 张被阻止（核心缺陷场景）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../../locales/zh-CN'

// ─── mock 设置 ───
const h = vi.hoisted(() => ({
  uploadRef: vi.fn(),
  pasteOnFiles: null as ((files: File[]) => void | Promise<void>) | null
}))

vi.mock('../../../../utils/anonUpload', () => ({
  uploadReferenceWithAnonToken: (...args: unknown[]) => h.uploadRef(...args),
  AnonTokenUnavailableError: class AnonTokenUnavailableError extends Error {
    code = 'ANON_TOKEN_UNAVAILABLE'
  }
}))

vi.mock('../../../../composables/usePasteUpload', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    usePasteUpload: (opts: { onFiles: (files: File[]) => void | Promise<void> }) => {
      h.pasteOnFiles = opts.onFiles
      return { isPasteUploading: vueRef(false), pasteError: vueRef('') }
    }
  }
})

vi.mock('../../../../composables/useDropGuard', () => ({
  useDropGuard: () => ({
    guardDragEnter: () => {},
    guardDragOver: () => {},
    guardDrop: () => {}
  })
}))

import ManualOrderLeft from '../ManualOrderLeft.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN }
})

function makeFile(name: string, size = 1024): File {
  const content = new Uint8Array(size)
  return new File([content], name, { type: 'image/png' })
}

describe('WEB-04: ManualOrderLeft 参考图上限与显示', () => {
  beforeEach(() => {
    h.uploadRef.mockReset()
    h.pasteOnFiles = null
    h.uploadRef.mockImplementation(() =>
      Promise.resolve({ token: 'tok', uploaded: { filePath: `refs/${Math.random().toString(36).slice(2)}.png`, url: '/uploads/test.png' } })
    )
  })

  it('el-upload 使用 v-model:file-list（双向绑定，粘贴图可显示）', () => {
    const wrapper = mount(ManualOrderLeft, { global: { plugins: [ElementPlus, i18n] } })
    const upload = wrapper.findComponent({ name: 'ElUpload' })
    expect(upload.exists()).toBe(true)
    // v-model:file-list 意味着组件接收 fileList prop 且发出 update:fileList 事件
    // 检查 props 中存在 fileList（EP 内部用此 prop 做双向同步）
    expect(upload.props('fileList')).toBeDefined()
    wrapper.unmount()
  })

  it('粘贴 5 张后第 6 张被阻止（单次粘贴路径上限）', async () => {
    const wrapper = mount(ManualOrderLeft, { global: { plugins: [ElementPlus, i18n] } })
    await flushPromises()
    expect(h.pasteOnFiles).toBeTypeOf('function')

    // 粘贴 6 张——应该只成功 5 张
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`img${i}.png`))
    await h.pasteOnFiles!(files)
    await flushPromises()

    // uploadReferenceWithAnonToken 只应被调用 5 次（第 6 次被上限拦截）
    expect(h.uploadRef).toHaveBeenCalledTimes(5)
    wrapper.unmount()
  })

  it('拖拽上传 3 张后粘贴 3 张 → 只允许 2 张（核心缺陷场景：跨路径上限统一）', async () => {
    const wrapper = mount(ManualOrderLeft, { global: { plugins: [ElementPlus, i18n] } })
    await flushPromises()

    // 模拟拖拽上传：通过 el-upload 的 http-request prop 调用 handleRefUpload
    const upload = wrapper.findComponent({ name: 'ElUpload' })
    const httpRequest = upload.props('httpRequest') as (opts: { file: File }) => Promise<void>
    expect(httpRequest).toBeTypeOf('function')

    // 拖拽 3 张
    for (let i = 0; i < 3; i++) {
      const file = makeFile(`drag${i}.png`)
      // EP 给每个文件附加 uid
      Object.defineProperty(file, 'uid', { value: `drag-uid-${i}`, writable: false })
      await httpRequest({ file })
    }
    await flushPromises()
    expect(h.uploadRef).toHaveBeenCalledTimes(3)

    // 重置 mock 计数以区分粘贴阶段
    h.uploadRef.mockClear()

    // 粘贴 3 张 → 只应成功 2 张（3 drag + 2 paste = 5 = MAX_IMAGE_COUNT）
    expect(h.pasteOnFiles).toBeTypeOf('function')
    const pasteFiles = Array.from({ length: 3 }, (_, i) => makeFile(`paste${i}.png`))
    await h.pasteOnFiles!(pasteFiles)
    await flushPromises()

    expect(h.uploadRef).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('拖拽上传 5 张后粘贴被完全阻止', async () => {
    const wrapper = mount(ManualOrderLeft, { global: { plugins: [ElementPlus, i18n] } })
    await flushPromises()

    const upload = wrapper.findComponent({ name: 'ElUpload' })
    const httpRequest = upload.props('httpRequest') as (opts: { file: File }) => Promise<void>

    // 拖拽 5 张（满额）
    for (let i = 0; i < 5; i++) {
      const file = makeFile(`drag${i}.png`)
      Object.defineProperty(file, 'uid', { value: `drag-uid-${i}`, writable: false })
      await httpRequest({ file })
    }
    await flushPromises()

    h.uploadRef.mockClear()

    // 粘贴 1 张 → 应被完全阻止
    expect(h.pasteOnFiles).toBeTypeOf('function')
    await h.pasteOnFiles!([makeFile('paste0.png')])
    await flushPromises()

    expect(h.uploadRef).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
