// WEB-11 回归测试：upload API 不得手动设 Content-Type（让 axios/浏览器自动带 boundary）
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface PostJsonCall {
  url: string
  data: unknown
  config: { headers?: Record<string, string>; timeout?: number }
}

const h = vi.hoisted(() => ({
  calls: [] as PostJsonCall[],
  postJson: vi.fn((url: string, data: unknown, config: { headers?: Record<string, string>; timeout?: number }) => {
    h.calls.push({ url, data, config })
    return Promise.resolve({ filePath: 'test/path.png', url: '/uploads/test/path.png' })
  })
}))

vi.mock('../modules/http', () => ({
  postJson: (url: string, data: unknown, config: unknown) => h.postJson(url, data, config as { headers?: Record<string, string>; timeout?: number })
}))

import { uploadApi } from '../modules/upload'

describe('WEB-11: uploadApi 不手动设 Content-Type', () => {
  beforeEach(() => {
    h.calls.length = 0
    h.postJson.mockClear()
  })

  it('image() 不传 Content-Type header', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    await uploadApi.image(blob)
    const call = h.calls[0]
    // 要么没有 headers 属性，要么 headers 里不含 Content-Type
    expect(call.config.headers?.['Content-Type']).toBeUndefined()
    // timeout 仍应保留
    expect(call.config.timeout).toBe(120_000)
  })

  it('reference() 不传 Content-Type header（仅保留调用方自定义 header）', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    await uploadApi.reference(blob, { headers: { 'x-anon-token': 'tok123' } })
    const call = h.calls[0]
    expect(call.config.headers?.['Content-Type']).toBeUndefined()
    expect(call.config.headers?.['x-anon-token']).toBe('tok123')
  })

  it('deliverable() 不传 Content-Type header', async () => {
    const blob = new Blob(['fake'], { type: 'application/octet-stream' })
    await uploadApi.deliverable(blob)
    const call = h.calls[0]
    expect(call.config.headers?.['Content-Type']).toBeUndefined()
  })

  it('noteImage() 不传 Content-Type header', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    await uploadApi.noteImage(blob)
    const call = h.calls[0]
    expect(call.config.headers?.['Content-Type']).toBeUndefined()
  })

  it('所有上传方法传递 FormData 实例作为请求体', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    await uploadApi.image(blob)
    await uploadApi.reference(blob)
    await uploadApi.deliverable(blob)
    await uploadApi.noteImage(blob)
    for (const call of h.calls) {
      expect(call.data).toBeInstanceOf(FormData)
    }
  })
})
