// 审计 #22 条目 4：分页首页被当全量用 ⇒ 待审数/在账数/托盘计数长期低报
// 钉住：fetchMessages / fetchOrders 按服务端最大页逐页累积、请求 URL 带 page/pageSize、
//       total 原样上报（计数侧读它）、硬上限与空页两条停止条件都真的停。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchMessages, fetchOrders } from '../api/artist'
import { API_BASE } from '../config'
import { useAuthStore } from '../stores/auth'

const TOKEN = 'desk-token-page'

interface Recorded { path: string }

let requests: Recorded[] = []

function stubPages(responder: (page: number, pageSize: number) => { items: unknown[]; total: number }): void {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const path = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url
    requests.push({ path })
    const qs = new URLSearchParams(path.split('?')[1] ?? '')
    const page = Number(qs.get('page') ?? '1')
    const pageSize = Number(qs.get('pageSize') ?? '0')
    const body = responder(page, pageSize)
    return new Response(JSON.stringify({ ...body, page, pageSize }), { status: 200 })
  }))
}

/** 生成 n 条可辨识的行 */
function rows(prefix: string, n: number, offset = 0): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ id: offset + i + 1, name: `${prefix}-${offset + i + 1}` }))
}

function paths(): string[] {
  return requests.map(r => r.path)
}

beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().token = TOKEN
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('fetchMessages 逐页累积（#22-4）', () => {
  it('不传 page/pageSize 的旧写法已消失：请求带最大页 100 与递增页号', async () => {
    stubPages((page, pageSize) => ({
      // 第 3 页只剩 50 条（total=250）——按真实末页形状给
      items: page < 3 ? rows('m', pageSize, (page - 1) * pageSize) : rows('m', 50, 200),
      total: 250
    }))

    const r = await fetchMessages()

    expect(paths()).toEqual([
      '/api/artist/messages?page=1&pageSize=100',
      '/api/artist/messages?page=2&pageSize=100',
      '/api/artist/messages?page=3&pageSize=100'
    ])
    expect(r.items).toHaveLength(250)
    expect(r.total).toBe(250)
    expect(r.truncated).toBe(false)
  })

  it('总量不足一页时只发一次请求（不为小画师多加往返）', async () => {
    stubPages(() => ({ items: rows('m', 8), total: 8 }))

    const r = await fetchMessages()

    expect(requests).toHaveLength(1)
    expect(r.items).toHaveLength(8)
    expect(r.truncated).toBe(false)
  })

  it('服务端返回空页即停：total 虚高也不会死循环', async () => {
    stubPages((page, pageSize) => ({
      items: page === 1 ? rows('m', pageSize) : [],
      total: 300
    }))

    const r = await fetchMessages()

    expect(requests).toHaveLength(2)
    expect(r.items).toHaveLength(100)
    expect(r.total).toBe(300)
    expect(r.truncated).toBe(true)
  })

  it('硬上限 1000 行封顶：极端数据量下翻页次数有界，且标 truncated', async () => {
    stubPages((page, pageSize) => ({ items: rows('m', pageSize, (page - 1) * pageSize), total: 50_000 }))

    const r = await fetchMessages()

    expect(requests).toHaveLength(10) // 1000 / 100
    expect(r.items).toHaveLength(1000)
    expect(r.total).toBe(50_000) // 计数仍读 total，不受截断影响
    expect(r.truncated).toBe(true)
  })
})

describe('fetchOrders 逐页累积（#22-4）', () => {
  it('用服务端允许的 pageSize 200，并把 total 交给计数侧', async () => {
    stubPages((page, pageSize) => ({
      items: page === 1 ? rows('o', pageSize) : rows('o', 120, 200),
      total: 320
    }))

    const r = await fetchOrders()

    expect(paths()[0]).toBe('/api/artist/orders?page=1&pageSize=200')
    expect(r.items).toHaveLength(320)
    expect(r.total).toBe(320)
    expect(r.truncated).toBe(false)
    // 默认口径下首页只有 50 条——这正是修复前「在账数封顶 50」的根因
    expect(paths().some(p => !p.includes('pageSize='))).toBe(false)
  })
})
