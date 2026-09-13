// 波2 拖拽改期批 · 路C：`api/errors.ts` 契约层 + `api/artist.ts` 的失败落点与写函数请求形状。
// 钉住的东西（编号照派工提示词 §三/§四）：
//   错误契约：ApiError 把 status/code/detail **原样带上来**（409 判定的前提），判定函数只判不处置；
//   toApiError 落点：getJson/putJson 在 !res.ok 时抛 ApiError，非 JSON 错误体也不炸；
//   三个新写函数的 URL / method / 请求体字段名 / 是否带 version（口径 3 的取证面：api 层允许省 version，
//   但桌面 store 写路径一律带——那半边由 schedule-store-write.test.ts 钉）。
// fetch 一律真桩（vi.stubGlobal），不打真网络。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  ApiError,
  ORDER_CONFLICT,
  apiErrorMessage,
  isOrderConflict,
  isSessionExpired
} from '../api/errors'
import { fetchQueue, reorderQueue, updateDeadline, updateStartDate } from '../api/artist'
import { API_BASE } from '../config'
import { useAuthStore } from '../stores/auth'

const TOKEN = 'desk-token-abc'

// ─── fetch 桩工具 ───

interface RecordedRequest {
  url: string
  /** 去掉 API_BASE 前缀后的路径（含 query），便于用 '/api/...' 写键 */
  path: string
  method: string
  body: unknown
  headers: Record<string, string>
}

let requests: RecordedRequest[] = []

/** 剥前缀：API_BASE 为空串时（发布构建未注入）路径就是全串，两种环境同一套断言 */
function pathOf(url: string): string {
  return url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url
}

function record(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  const url = String(input)
  const body = typeof init?.body === 'string' && init.body.length > 0
    ? JSON.parse(init.body) as unknown
    : null
  return {
    url,
    path: pathOf(url),
    method: init?.method ?? 'GET',
    body,
    headers: { ...(init?.headers as Record<string, string> | undefined) }
  }
}

/** 单次响应桩：每个请求都回同一个响应（请求本身照常记账，便于断言形状） */
function stubFetchOnce(responder: (req: RecordedRequest) => { status: number; body: unknown; raw?: string }): void {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = record(input, init)
    requests.push(req)
    const r = responder(req)
    const payload = typeof r.raw === 'string' ? r.raw : JSON.stringify(r.body)
    return new Response(payload, { status: r.status })
  }))
}

