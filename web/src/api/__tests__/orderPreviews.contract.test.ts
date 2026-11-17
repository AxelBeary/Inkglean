// 迁移 v81 契约回归：过程稿/免费修改额度端点的 URL 与方法（对照 _CONTRACT.md §三/§四）
// 组件测试断言的是「调了哪个 api 方法」，这里断言「api 方法打到哪个路径/方法」，两层合起来才算契约落地。
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Call {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  url: string
  data?: unknown
  config?: unknown
}

const h = vi.hoisted(() => ({ calls: [] as Call[] }))

vi.mock('../modules/http', () => {
  const record = (method: Call['method']) => (url: string, data?: unknown, config?: unknown) => {
    h.calls.push({ method, url, data, config })
    return Promise.resolve({ ok: true })
  }
  return {
    getJson: (url: string, config?: unknown) => {
      h.calls.push({ method: 'GET', url, config })
      return Promise.resolve({ ok: true })
    },
    postJson: record('POST'),
    patchJson: record('PATCH'),
    putJson: record('PUT'),
    deleteJson: (url: string, config?: unknown) => {
      h.calls.push({ method: 'DELETE', url, config })
      return Promise.resolve({ ok: true })
    }
  }
})

import { artistApi } from '../modules/artist'
import { uploadApi } from '../modules/upload'

beforeEach(() => {
  h.calls.length = 0
})

describe('迁移 v81: 画师侧过程稿端点（契约 §三）', () => {
  it('GET /artist/orders/:id/previews', async () => {
    await artistApi.getOrderPreviews(7)
    expect(h.calls[0]).toMatchObject({ method: 'GET', url: '/artist/orders/7/previews' })
  })

  it('POST /artist/orders/:id/previews 带 filePath', async () => {
    await artistApi.addOrderPreview(7, { filePath: 'previews/7/abc.png', caption: '线稿' })
    expect(h.calls[0]).toMatchObject({
      method: 'POST',
      url: '/artist/orders/7/previews',
      data: { filePath: 'previews/7/abc.png', caption: '线稿' }
    })
  })

  it('PATCH /artist/orders/:id/previews/:pid', async () => {
    await artistApi.updateOrderPreview(7, 3, { visible: false })
    expect(h.calls[0]).toMatchObject({
      method: 'PATCH',
      url: '/artist/orders/7/previews/3',
      data: { visible: false }
    })
  })

  it('DELETE /artist/orders/:id/previews/:pid', async () => {
    await artistApi.deleteOrderPreview(7, 3)
    expect(h.calls[0]).toMatchObject({ method: 'DELETE', url: '/artist/orders/7/previews/3' })
  })

  it('PATCH /artist/orders/:id/preview-settings（订单级开关 + 额度同端点）', async () => {
    await artistApi.updateOrderPreviewSettings(7, { freeRevisionLimit: 2 })
    expect(h.calls[0]).toMatchObject({
      method: 'PATCH',
      url: '/artist/orders/7/preview-settings',
      data: { freeRevisionLimit: 2 }
    })
  })
})

describe('迁移 v81: 过程稿上传端点（契约 §四）', () => {
  it('POST /upload/preview：FormData 请求体、120s 超时、不手设 Content-Type', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    await uploadApi.preview(blob)

    expect(h.calls[0].method).toBe('POST')
    expect(h.calls[0].url).toBe('/upload/preview')
    expect(h.calls[0].data).toBeInstanceOf(FormData)
    const config = h.calls[0].config as { headers?: Record<string, string>; timeout?: number }
    expect(config.timeout).toBe(120_000)
    expect(config.headers?.['Content-Type']).toBeUndefined()
  })
})
