import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAsset } from '../download'

describe('downloadAsset', () => {
  let createdAnchor: HTMLAnchorElement | null = null
  let anchorClickSpy: ReturnType<typeof vi.fn<() => void>>
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    createdAnchor = null
    anchorClickSpy = vi.fn<() => void>()

    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-blob-uuid')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    appendChildSpy = vi.spyOn(document.body, 'appendChild')
    removeChildSpy = vi.spyOn(document.body, 'removeChild')

    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName)
      if (tagName.toLowerCase() === 'a') {
        createdAnchor = el as HTMLAnchorElement
        vi.spyOn(createdAnchor, 'click').mockImplementation(() => {
          anchorClickSpy()
        })
      }
      return el
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('成功下载时创建 blob、挂载 a 标签、触发 click、移除节点并延迟 10 秒释放 objectURL', async () => {
    const mockBlob = new Blob(['test-data'], { type: 'image/png' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(mockBlob)
    }))

    const promise = downloadAsset('/api/download/file.png', 'artwork.png')
    await promise

    expect(fetch).toHaveBeenCalledWith('/api/download/file.png')
    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob)
    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.download).toBe('artwork.png')
    expect(createdAnchor!.href).toBe('blob:http://localhost/mock-blob-uuid')
    expect(appendChildSpy).toHaveBeenCalledWith(createdAnchor)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(removeChildSpy).toHaveBeenCalledWith(createdAnchor)

    // 执行完毕时尚未立即 revoke
    expect(revokeObjectURLSpy).not.toHaveBeenCalled()

    // 推进 10 秒后触发释放
    vi.advanceTimersByTime(10_000)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/mock-blob-uuid')
  })

  it('缺省 fileName 时使用默认名 download', async () => {
    const mockBlob = new Blob(['data'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(mockBlob)
    }))

    await downloadAsset('/download-url')

    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.download).toBe('download')
  })

  it('HTTP 响应非 2xx 时抛出错误且不触发 a.click 与 URL.createObjectURL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    }))

    await expect(downloadAsset('/not-found.png')).rejects.toThrow('HTTP 404')
    expect(createObjectURLSpy).not.toHaveBeenCalled()
    expect(anchorClickSpy).not.toHaveBeenCalled()
  })

  it('网络错误时直接向外透传', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(downloadAsset('/fail.png')).rejects.toThrow('Network error')
  })
})