/** 取第 n 个请求（1 基），越界直接红——不给"没发请求"蒙混过关 */
function reqAt(n: number): RecordedRequest {
  expect(requests.length).toBeGreaterThanOrEqual(n)
  return requests[n - 1]
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// ══════════════════════════════════════════════════════════════
// ① errors.ts 契约层
// ══════════════════════════════════════════════════════════════

describe('ApiError（把 status/code/detail 原样带上来：波2 乐观锁回滚重拉的前提）', () => {
  it('四个字段各归各位，name 钉死 ApiError，且真是 Error 子类', () => {
    const err = new ApiError(409, ORDER_CONFLICT, '排期已被别人改过', { currentVersion: 8 })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(409)
    expect(err.code).toBe('ORDER_CONFLICT')
    expect(err.message).toBe('排期已被别人改过')
    expect(err.detail).toEqual({ currentVersion: 8 })
  })
  it('响应体没带 code / 没带 detail 时：code 为 null、detail 为 undefined（不许编一个码出来）', () => {
    const err = new ApiError(500, null, '服务器炸了')
    expect(err.code).toBeNull()
    expect(err.detail).toBeUndefined()
    expect(err.status).toBe(500)
  })
  it('status 与 code 互不掩盖：401 + 业务码也照原样留着（判定层各取所需）', () => {
    const err = new ApiError(401, 'AUTH_EXPIRED', '登录已过期')
    expect(err.status).toBe(401)
    expect(err.code).toBe('AUTH_EXPIRED')
  })
  it('可直接抛出并被 catch 成 ApiError（不是被包成普通 Error 丢字段）', () => {
    const boom = (): never => { throw new ApiError(403, null, '无权限') }
    let caught: unknown
    try {
      boom()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(403)
  })
})

describe('ORDER_CONFLICT 常量（跨端唯一耦合点：值钉死在 server/src/shared/errors.ts）', () => {
  it('字面量不许改：改了就是与后端断链', () => {
    expect(ORDER_CONFLICT).toBe('ORDER_CONFLICT')
  })
})

describe('isSessionExpired（401/403 只判定，不处置——波2 拍板：不打断编辑、不自动跳登录页）', () => {
  it('401 与 403 判为会话失效', () => {
    expect(isSessionExpired(new ApiError(401, null, '未认证'))).toBe(true)
    expect(isSessionExpired(new ApiError(403, null, '无权限'))).toBe(true)
  })
  it('其它状态码一律 false（409 冲突、4xx 校验、5xx 服务端都不算会话失效）', () => {
    for (const status of [400, 404, 409, 422, 500, 502, 503]) {
      expect(isSessionExpired(new ApiError(status, 'WHATEVER', 'x'))).toBe(false)
    }
  })
  it('非 ApiError（网络断、未登录抛的普通 Error、null、字符串）一律 false', () => {
    expect(isSessionExpired(new Error('Failed to fetch'))).toBe(false)
    expect(isSessionExpired(new TypeError('network error'))).toBe(false)
    expect(isSessionExpired(null)).toBe(false)
    expect(isSessionExpired(undefined)).toBe(false)
    expect(isSessionExpired('401')).toBe(false)
    expect(isSessionExpired({ status: 401 })).toBe(false) // 形状像也不算
  })
})

describe('isOrderConflict（只看业务码，不看 HTTP 状态）', () => {
  it('code 为 ORDER_CONFLICT 即冲突，与 status 无关（后端哪天换状态码也不漏判）', () => {
    for (const status of [400, 409, 423, 500]) {
      expect(isOrderConflict(new ApiError(status, ORDER_CONFLICT, '版本对不上'))).toBe(true)
    }
  })
  it('status 409 但 code 缺失或不同 → 不算冲突（不许拿状态码猜业务语义）', () => {
    expect(isOrderConflict(new ApiError(409, null, '网关冲突页'))).toBe(false)
    expect(isOrderConflict(new ApiError(409, 'QUEUE_LENGTH', '队列长度不符'))).toBe(false)
  })
  it('非 ApiError 一律 false', () => {
    expect(isOrderConflict(new Error(ORDER_CONFLICT))).toBe(false)
    expect(isOrderConflict({ code: ORDER_CONFLICT })).toBe(false)
    expect(isOrderConflict(null)).toBe(false)
  })
})

describe('apiErrorMessage（给既有 catch 分支用的安全取值）', () => {
  it('ApiError 与普通 Error 有原话就还给原话', () => {
    expect(apiErrorMessage(new ApiError(400, 'BAD_INPUT', '截稿日不得早于开工日'), '兜底'))
      .toBe('截稿日不得早于开工日')
    expect(apiErrorMessage(new Error('网络断开'), '兜底')).toBe('网络断开')
  })
  it('空 message（含空串 ApiError）落 fallback——不给页面留一行空白提示', () => {
    expect(apiErrorMessage(new ApiError(500, null, ''), '兜底')).toBe('兜底')
    expect(apiErrorMessage(new Error(''), '兜底')).toBe('兜底')
  })
  it('非 Error（断网抛的字符串、null、undefined、对象）一律 fallback，永不抛错', () => {
    expect(apiErrorMessage('boom', '兜底')).toBe('兜底')
    expect(apiErrorMessage(null, '兜底')).toBe('兜底')
    expect(apiErrorMessage(undefined, '兜底')).toBe('兜底')
    expect(apiErrorMessage({ message: '假 Error' }, '兜底')).toBe('兜底')
  })
})

// ══════════════════════════════════════════════════════════════
// ② artist.ts：toApiError 落点（打真 fetch 桩）
// ══════════════════════════════════════════════════════════════

describe('getJson 失败落点（fetchQueue）', () => {
  it('401 + JSON 错误体 → 抛 ApiError，status/code/message 全来自后端原话，会话判定生效', async () => {
    stubFetchOnce(() => ({
      status: 401,
      body: { error: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' }
    }))
    useAuthStore().token = TOKEN
    const err = await fetchQueue().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(401)
    expect(apiErr.code).toBe('TOKEN_EXPIRED')
    expect(apiErr.message).toBe('登录已过期，请重新登录')
    expect(isSessionExpired(apiErr)).toBe(true)
    expect(isOrderConflict(apiErr)).toBe(false)
  })

  it('409 + ORDER_CONFLICT → 抛 ApiError 且 detail 原样保留（不强解析、不吞）', async () => {
    stubFetchOnce(() => ({
      status: 409,
      body: { error: '排期已被别人改过', code: ORDER_CONFLICT, detail: { currentVersion: 8 } }
    }))
    useAuthStore().token = TOKEN
    const err = await fetchQueue().catch((e: unknown) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(isOrderConflict(err)).toBe(true)
    expect(err.detail).toEqual({ currentVersion: 8 })
  })

  it('错误体不是 JSON（网关 HTML 页）→ 不炸，退回带 status 的通用文案，code 为 null', async () => {
    stubFetchOnce(() => ({
      status: 502,
      body: null,
      raw: '<html><body>502 Bad Gateway</body></html>'
    }))
    useAuthStore().token = TOKEN
    const err = await fetchQueue().catch((e: unknown) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.code).toBeNull()
    expect(err.message).toBe('请求失败（502）')
  })

  it('后端 code 不是字符串（脏数据）→ 按 null 处理，不把对象当码带上来', async () => {
    stubFetchOnce(() => ({ status: 400, body: { error: '参数不符', code: { bad: true } } }))
    useAuthStore().token = TOKEN
    const err = await fetchQueue().catch((e: unknown) => e) as ApiError
    expect(err.code).toBeNull()
    expect(err.message).toBe('参数不符')
  })

  it('成功路径：GET + Bearer 头 + 正确 URL，且不发第二枪', async () => {
    stubFetchOnce(req => req.path.includes('zone=buffer')
      ? { status: 200, body: [] }
      : { status: 200, body: [{ id: 1 }] })
    useAuthStore().token = TOKEN
    const rows = await fetchQueue()
    expect(rows).toEqual([{ id: 1 }])
    expect(requests).toHaveLength(1)
    expect(reqAt(1).path).toBe('/api/artist/queue')
    expect(reqAt(1).url).toBe(`${API_BASE}/api/artist/queue`)
    expect(reqAt(1).method).toBe('GET')
    expect(reqAt(1).headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(reqAt(1).body).toBeNull() // GET 不带请求体
  })

  it('未登录（无 token）：抛普通 Error 且一个请求都不发（本地模式禁调云端接口的落点）', async () => {
    stubFetchOnce(() => ({ status: 200, body: [] }))
    const err = await fetchQueue().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ApiError)
    expect((err as Error).message).toBe('未登录：云端数据接口仅限云端模式调用')
    expect(requests).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// ③ artist.ts：波2 三个写函数的请求形状
// ══════════════════════════════════════════════════════════════

describe('updateDeadline（PUT …/orders/:id/deadline）', () => {
  it('URL / method / 字段名 deadline / 带 version，且 Content-Type 与 Bearer 齐', async () => {
    stubFetchOnce(() => ({
      status: 200,
      body: { id: 12, version: 8, deadline: '2026-10-20', start_date: '2026-10-05', startDate: '2026-10-05' }
    }))
    const auth = useAuthStore()
    auth.token = TOKEN
    const res = await updateDeadline(12, '2026-10-20', { version: 7 })
    expect(res.version).toBe(8) // 新 version 交回调用方接力（口径 2 的取货口）
    expect(requests).toHaveLength(1)
    const r = reqAt(1)
    expect(r.path).toBe('/api/artist/orders/12/deadline')
    expect(r.url).toBe(`${API_BASE}/api/artist/orders/12/deadline`)
    expect(r.method).toBe('PUT')
    expect(r.body).toEqual({ deadline: '2026-10-20', version: 7 })
    expect(r.headers['Content-Type']).toBe('application/json')
    expect(r.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('deadline 传 null 是合法写（清空截稿日），字段仍在', async () => {
    stubFetchOnce(() => ({ status: 200, body: { id: 12, version: 9, deadline: null, start_date: null } }))
    useAuthStore().token = TOKEN
    await updateDeadline(12, null, { version: 8 })
    expect(reqAt(1).body).toEqual({ deadline: null, version: 8 })
  })

  it('不传 options 时请求体**没有** version 字段（＝后端"读当前版本再写"兼容路径：桌面 store 不许走这条）', async () => {
    stubFetchOnce(() => ({ status: 200, body: { id: 12, version: 9, deadline: null, start_date: null } }))
    useAuthStore().token = TOKEN
    await updateDeadline(12, '2026-10-20')
    const body = reqAt(1).body as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['deadline'])
    expect('version' in body).toBe(false)
  })

  it('失败抛 ApiError：400 交叉校验的原话与业务码都带上来', async () => {
    stubFetchOnce(() => ({
      status: 400,
      body: { error: '截稿日不得早于开工日', code: 'INVALID_DEADLINE' }
    }))
    useAuthStore().token = TOKEN
    const err = await updateDeadline(12, '2026-01-01', { version: 7 }).catch((e: unknown) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('INVALID_DEADLINE')
    expect(apiErrorMessage(err, '')).toBe('截稿日不得早于开工日')
  })
})

describe('updateStartDate（PUT …/orders/:id/start-date）', () => {
  it('URL 走 kebab 的 start-date，但请求体字段名是驼峰 startDate（与后端 schema 一字不差）', async () => {
    stubFetchOnce(() => ({
      status: 200,
      body: { id: 12, version: 11, deadline: '2026-10-12', start_date: '2026-10-08', startDate: '2026-10-08' }
    }))
    useAuthStore().token = TOKEN
    const res = await updateStartDate(12, '2026-10-08', { version: 10 })
    expect(res.version).toBe(11)
    expect(reqAt(1).path).toBe('/api/artist/orders/12/start-date')
    expect(reqAt(1).method).toBe('PUT')
    expect(reqAt(1).body).toEqual({ startDate: '2026-10-08', version: 10 })
    expect(reqAt(1).body).not.toMatchObject({ start_date: '2026-10-08' })
  })

  it('version 与 startDate 同层（不套 body 壳），且缺 options 时同样不带 version 键', async () => {
    stubFetchOnce(() => ({ status: 200, body: { id: 1, version: 2, deadline: null, start_date: null } }))
    useAuthStore().token = TOKEN
    await updateStartDate(1, '2026-10-08')
    expect(reqAt(1).body).toEqual({ startDate: '2026-10-08' })
  })

  it('409 冲突经 putJson 落点仍是 ApiError（写路径判定 409 的唯一通道）', async () => {
    stubFetchOnce(() => ({
      status: 409,
      body: { error: '排期已被别人改过', code: ORDER_CONFLICT, detail: { currentVersion: 42 } }
    }))
    useAuthStore().token = TOKEN
    const err = await updateStartDate(12, '2026-10-08', { version: 10 }).catch((e: unknown) => e) as ApiError
    expect(isOrderConflict(err)).toBe(true)
    expect(isSessionExpired(err)).toBe(false)
    expect(err.detail).toEqual({ currentVersion: 42 })
  })
})

describe('reorderQueue（PUT /api/artist/queue/reorder）', () => {
  it('请求体只有 orderedIds 一个字段（整段正式区新顺序，无 version 字段）', async () => {
    stubFetchOnce(() => ({ status: 200, body: [] }))
    useAuthStore().token = TOKEN
    await reorderQueue([3, 1, 2])
    const r = reqAt(1)
    expect(r.path).toBe('/api/artist/queue/reorder')
    expect(r.method).toBe('PUT')
    expect(r.body).toEqual({ orderedIds: [3, 1, 2] })
    expect(Object.keys(r.body as Record<string, unknown>)).toEqual(['orderedIds'])
    expect(r.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('空数组照原样发出（后端 QUEUE_EMPTY 兜）：api 层不做二次校验也不偷偷拦', async () => {
    stubFetchOnce(() => ({ status: 200, body: [] }))
    useAuthStore().token = TOKEN
    await reorderQueue([])
    expect(reqAt(1).body).toEqual({ orderedIds: [] })
  })

  it('失败（400 队列长度不符）抛 ApiError 带 code，供上层与 409 分开处置', async () => {
    stubFetchOnce(() => ({ status: 400, body: { error: '队列长度不符', code: 'QUEUE_LENGTH' } }))
    useAuthStore().token = TOKEN
    const err = await reorderQueue([1]).catch((e: unknown) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('QUEUE_LENGTH')
    expect(isOrderConflict(err)).toBe(false)
  })

  it('未登录时写函数同样零请求（与读接口同一条门禁）', async () => {
    stubFetchOnce(() => ({ status: 200, body: [] }))
    const err = await reorderQueue([1, 2]).catch((e: unknown) => e) as Error
    expect(err.message).toBe('未登录：云端数据接口仅限云端模式调用')
    expect(requests).toHaveLength(0)
  })
})
