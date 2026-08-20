// 压图改尺寸工具纯函数测试（812-tools-a：③压图改尺寸）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import {
  IMAGE_PRESETS,
  targetSize,
  autoHeight,
  coverRect,
  formatBytes,
  isValidCustomDims,
  resizeImageToBlob,
  IMAGE_RESIZE_ERROR
} from '../image-resize'

describe('targetSize 预设与自定义解析', () => {
  it('预设返回固定宽高（微博高为 null=等比）', () => {
    expect(targetSize('xhs', '', '')).toEqual({ width: 1242, height: 1660 })
    expect(targetSize('weibo', '', '')).toEqual({ width: 1080, height: null })
    expect(targetSize('avatar', '', '')).toEqual({ width: 500, height: 500 })
  })

  it('自定义宽高取整；高留空/空串为等比', () => {
    expect(targetSize('custom', '800.6', '600.4')).toEqual({ width: 801, height: 600 })
    expect(targetSize('custom', '800', '')).toEqual({ width: 800, height: null })
    expect(targetSize('custom', '800', null)).toEqual({ width: 800, height: null })
  })

  it('预设清单只含三个平台预设', () => {
    expect(IMAGE_PRESETS.map((p) => p.key)).toEqual(['xhs', 'weibo', 'avatar'])
  })
})

describe('autoHeight / coverRect 缩放数学', () => {
  it('等比高度按源图比例换算且至少 1px', () => {
    expect(autoHeight(1000, 500, 1080)).toBe(540)
    expect(autoHeight(10, 1, 1080)).toBe(108)
  })

  it('cover 裁切：横图进方框按高满铺、左右居中裁切', () => {
    expect(coverRect(1000, 500, 500, 500)).toEqual({ dw: 1000, dh: 500, dx: -250, dy: 0 })
  })

  it('cover 裁切：竖图进方框按宽满铺、上下居中裁切', () => {
    expect(coverRect(500, 1000, 500, 500)).toEqual({ dw: 500, dh: 1000, dx: 0, dy: -250 })
  })

  it('等比同比例不裁切（dx/dy 为 0）', () => {
    expect(coverRect(1000, 1000, 500, 500)).toEqual({ dw: 500, dh: 500, dx: 0, dy: 0 })
  })
})

describe('formatBytes / isValidCustomDims', () => {
  it('体积展示 B/KB/MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('自定义尺寸须为 1-10000 的整数（高可空）', () => {
    expect(isValidCustomDims(800, 600)).toBe(true)
    expect(isValidCustomDims(800, '')).toBe(true)
    expect(isValidCustomDims(0, 600)).toBe(false)
    expect(isValidCustomDims(800, 10001)).toBe(false)
    expect(isValidCustomDims(800.5, 600)).toBe(false)
  })
})

describe('resizeImageToBlob canvas 压缩链路', () => {
  let getContextSpy: MockInstance<HTMLCanvasElement['getContext']> | undefined
  let toBlobSpy: MockInstance<HTMLCanvasElement['toBlob']> | undefined
  let ctxStub: { drawImage: ReturnType<typeof vi.fn> }
  const img = { naturalWidth: 1000, naturalHeight: 500 }

  beforeEach(() => {
    ctxStub = { drawImage: vi.fn() }
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctxStub as unknown as CanvasRenderingContext2D)
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(new Blob(['fake-webp'], { type: 'image/webp' }))
    })
  })

  afterEach(() => {
    getContextSpy?.mockRestore()
    toBlobSpy?.mockRestore()
  })

  it('按目标尺寸建画布、cover 绘制并以 webp+质量导出', async () => {
    const blob = await resizeImageToBlob(img as unknown as HTMLImageElement, { width: 500, height: 500, quality: 0.75 })
    expect(blob.type).toBe('image/webp')
    expect(blob.size).toBeGreaterThan(0)
    expect(getContextSpy).toHaveBeenCalledWith('2d')
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.75)
    expect(ctxStub.drawImage).toHaveBeenCalledWith(img, -250, 0, 1000, 500)
  })

  it('目标尺寸非法时拒绝（不高不低）', async () => {
    await expect(resizeImageToBlob(img as unknown as HTMLImageElement, { width: 0, height: 100, quality: 0.8 })).rejects.toThrow(IMAGE_RESIZE_ERROR.INVALID_TARGET_SIZE)
  })
})
