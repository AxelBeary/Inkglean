// usePasteUpload composable 测试
// 覆盖：粘贴事件拦截、图片/非图片识别、数量限制、大小限制、上传回调、enabled 开关、卸载清理
// 测试策略：happy-dom 的 ClipboardEvent 不携带 clipboardData，
// 用 new Event('paste') + 手动挂载 clipboardData 属性来触发 handlePaste
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, type Ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

import { usePasteUpload } from '../usePasteUpload.js'

// ─── 工具函数 ───

function makeImageFile(name = 'img.png', sizeKB = 1) {
  // File 构造器会按内容计算 size，用大字符串模拟指定大小
  const content = 'x'.repeat(sizeKB * 1024)
  return new File([content], name, { type: 'image/png' })
}

function makeBigImageFile(name = 'big.png', sizeMB = 11) {
  const content = 'x'.repeat(sizeMB * 1024 * 1024)
  return new File([content], name, { type: 'image/png' })
}

interface ClipboardItemLike {
  kind: string
  type: string
  getAsFile: () => File | null
}

type PasteEventLike = Event & { clipboardData?: { items: ClipboardItemLike[] } }

/** 构造带 clipboardData 的粘贴事件并派发到 document */
function firePaste(items: ClipboardItemLike[]): PasteEventLike {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as PasteEventLike
  event.clipboardData = { items }
  document.dispatchEvent(event)
  return event
}

function imageItem(file: File): ClipboardItemLike {
  return { kind: 'file', type: 'image/png', getAsFile: () => file }
}

function nonImageItem(): ClipboardItemLike {
  return { kind: 'file', type: 'application/pdf', getAsFile: () => new File(['x'], 'doc.pdf', { type: 'application/pdf' }) }
}

function textItem(): ClipboardItemLike {
  return { kind: 'string', type: 'text/plain', getAsFile: () => null }
}

interface SetupOpts {
  onFiles?: (files: File[]) => Promise<void> | void
  maxCount?: number
  maxSizeMB?: number
  enabled?: boolean | Ref<boolean>
}

/** 挂载 composable 并返回实例 */
function setup(opts: SetupOpts = {}) {
  const onFiles = opts.onFiles || vi.fn()
  let pu!: ReturnType<typeof usePasteUpload>
  const wrapper = mount({
    setup() {
      pu = usePasteUpload({
        onFiles,
        maxCount: opts.maxCount ?? 5,
        maxSizeMB: opts.maxSizeMB ?? 10,
        // 运行时支持 Ref<boolean>（类型签名只声明 boolean，断言保运行时原样）
        enabled: (opts.enabled ?? true) as boolean
      })
      return { pu }
    },
    template: '<div />'
  })
  return { wrapper, onFiles, pu }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePasteUpload', () => {
  it('纯文本粘贴 → 不拦截，不触发回调', () => {
    const { onFiles } = setup()
    const event = firePaste([textItem()])
    expect(event.defaultPrevented).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('无 clipboardData → 静默忽略', () => {
    const { onFiles } = setup()
    const event = new Event('paste', { bubbles: true, cancelable: true })
    // 不挂 clipboardData
    document.dispatchEvent(event)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('粘贴单张图片 → 调用 onFiles 并传入文件数组', async () => {
    const { onFiles, pu } = setup()
    const file = makeImageFile()
    firePaste([imageItem(file)])
    await flushPromises()

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith([file])
    expect(pu.isPasteUploading.value).toBe(false) // 上传完成后复位
    expect(pu.pasteError.value).toBe('')
  })

  it('粘贴多张图片 → 全部传入 onFiles', async () => {
    const { onFiles } = setup()
    const f1 = makeImageFile('a.png')
    const f2 = makeImageFile('b.png')
    firePaste([imageItem(f1), imageItem(f2)])
    await flushPromises()

    expect(onFiles).toHaveBeenCalledWith([f1, f2])
  })

  it('有文件但无图片 → 拦截 + 提示仅支持图片', () => {
    const { onFiles, pu } = setup()
    const event = firePaste([nonImageItem()])

    expect(event.defaultPrevented).toBe(true)
    expect(onFiles).not.toHaveBeenCalled()
    expect(pu.pasteError.value).toBe('upload.pasteNotImage')
  })

  it('图片 + 非图片混合 → 只传图片给 onFiles', async () => {
    const { onFiles } = setup()
    const file = makeImageFile()
    firePaste([imageItem(file), nonImageItem()])
    await flushPromises()

    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('超过 maxCount → 拦截 + 提示数量超限', () => {
    const { onFiles, pu } = setup({ maxCount: 2 })
    const items = [imageItem(makeImageFile('a.png')), imageItem(makeImageFile('b.png')), imageItem(makeImageFile('c.png'))]
    const event = firePaste(items)

    expect(event.defaultPrevented).toBe(true)
    expect(onFiles).not.toHaveBeenCalled()
    expect(pu.pasteError.value).toBe('upload.pasteTooMany')
  })

  it('单张超过 maxSizeMB → 拦截 + 提示大小超限', () => {
    const { onFiles, pu } = setup({ maxSizeMB: 10 })
    const bigFile = makeBigImageFile('big.png', 11)
    const event = firePaste([imageItem(bigFile)])

    expect(event.defaultPrevented).toBe(true)
    expect(onFiles).not.toHaveBeenCalled()
    expect(pu.pasteError.value).toBe('upload.pasteTooBig')
  })

  it('enabled=false → 不响应粘贴', () => {
    const enabled = ref(false)
    const { onFiles } = setup({ enabled })
    firePaste([imageItem(makeImageFile())])

    expect(onFiles).not.toHaveBeenCalled()
  })

  it('enabled 从 false 切 true → 恢复响应', async () => {
    const enabled = ref(false)
    const { onFiles } = setup({ enabled })

    firePaste([imageItem(makeImageFile('a.png'))])
    expect(onFiles).not.toHaveBeenCalled()

    enabled.value = true
    firePaste([imageItem(makeImageFile('b.png'))])
    await flushPromises()
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('上传回调抛错 → pasteError 记录错误信息', async () => {
    const onFiles = vi.fn().mockRejectedValue(new Error('上传失败'))
    const { pu } = setup({ onFiles })
    firePaste([imageItem(makeImageFile())])
    await flushPromises()

    expect(pu.pasteError.value).toBe('上传失败')
    expect(pu.isPasteUploading.value).toBe(false)
  })

  it('上传成功后 pasteError 清空', async () => {
    const onFiles = vi.fn()
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockResolvedValueOnce(undefined)
    const { pu } = setup({ onFiles })

    firePaste([imageItem(makeImageFile('a.png'))])
    await flushPromises()
    expect(pu.pasteError.value).toBe('第一次失败')

    firePaste([imageItem(makeImageFile('b.png'))])
    await flushPromises()
    expect(pu.pasteError.value).toBe('')
  })

  it('组件卸载后移除 paste 监听器', () => {
    const { wrapper } = setup()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('paste', expect.any(Function))
    removeSpy.mockRestore()
  })
})
