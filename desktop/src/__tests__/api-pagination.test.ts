// 审计 #22 条目 4：分页首页被当全量用 ⇒ 待审数/在账数/托盘计数长期低报
// 钉住：fetchMessages / fetchOrders 按服务端最大页逐页累积、请求 URL 带 page/pageSize、
//       total 原样上报（计数侧读它）、硬上限与空页两条停止条件都真的停。
// 补口（#22-4 追加）：短页即停 + 页号按服务端**实用**页长推进（数据变动/夹页都不重抓同页）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fetchMessages, fetchOrders } from '../api/artist'
import { API_BASE } from '../config'
import { useAuthStore } from '../stores/auth'

const TOKEN = 'desk-token-page'

interface Recorded { path: string }

let requests: Recorded[] = []

interface StubBody {
  items: unknown[]
  total: number
  /** 服务端实用页长（可小于请求值＝被夹小）；undefined 时按请求值回显 */
  pageSize?: number
}

interface StubOptions {
  /** false＝模拟不回显 pageSize 的服务端：走累积步长的首页实测退路 */
  echoPageSize?: boolean
}

function stubPages(
  responder: (page: number, pageSize: number) => StubBody,
  options: StubOptions = {}
): void {
  const echo = options.echoPageSize ?? true
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const path = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url
    requests.push({ path })
    const qs = new URLSearchParams(path.split('?')[1] ?? '')
    const page = Number(qs.get('page') ?? '1')
    const pageSize = Number(qs.get('pageSize') ?? '0')
    const body = responder(page, pageSize)
    const echoed = echo ? (body.pageSize ?? pageSize) : undefined
    return new Response(JSON.stringify({ ...body, page, ...(echoed === undefined ? {} : { pageSize: echoed }) }), { status: 200 })
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

// ─── 补口（#22-4 追加）：短页即停 + 页号按服务端实用页长推进 ───

describe('collectPages 短页与夹页（#22-4 补口）', () => {
  it('翻页中数据变动致短页 → 立刻停，不把同一页重抓成重复行', async () => {
    // total 报 250，第 2 页实际只剩 60 条（翻页途中被删了一批）。少了「短页即停」这一刀时，
    // 页号会按已取行数推成 floor(160/100)+1=2 —— 算回第 2 页，那 60 条被再灌一遍，
    // 结果是行重复 + 在账数虚高 + Vue 重复 key 告警，比原来的低报更难查。
    stubPages((page, pageSize) => ({
      items: page === 1 ? rows('m', pageSize) : page === 2 ? rows('m', 60, pageSize) : rows('m', pageSize, 160),
      total: 250
    }))

    const r = await fetchMessages()

    expect(paths()).toEqual([
      '/api/artist/messages?page=1&pageSize=100',
      '/api/artist/messages?page=2&pageSize=100'
    ])
    expect(r.items).toHaveLength(160)
    expect(new Set(r.items.map(m => m.id)).size).toBe(160)
    expect(r.total).toBe(250)
    expect(r.truncated).toBe(true) // 短页即停＝有界，计数侧仍读 total，不受影响
  })

  it('服务端把 pageSize 夹小（请求 200 实用 100）→ 按实用页长推进，不重抓第 1 页', async () => {
    const total = 320
    stubPages((page, requested) => {
      const step = Math.min(requested, 100) // 服务端自带上限：给不了 200
      const remaining = Math.max(0, total - (page - 1) * step)
      return { items: rows('o', Math.min(step, remaining), (page - 1) * step), total, pageSize: step }
    })

    const r = await fetchOrders()

    expect(paths()).toEqual([
      '/api/artist/orders?page=1&pageSize=200',
      '/api/artist/orders?page=2&pageSize=100',
      '/api/artist/orders?page=3&pageSize=100',
      '/api/artist/orders?page=4&pageSize=100'
    ])
    expect(r.items).toHaveLength(320)
    expect(new Set(r.items.map(o => o.id)).size).toBe(320)
    expect(r.truncated).toBe(false)
  })

  it('服务端不回显 pageSize 时退回首页实测页长，夹页同样不重抓', async () => {
    const total = 250
    stubPages((page, requested) => {
      const step = Math.min(requested, 50) // 留言侧夹到 50
      const remaining = Math.max(0, total - (page - 1) * step)
      return { items: rows('m', Math.min(step, remaining), (page - 1) * step), total }
    }, { echoPageSize: false })

    const r = await fetchMessages()

    expect(paths()).toEqual([
      '/api/artist/messages?page=1&pageSize=100',
      '/api/artist/messages?page=2&pageSize=50',
      '/api/artist/messages?page=3&pageSize=50',
      '/api/artist/messages?page=4&pageSize=50',
      '/api/artist/messages?page=5&pageSize=50'
    ])
    expect(r.items).toHaveLength(250)
    expect(new Set(r.items.map(m => m.id)).size).toBe(250)
    expect(r.truncated).toBe(false)
  })
})
