// api 请求核（原生 fetch）防再发锁（2026-10-12 拆 axios 批新增）
// 锁的是「拆掉 axios 后必须与旧实现同形」的行为点：URL 前缀与查询串编码、cookie 随请求、
// JSON 体带 Content-Type 而 FormData/Blob 体不带（WEB-11 反模式）、空体与 204 解包为 undefined、
// 错误体非 JSON 不炸、错误对象 status/code/detail 形状与超时/网络失败兜底文案。改坏任一条这里就红，不等用户报障。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  reset: vi.fn()
}))

// 错误分支里动态 import 的三个模块按最小形状 mock（同 bindRequired401.test.ts 口径）
vi.mock('../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } }
}))
vi.mock('../../stores/artist.js', () => ({
  // #52-2: 401 通路改调 resetSession（$reset 不再承担会话清理）
  useArtistStore: () => ({ resetSession: h.reset })
}))
vi.mock('../../router/index.js', () => ({
  default: {
    currentRoute: { get value() { return { name: 'ArtistDashboard' } } },
    push: (...args: unknown[]) => h.push(...args),
    hasRoute: () => true
  },
  SETUP_ROUTE: { path: '/setup', name: 'SetupWizard' }
}))

import { getJson, postJson, patchJson, deleteJson } from '../modules/http'

/** 取最近一次 fetch 调用的入参 */
function lastCall(): { url: string; init: RequestInit } {
  const call = h.fetch.mock.calls[h.fetch.mock.calls.length - 1]
  return { url: call[0] as string, init: call[1] as RequestInit }
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(() => {
  h.fetch.mockReset()
  h.push.mockClear()
  h.reset.mockClear()
  vi.stubGlobal('fetch', h.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('请求核：URL 与凭据', () => {
  it('URL 一律挂 /api 前缀', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ ok: 1 }))
    await getJson('/artist/ping')
    expect(lastCall().url).toBe('/api/artist/ping')
  })

  it('params 跳过 undefined 与 null，键与值各自编码，空格编成 %20（与 axios 同形）', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ ok: 1 }))
    await getJson('/artist/orders', {
      params: { status: 'wip', q: '张 三', page: 2, slot: undefined, none: null, force: true }
    })
    const url = lastCall().url
    expect(url).toBe('/api/artist/orders?status=wip&q=%E5%BC%A0%20%E4%B8%89&page=2&force=true')
    // 反证：undefined/null 参数不得出现在查询串里（否则服务端按空串校验会误判）
    expect(url).not.toContain('slot')
    expect(url).not.toContain('none')
  })

  it('cookie 必须随请求发出（原 withCredentials: true 的等价物）', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ ok: 1 }))
    await getJson('/auth/me')
    expect(lastCall().init.credentials).toBe('include')
  })
})

describe('请求核：请求体与 Content-Type', () => {
  it('普通对象体走 JSON 并显式声明 application/json', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ ok: 1 }))
    await postJson('/orders', { qq: '10001', price: 200 })
    const { init } = lastCall()
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ qq: '10001', price: 200 }))
  })

  it('FormData 体绝不手设 Content-Type（WEB-11：缺 boundary 的 multipart 头是危险反模式）', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ filePath: 'a.png' }))
    const fd = new FormData()
    fd.append('file', new Blob(['x'], { type: 'image/png' }))
    await postJson('/upload/image', fd, { timeout: 120_000 })
    const { init } = lastCall()
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(Object.keys(headers)).not.toContain('Content-Type')
    expect(init.body).toBe(fd)
  })

  it('Blob 体同样不手设 Content-Type（保留其自带类型）', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ ok: 1 }))
    const blob = new Blob(['x'], { type: 'image/png' })
    await postJson('/upload/note-image', blob, { timeout: 120_000 })
    const headers = lastCall().init.headers as Record<string, string>
    expect(Object.keys(headers)).not.toContain('Content-Type')
    expect(lastCall().init.body).toBe(blob)
  })

  it('无体请求不写 body；调用方 header 原样透传且可覆盖（幂等键/x-anon-token 场景）', async () => {
    // Response 的 body 只能读一次，多次请求必须每次给新实例（真实 fetch 本就如此）
    h.fetch.mockImplementation(() => Promise.resolve(jsonResponse({ ok: 1 })))
    await postJson('/artist/orders/1/cancel', undefined, { headers: { 'idempotency-key': 'k-1' } })
    const { init } = lastCall()
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('k-1')
    await patchJson('/artist/orders/1/status', { status: 'wip' }, { headers: { Accept: 'text/plain' } })
    expect((lastCall().init.headers as Record<string, string>).Accept).toBe('text/plain')
  })
})

describe('请求核：响应解包', () => {
  it('JSON 体解析成对象', async () => {
    h.fetch.mockResolvedValue(jsonResponse({ items: [1, 2], total: 2 }))
    await expect(getJson<{ items: number[]; total: number }>('/artist/orders')).resolves.toEqual({ items: [1, 2], total: 2 })
  })

  it('空响应体与 204 均解包为 undefined（施工图口径；实测服务端无此类端点，对现有调用点零影响）', async () => {
    h.fetch.mockResolvedValue(new Response('', { status: 200 }))
    await expect(patchJson('/artist/orders/1/note', { text: 'x' })).resolves.toBeUndefined()
    h.fetch.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteJson('/artist/orders/1/note/2')).resolves.toBeUndefined()
  })

  it('非 JSON 成功体原样返回文本', async () => {
    h.fetch.mockResolvedValue(new Response('plain-text-body', { status: 200 }))
    await expect(getJson<string>('/calendar/feed')).resolves.toBe('plain-text-body')
  })
})

describe('请求核：错误归一化', () => {
  it('业务错误码：错误对象带 status/code/detail，文案取后端 error 字段', async () => {
    h.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'ORDER_CONFLICT', error: '版本冲突', detail: { version: 3 } }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    }))
    const err = (await postJson('/artist/orders/1/status', { status: 'wip' }).catch(e => e)) as {
      message: string; status?: number; code?: string; detail?: Record<string, unknown>
    }
    expect(err.message).toBe('版本冲突')
    expect(err.status).toBe(409)
    expect(err.code).toBe('ORDER_CONFLICT')
    expect(err.detail).toEqual({ version: 3 })
  })

  it('错误体是非 JSON（反代 HTML 错误页）时不炸，走兜底文案且仍挂上 status', async () => {
    h.fetch.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    const err = (await getJson('/artist/orders').catch(e => e)) as { message: string; status?: number }
    expect(err.status).toBe(502)
    expect(err.message).toBe('common.networkError')
  })

  it('超时：AbortController 中止后归入网络错误兜底文案（不再抛裸 AbortError）', async () => {
    h.fetch.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')))
      })
    )
    const err = (await getJson('/artist/slow', { timeout: 5 }).catch(e => e)) as { message: string; status?: number }
    expect(err.message).toBe('common.networkError')
    expect(err.status).toBeUndefined()
  })

  it('网络层直接失败（fetch reject，无响应）也走兜底文案', async () => {
    h.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = (await getJson('/artist/orders').catch(e => e)) as { message: string }
    expect(err.message).toBe('common.networkError')
  })
})

describe('请求核：超时覆盖响应体读取', () => {
  it('响应头已到但响应体悬挂时，超时中止读体并归入网络错误（旧实现清计时器过早）', async () => {
    let aborted = false
    const hanging = {
      ok: true,
      status: 200,
      text: () => new Promise((_resolve, reject) => {
        signalRef?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    } as unknown as Response
    let signalRef: AbortSignal | undefined
    h.fetch.mockImplementation((_url: string, init: RequestInit) => {
      signalRef = init.signal ?? undefined
      return Promise.resolve(hanging)
    })

    const err = (await getJson('/artist/hanging-body', { timeout: 10 }).catch(e => e)) as { message: string; status?: number }
    expect(aborted).toBe(true)
    expect(err.message).toBe('common.networkError')
    expect(err.status).toBeUndefined()
  })
})
