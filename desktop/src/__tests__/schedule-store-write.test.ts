// 波2 拖拽改期批 · 路C：`stores/schedule.ts` 写路径口径哨兵（只写测试，不动实现）。
// 钉住的红线（编号照派工提示词 §四）：
//   口径 1/2/3 写序 + version 接力 + 一律带 version → 「moveScheduleRange 成功」
//   口径 4 钳制透传 → 「钳制在 store 侧的语义」
//   口径 5 失败三分类 → 「失败三分类」
//   口径 6 在途序号守卫 → 「在途序号守卫」
//   口径 7 不发半成品请求 → 「reorderFormal 入参闸口」
//   口径 8 本地模式零写 → 「本地模式零写」
//   口径 9 成功不重拉 / 口径 10 撤销后重拉 → 对应两组 describe
// fetch 一律真桩；桩里带一个「迷你服务端」：只认乐观锁、字段名与 deadline ≥ startDate 交叉校验
// （写序错了 / version 接力断了会直接吃 400/409，不是我在测试里自己算一遍）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useScheduleStore } from '../stores/schedule'
import type { ScheduleUndoSnapshot } from '../stores/schedule'
import { useAuthStore } from '../stores/auth'
import { ORDER_CONFLICT } from '../api/errors'
import { API_BASE } from '../config'
import type { ArtistProfile, OrderStatus, QueueRow } from '../api/types'
import type { SchedOrder } from '../schedule/types'

const TOKEN = 'desk-token-abc'
const G_QUEUE = '/api/artist/queue'
const G_BUFFER = '/api/artist/queue?zone=buffer'
const G_PROFILE = '/api/artist/profile'

/** 相对**本机**今天的日期串：只有「钳制」一组要用（store 调 planDragRange 时不注入 today，没法写死） */
function iso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── 迷你服务端（GET 的数据源 + PUT 的校验方） ───

interface DbRow {
  id: number
  status: OrderStatus
  zone: 'formal' | 'buffer'
  pos: number
  startDate: string | null
  deadline: string | null
  version: number
}

let DB: Record<number, DbRow> = {}

function resetDb(): void {
  // 行日期一律取远未来：planDragRange 的「开工日不得早于今天」钳制绝不介入，用例只测写序与回写
  DB = {
    1: { id: 1, status: 'wip', zone: 'formal', pos: 1, startDate: '2099-05-05', deadline: '2099-05-12', version: 3 },
    2: { id: 2, status: 'confirmed', zone: 'formal', pos: 2, startDate: '2099-06-01', deadline: '2099-06-10', version: 4 },
    3: { id: 3, status: 'wip', zone: 'buffer', pos: 1, startDate: '2099-07-01', deadline: '2099-07-05', version: 5 },
    // done 仍是后端活跃单（ACTIVE_ORDER_SQL 只排 delivered/cancelled）→ 进队列、可拖排，但时间条不可拖
    4: { id: 4, status: 'done', zone: 'formal', pos: 3, startDate: '2099-08-01', deadline: '2099-08-09', version: 6 },
    // 缺开工日的单：不进时间条（canDragBar 挡），但仍属正式区活跃单（要参与拖排）
    5: { id: 5, status: 'wip', zone: 'formal', pos: 4, startDate: null, deadline: '2099-09-09', version: 2 },
    // delivered 被后端活跃集排除 → 桌面 formalIds 也不该见到它（两边集合必须等势，否则 reorder 必吃 400）
    6: { id: 6, status: 'delivered', zone: 'formal', pos: 5, startDate: '2099-10-01', deadline: '2099-10-05', version: 9 }
  }
}

const PROFILE: ArtistProfile = {
  status: 'open', name: '拾绘', subdomain: 'atelier', slotDisplay: '名额 3 / 5'
}

/** 与 server getArtistQueue 同口径：只回活跃单（排除 delivered/cancelled），按 queue_position 升序 */
function activeRows(zone: 'formal' | 'buffer'): QueueRow[] {
  return Object.values(DB)
    .filter(r => r.zone === zone && r.status !== 'delivered' && r.status !== 'cancelled')
    .sort((a, b) => a.pos - b.pos)
    .map(r => ({
      id: r.id,
      order_no: `SHI-${r.id}`,
      client_name: `客户${r.id}`,
      client_qq: `1000${r.id}`,
      status: r.status,
      queue_zone: r.zone,
      queue_position: r.pos,
      deadline: r.deadline,
      start_date: r.startDate,
      startDate: r.startDate,
      created_at: '2099-01-01T00:00:00',
      tier_name: '头像 / 半身',
      version: r.version
    }))
}

// ─── fetch 桩 ───

interface RecordedRequest {
  url: string
  path: string
  method: string
  body: Record<string, unknown> | null
}
type HandlerResult = { status: number; body: unknown }
type Handler = (req: RecordedRequest) => HandlerResult | Promise<HandlerResult>

let requests: RecordedRequest[] = []

function pathOf(url: string): string {
  return url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url
}

function findRoute(routes: Record<string, Handler>, req: RecordedRequest): Handler | undefined {
  const exact = routes[`${req.method} ${req.path}`]
  if (exact) return exact
  // 订单写两个端点走通配键（id 与字段名由被测方决定，桩必须能逐请求校验形状）
  if (req.method === 'PUT' && req.path.startsWith('/api/artist/orders/') && routes['PUT /api/artist/orders/*']) {
    return routes['PUT /api/artist/orders/*']
  }
  return undefined
}

function install(routes: Record<string, Handler>): void {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const req: RecordedRequest = {
      url,
      path: pathOf(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' && init.body.length > 0
        ? JSON.parse(init.body) as Record<string, unknown>
        : null
    }
    requests.push(req)
    const handler = findRoute(routes, req)
    if (!handler) {
      return new Response(JSON.stringify({ error: `未在桩里预置的请求：${req.method} ${req.path}` }), { status: 599 })
    }
    const r = await handler(req)
    return new Response(JSON.stringify(r.body), { status: r.status })
  }))
}

/** PUT …/orders/:id/{deadline|start-date}：带真后端的三道校验（version 必须命中、字段名必须对、deadline ≥ startDate） */
function orderWrite(req: RecordedRequest): HandlerResult {
  const m = /^\/api\/artist\/orders\/(\d+)\/(deadline|start-date)$/.exec(req.path)
  if (!m) return { status: 500, body: { error: `意外的写路径 ${req.path}` } }
  const id = Number(m[1])
  const isDeadline = m[2] === 'deadline'
  const db = DB[id]
  if (!db) return { status: 404, body: { error: '订单不存在', code: 'NOT_FOUND' } }
  const body = req.body ?? {}
  if (typeof body.version !== 'number' || body.version !== db.version) {
    return {
      status: 409,
      body: { error: '排期已被别人改过', code: ORDER_CONFLICT, detail: { currentVersion: db.version } }
    }
  }
  const key = isDeadline ? 'deadline' : 'startDate'
  const raw: unknown = body[key]
  if (typeof raw !== 'string' && raw !== null) {
    return { status: 400, body: { error: `字段 ${key} 缺失或类型不对`, code: 'BAD_INPUT' } }
  }
  const nextStart: string | null = isDeadline ? db.startDate : raw
  const nextDeadline: string | null = isDeadline ? raw : db.deadline
  if (nextStart && nextDeadline && nextDeadline < nextStart) {
    // 后端 order-fields.ts 的交叉校验：两步写顺序错了就在这里现形
    return { status: 400, body: { error: '截稿日不得早于开工日', code: 'INVALID_DEADLINE' } }
  }
  db.version += 1
  if (isDeadline) db.deadline = raw
  else db.startDate = raw
  return {
    status: 200,
    body: { id, version: db.version, deadline: db.deadline, start_date: db.startDate, startDate: db.startDate }
  }
}

/** PUT /api/artist/queue/reorder：整段正式区活跃单四条校验（长度/重复/归属/非空），成功则逐行 version+1 */
function reorderWrite(req: RecordedRequest): HandlerResult {
  const raw: unknown = req.body?.orderedIds
  if (!Array.isArray(raw) || raw.length === 0) {
    return { status: 400, body: { error: '队列为空', code: 'QUEUE_EMPTY' } }
  }
  const ids = raw as number[]
  const active = activeRows('formal').map(r => r.id)
  const set = new Set(active)
  if (ids.some(id => !set.has(id))) {
    return { status: 400, body: { error: '有 id 不属于正式区活跃单', code: 'QUEUE_NOT_OWNED' } }
  }
  if (ids.length !== active.length) {
    return { status: 400, body: { error: '长度与整段正式区不符', code: 'QUEUE_LENGTH' } }
  }
  if (new Set(ids).size !== ids.length) {
    return { status: 400, body: { error: '含重复 id', code: 'QUEUE_DUPLICATE' } }
  }
  ids.forEach((id, index) => {
    const db = DB[id]
    db.pos = index + 1
    db.version += 1
  })
  return { status: 200, body: activeRows('formal') }
}

function readRoutes(): Record<string, Handler> {
  return {
    [`GET ${G_QUEUE}`]: () => ({ status: 200, body: activeRows('formal') }),
    [`GET ${G_BUFFER}`]: () => ({ status: 200, body: activeRows('buffer') }),
    [`GET ${G_PROFILE}`]: () => ({ status: 200, body: PROFILE })
  }
}

function writeRoutes(): Record<string, Handler> {
  return { 'PUT /api/artist/orders/*': orderWrite, 'PUT /api/artist/queue/reorder': reorderWrite }
}

/** 云端态：登录 + 装桩 + 首次 load（三发 GET） */
async function bootCloud(extraRoutes: Record<string, Handler> = {}) {
  const auth = useAuthStore()
  auth.token = TOKEN
  install({ ...readRoutes(), ...writeRoutes(), ...extraRoutes })
  const store = useScheduleStore()
  await store.load()
  return { store, auth }
}

// ─── 断言小工具 ───

function callLog(): string[] {
  return requests.map(r => `${r.method} ${r.path}`)
}
function puts(): RecordedRequest[] {
  return requests.filter(r => r.method === 'PUT')
}
function getLoads(): number {
  return callLog().filter(c => c === `GET ${G_QUEUE}`).length
}
function rowOf(store: { orders: SchedOrder[] }, id: number): SchedOrder | undefined {
  return store.orders.find(o => o.id === id)
}

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 等到第 n 个请求发出（纯微任务轮询，不依赖定时器） */
async function waitRequests(n: number): Promise<void> {
  for (let i = 0; i < 200 && requests.length < n; i++) await Promise.resolve()
  expect(requests.length).toBeGreaterThanOrEqual(n)
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetDb()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// ══════════════════════════════════════════════════════════════
// 写可用性域
// ══════════════════════════════════════════════════════════════

describe('写可用性域（canWriteList / canWriteTimeline / formalIds / writing）', () => {
  it('云端：formalIds 就是「整段正式区活跃单」按队列序（缓冲区与 delivered 都不在内）', async () => {
    const { store } = await bootCloud()
    expect(store.formalIds).toEqual([1, 2, 4, 5])
    expect(store.canWriteList).toBe(true)
    expect(store.canWriteTimeline).toBe(true)
    expect(store.writing).toBe(false)
  })

  it('正式区只剩一行时 canWriteList 落 false（一行没什么可拖），改期照旧可拖', async () => {
    DB[2].zone = 'buffer'
    DB[4].zone = 'buffer'
    DB[5].zone = 'buffer'
    const { store } = await bootCloud()
    expect(store.formalIds).toEqual([1])
    expect(store.canWriteList).toBe(false)
    expect(store.canWriteTimeline).toBe(true)
  })

  it('本地模式：两个 can 全 false、formalIds 空（无队列序、无写路径）', () => {
    install({})
    const store = useScheduleStore() // 无 token ＝ local
    expect(store.mode).toBe('local')
    expect(store.canWriteList).toBe(false)
    expect(store.canWriteTimeline).toBe(false)
    expect(store.formalIds).toEqual([])
  })

  it('写响应在途时 writing=true 且两个 can 同时落 false（不给「拖了没反应」的假手感），响应回来复原', async () => {
    const gate = deferred<HandlerResult>()
    const { store } = await bootCloud({ 'PUT /api/artist/orders/1/deadline': () => gate.promise })
    expect(store.canWriteTimeline).toBe(true)
    const p = store.moveScheduleRange(1, 'end', 3)
    await waitRequests(4) // 3 发 GET + 1 发 PUT
    expect(store.writing).toBe(true)
    expect(store.canWriteTimeline).toBe(false)
    expect(store.canWriteList).toBe(false)
    gate.resolve({ status: 200, body: { id: 1, version: 4, deadline: '2099-05-15', start_date: '2099-05-05' } })
    expect((await p).ok).toBe(true)
    expect(store.writing).toBe(false)
    expect(store.canWriteTimeline).toBe(true)
    expect(store.canWriteList).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 1/2/3/9：改期成功（写序 + version 接力 + 不重拉）
// ══════════════════════════════════════════════════════════════

describe('moveScheduleRange 成功（写序、version 接力、成功后不重拉）', () => {
  it('只拖截稿日 → 单步 PUT，带当前 version，本地行即时回写新值与新 version，**不再发 GET**', async () => {
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(1, 'end', 3)
    expect(res.ok).toBe(true)
    expect(res.clamped).toBe(false)
    expect(res.undo).toEqual({
      orderId: 1,
      edge: 'end',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-05',
      newDeadline: '2099-05-15',
      newVersion: 4
    })
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe('/api/artist/orders/1/deadline')
    expect(puts()[0].url).toBe(`${API_BASE}/api/artist/orders/1/deadline`)
    expect(puts()[0].body).toEqual({ deadline: '2099-05-15', version: 3 })
    // 口径 9：成功路径整段只有「3 发读 + 1 发写」，没有第二次读（拖拽反馈要即时）
    expect(callLog()).toEqual([
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`,
      'PUT /api/artist/orders/1/deadline'
    ])
    const row = rowOf(store, 1)
    expect(row?.deadline).toBe('2099-05-15')
    expect(row?.startDate).toBe('2099-05-05')
    expect(row?.version).toBe(4)
  })

  it('整条后移且跨过旧截稿日（+10 天）→ 先 deadline 再 startDate，第二步带第一步返回的新 version（口径 1+2）', async () => {
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(1, 'move', 10)
    expect(res.ok).toBe(true)
    // 顺序反了（先写 start 2099-05-15 > 旧 deadline 2099-05-12）会被桩里的交叉校验 400 拒
    expect(puts().map(r => r.path)).toEqual([
      '/api/artist/orders/1/deadline',
      '/api/artist/orders/1/start-date'
    ])
    expect(puts()[0].body).toEqual({ deadline: '2099-05-22', version: 3 })
    // version 接力：第二步带的是第一步响应里的 4，不是原始 3
    expect(puts()[1].body).toEqual({ startDate: '2099-05-15', version: 4 })
    const row = rowOf(store, 1)
    expect(row?.startDate).toBe('2099-05-15')
    expect(row?.deadline).toBe('2099-05-22')
    expect(row?.version).toBe(5)
    expect(res.undo?.newVersion).toBe(5)
  })

  it('整条前移且跨过旧开工日（-10 天）→ 对称先 startDate 再 deadline，仍逐步接力 version', async () => {
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(2, 'move', -10)
    expect(res.ok).toBe(true)
    expect(puts().map(r => r.path)).toEqual([
      '/api/artist/orders/2/start-date',
      '/api/artist/orders/2/deadline'
    ])
    expect(puts()[0].body).toEqual({ startDate: '2099-05-22', version: 4 })
    expect(puts()[1].body).toEqual({ deadline: '2099-05-31', version: 5 })
    const row = rowOf(store, 2)
    expect(row?.startDate).toBe('2099-05-22')
    expect(row?.deadline).toBe('2099-05-31')
    expect(row?.version).toBe(6)
  })

  it('红线 3：桌面写路径每个日期 PUT 都带数字 version（不许走后端「读当前版本再写」兼容路径）', async () => {
    const { store } = await bootCloud()
    await store.moveScheduleRange(1, 'move', 10)
    await store.moveScheduleRange(2, 'end', 2)
    const datePuts = puts().filter(r => /\/(deadline|start-date)$/.test(r.path))
    expect(datePuts).toHaveLength(3)
    for (const r of datePuts) {
      expect(typeof r.body?.version).toBe('number')
    }
  })

  it('别人先改了同一行（本地 version 过期）→ 第一步就吃 409，绝不续写第二步，回滚重拉带回新 version', async () => {
    const { store } = await bootCloud()
    DB[1].version = 99 // 首次 load 之后插队：本地手里的 3 已过期（正是 version 接力断掉的现实形状）
    const res = await store.moveScheduleRange(1, 'move', 10)
    expect(res).toEqual({ ok: false, conflict: true })
    expect(puts()).toHaveLength(1) // 第一步被拒就不再往下写：半改状态最害人
    expect(getLoads()).toBe(2) // 一次初始读 + 一次回滚重拉
    expect(rowOf(store, 1)?.version).toBe(99) // 本地拿回别人的新 version，下一次写以真相起步
    expect(rowOf(store, 1)?.startDate).toBe('2099-05-05') // 拖出来的 2099-05-15 没留在本地
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 4：钳制在 store 侧的语义
// ══════════════════════════════════════════════════════════════

describe('钳制在 store 侧的语义（开工日不得拖进过去）', () => {
  it('拖进过去 → 写出去的是「今天」，结果带 clamped:true（页面据此说真话）', async () => {
    DB[1].startDate = iso(2)
    DB[1].deadline = iso(9)
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(1, 'start', -5)
    expect(res.ok).toBe(true)
    expect(res.clamped).toBe(true)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe('/api/artist/orders/1/start-date')
    expect(puts()[0].body).toEqual({ startDate: iso(0), version: 3 })
    expect(res.undo?.newStartDate).toBe(iso(0))
    expect(res.undo?.oldStartDate).toBe(iso(2))
    expect(rowOf(store, 1)?.startDate).toBe(iso(0))
    expect(rowOf(store, 1)?.deadline).toBe(iso(9)) // 只动了一端，另一端不受牵连
    expect(getLoads()).toBe(1) // 成功仍不重拉
  })

  it('钳到毫无变化 → skipped + clamped:true，一个写请求都不发（不发假请求）', async () => {
    DB[1].startDate = iso(0)
    DB[1].deadline = iso(7)
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(1, 'start', -4)
    expect(res).toEqual({ ok: false, skipped: true, clamped: true })
    expect(puts()).toHaveLength(0)
    expect(callLog()).toHaveLength(3)
  })

  it('零位移（delta 0）→ skipped + clamped:false + 零请求', async () => {
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(1, 'move', 0)
    expect(res).toEqual({ ok: false, skipped: true, clamped: false })
    expect(puts()).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 闸口：不该发的请求一个都不发
// ══════════════════════════════════════════════════════════════

describe('拖不动的单：零请求（canDragBar 与写路径共用一份守卫）', () => {
  it('未知 orderId / 终态单（done）/ 缺开工日的单 → skipped 且零 PUT、零重拉', async () => {
    const { store } = await bootCloud()
    expect(rowOf(store, 4)?.status).toBe('done') // 前置事实：终态行确实在数据里
    expect(rowOf(store, 5)?.startDate).toBeNull() // 前置事实：缺开工日的单也在数据里
    expect(await store.moveScheduleRange(999, 'end', 3)).toEqual({ ok: false, skipped: true })
    expect(await store.moveScheduleRange(4, 'end', 3)).toEqual({ ok: false, skipped: true })
    expect(await store.moveScheduleRange(5, 'start', 3)).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
    expect(callLog()).toHaveLength(3)
  })

  it('缓冲区单**允许**拖条改期（写的是订单日期，与队列区无关），但绝不允许进拖排入参', async () => {
    const { store } = await bootCloud()
    const res = await store.moveScheduleRange(3, 'end', 3)
    expect(res.ok).toBe(true)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe('/api/artist/orders/3/deadline')
    expect(puts()[0].body).toEqual({ deadline: '2099-07-08', version: 5 })
    expect(rowOf(store, 3)?.deadline).toBe('2099-07-08')
    // 但拖排只认整段正式区：把缓冲区 id 交上来一律拒发
    expect(await store.reorderFormal([3, 1, 2, 4])).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 5：失败三分类
// ══════════════════════════════════════════════════════════════

describe('失败三分类（409 重拉 / 401·403 不打断编辑 / 其它带原话并重拉）', () => {
  it('409 ORDER_CONFLICT → conflict:true + 触发一次重拉，本地以服务端真相为准（不留假象）', async () => {
    let hit = false
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => {
        if (!hit) {
          hit = true
          // 别人先把这行改了：桩里的真相与版本号一起变
          DB[1].startDate = '2099-05-07'
          DB[1].deadline = '2099-05-20'
          DB[1].version = 42
        }
        return { status: 409, body: { error: '排期已被别人改过', code: ORDER_CONFLICT, detail: { currentVersion: 42 } } }
      }
    })
    const res = await store.moveScheduleRange(1, 'end', 3)
    expect(res).toEqual({ ok: false, conflict: true }) // 冲突分支不带 serverMessage，也不标 sessionExpired
    expect(hit).toBe(true)
    expect(getLoads()).toBe(2) // 初始读 + 重拉
    const row = rowOf(store, 1)
    expect(row?.deadline).toBe('2099-05-20') // 拖出来的 2099-05-15 没有留在本地
    expect(row?.startDate).toBe('2099-05-07')
    expect(row?.version).toBe(42)
  })

  it('401 → sessionExpired:true，**不重拉、不登出**（波2 拍板：不打断编辑、不自动跳登录页）', async () => {
    const { store, auth } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => ({
        status: 401, body: { error: '登录已过期', code: 'TOKEN_EXPIRED' }
      })
    })
    const res = await store.moveScheduleRange(1, 'end', 3)
    expect(res).toEqual({ ok: false, sessionExpired: true })
    expect(auth.token).toBe(TOKEN) // 没被顺手登出
    expect(callLog()).toEqual([
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`,
      'PUT /api/artist/orders/1/deadline'
    ])
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-12') // 本地一行没动
  })

  it('403（设备账本被撕）同样只报告不处置', async () => {
    const { store, auth } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => ({ status: 403, body: { error: '无权限' } })
    })
    expect(await store.moveScheduleRange(1, 'end', 3)).toEqual({ ok: false, sessionExpired: true })
    expect(auth.token).toBe(TOKEN)
    expect(requests.filter(r => r.method === 'GET')).toHaveLength(3)
  })

  it('401 响应体里同时带 ORDER_CONFLICT 码时仍按会话失效处理（failWrite 分支顺序哨兵）', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => ({
        status: 401, body: { error: '会话已失效', code: ORDER_CONFLICT }
      })
    })
    expect(await store.moveScheduleRange(1, 'end', 3)).toEqual({ ok: false, sessionExpired: true })
    expect(requests.filter(r => r.method === 'GET')).toHaveLength(3) // 没走冲突重拉
  })

  it('其它错误（500）→ 带 serverMessage（后端原话）+ 重拉一次', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => ({ status: 500, body: { error: '服务端着火了' } })
    })
    const res = await store.moveScheduleRange(1, 'end', 3)
    expect(res).toEqual({ ok: false, serverMessage: '服务端着火了' })
    expect(res.conflict).toBeUndefined()
    expect(res.sessionExpired).toBeUndefined()
    expect(getLoads()).toBe(2)
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-12')
  })

  it('非 ApiError（fetch 直接 reject＝断网）同样落「带原话 + 重拉」，不抛错拖垮页面', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => {
        throw new Error('网络断了')
      }
    })
    const res = await store.moveScheduleRange(1, 'end', 3)
    expect(res).toEqual({ ok: false, serverMessage: '网络断了' })
    expect(store.failed).toBe(false) // 重拉成功即恢复正常态
    expect(store.writing).toBe(false)
  })

  it('响应体不带 version → 不猜版本号：第二步不再发，直接重拉回真相', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => ({
        status: 200, body: { id: 1, deadline: '2099-05-22', start_date: '2099-05-05' } // 缺 version
      })
    })
    const res = await store.moveScheduleRange(1, 'move', 10) // 两步写：第一步就断了接力
    // 口径（9/13 收口定案）：结果不确定走 `refreshed`，而不是带一句空文案的失败——
    // 写请求已经发生、只是没拿到新版本号，页面必须能说“没确认、已刷新”，不许静默。
    expect(res).toEqual({ ok: false, refreshed: true })
    expect(puts()).toHaveLength(1) // 绝不带着旧 version 续写第二步
    expect(getLoads()).toBe(2)
    expect(rowOf(store, 1)?.startDate).toBe('2099-05-05') // 本地没写回半改状态
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 6：在途序号守卫
// ══════════════════════════════════════════════════════════════

describe('在途序号守卫（旧响应不得覆盖新状态）', () => {
  it('写响应回来前发生了重拉 → 该响应静默丢弃：skipped、本地不回写、无提示字段', async () => {
    const gate = deferred<HandlerResult>()
    const { store } = await bootCloud({ 'PUT /api/artist/orders/1/start-date': () => gate.promise })
    const p = store.moveScheduleRange(1, 'start', 3)
    await waitRequests(4)
    DB[1].startDate = '2099-05-06' // 服务端真相又前进一步（别人的改动）
    DB[1].version = 11
    await store.load(true) // 重拉：writeSeq 递增 → 在途写立即作废
    gate.resolve({ status: 200, body: { id: 1, version: 12, deadline: '2099-05-12', start_date: '2099-05-08' } })
    const res = await p
    expect(res).toEqual({ ok: false, skipped: true })
    expect(rowOf(store, 1)?.startDate).toBe('2099-05-06') // 以重拉带回来的真相为准，不写回 2099-05-08
    expect(rowOf(store, 1)?.version).toBe(11)
    expect(callLog()).toEqual([
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`,
      'PUT /api/artist/orders/1/start-date',
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`
    ]) // 丢弃路径不额外发请求、不连环重拉
    expect(store.writing).toBe(false)
  })

  it('连「去重命中、一个请求都不发」的 load() 也照样作废在途写（writeSeq++ 在早退之前）', async () => {
    const gate = deferred<HandlerResult>()
    const { store } = await bootCloud({ 'PUT /api/artist/orders/1/deadline': () => gate.promise })
    const p = store.moveScheduleRange(1, 'end', 3)
    await waitRequests(4)
    await store.load() // 非 force 且同模式已加载 → 零 GET，但仍取号
    expect(requests).toHaveLength(4)
    gate.resolve({ status: 200, body: { id: 1, version: 4, deadline: '2099-05-15', start_date: '2099-05-05' } })
    const res = await p
    expect(res).toEqual({ ok: false, skipped: true })
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-12') // 旧响应没把新状态盖回去
  })

  it('两条写链共用一份号：后发的写让先发的写在途响应一律作废（跨链路互踩防护）', async () => {
    const g1 = deferred<HandlerResult>()
    const g2 = deferred<HandlerResult>()
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/deadline': () => g1.promise,
      'PUT /api/artist/orders/2/start-date': () => g2.promise
    })
    const p1 = store.moveScheduleRange(1, 'end', 3)
    await waitRequests(4)
    const p2 = store.moveScheduleRange(2, 'start', 3)
    await waitRequests(5)
    g1.resolve({ status: 200, body: { id: 1, version: 4, deadline: '2099-05-15', start_date: '2099-05-05' } })
    expect(await p1).toEqual({ ok: false, skipped: true })
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-12')
    g2.resolve({ status: 200, body: { id: 2, version: 5, deadline: '2099-06-10', start_date: '2099-06-04' } })
    expect((await p2).ok).toBe(true)
    expect(rowOf(store, 2)?.startDate).toBe('2099-06-04')
  })

  it('丢弃一次不会把写路径锁死：随后一次正常写照样成功', async () => {
    const gate = deferred<HandlerResult>()
    const { store } = await bootCloud({ 'PUT /api/artist/orders/1/deadline': () => gate.promise })
    const p = store.moveScheduleRange(1, 'end', 3)
    await waitRequests(4)
    await store.load(true)
    gate.resolve({ status: 200, body: { id: 1, version: 4, deadline: '2099-05-15', start_date: '2099-05-05' } })
    expect(await p).toEqual({ ok: false, skipped: true })
    const again = await store.moveScheduleRange(1, 'end', 3)
    expect(again.ok).toBe(true)
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-15')
    expect(again.undo?.newVersion).toBe(4) // 被丢弃那次没落到桩里：DB[1].version 仍是 3，本次写 3→4
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 7：拖排入参闸口 + 写完重拉
// ══════════════════════════════════════════════════════════════

describe('reorderFormal（整段正式区才写；不合法入参一个请求都不发）', () => {
  it('整段正式区按新序 → 一个 PUT（体只有 orderedIds，无 version）+ 写完重拉', async () => {
    const { store } = await bootCloud()
    const res = await store.reorderFormal([2, 1, 4, 5])
    expect(res).toEqual({ ok: true })
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe('/api/artist/queue/reorder')
    expect(puts()[0].body).toEqual({ orderedIds: [2, 1, 4, 5] })
    expect(puts()[0].body).not.toHaveProperty('version')
    expect(callLog()).toEqual([
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`,
      'PUT /api/artist/queue/reorder',
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`
    ])
    expect(store.formalIds).toEqual([2, 1, 4, 5]) // 重拉按新序回到本地（单一真相）
  })

  it('长度与 formalIds 不符（只交被拖的那一段 / 空数组 / 多交一行）→ skipped + 零 PUT', async () => {
    const { store } = await bootCloud()
    expect(await store.reorderFormal([2, 1, 4])).toEqual({ ok: false, skipped: true })
    expect(await store.reorderFormal([])).toEqual({ ok: false, skipped: true })
    expect(await store.reorderFormal([1, 2, 4, 5, 3])).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
    expect(callLog()).toHaveLength(3)
  })

  it('含重复 id → skipped + 零 PUT', async () => {
    const { store } = await bootCloud()
    expect(await store.reorderFormal([1, 1, 2, 4])).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
  })

  it('含非正式区 id（缓冲区单 / 后端活跃集外的 delivered）→ skipped + 零 PUT', async () => {
    const { store } = await bootCloud()
    expect(await store.reorderFormal([3, 1, 2, 4])).toEqual({ ok: false, skipped: true })
    expect(await store.reorderFormal([1, 2, 4, 6])).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
    expect(callLog()).toHaveLength(3)
  })

  it('拖排吃 409 → conflict:true + 重拉（与改期同一套处置）', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/queue/reorder': () => ({
        status: 409, body: { error: '排期已被别人改过', code: ORDER_CONFLICT }
      })
    })
    expect(await store.reorderFormal([2, 1, 4, 5])).toEqual({ ok: false, conflict: true })
    expect(getLoads()).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 10：撤销
// ══════════════════════════════════════════════════════════════

describe('undoScheduleRange（以拖后拿到的新 version 起步写回旧值，写完重拉）', () => {
  it('两步撤销：先 startDate 再 deadline（截稿日前移），version 从快照 newVersion 起步，写完重拉', async () => {
    DB[1].startDate = '2099-05-15'
    DB[1].deadline = '2099-05-22'
    DB[1].version = 5
    const { store } = await bootCloud()
    const snap: ScheduleUndoSnapshot = {
      orderId: 1,
      edge: 'move',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-15',
      newDeadline: '2099-05-22',
      newVersion: 5
    }
    const res = await store.undoScheduleRange(snap)
    expect(res).toEqual({ ok: true })
    expect(puts().map(r => r.path)).toEqual([
      '/api/artist/orders/1/start-date',
      '/api/artist/orders/1/deadline'
    ])
    expect(puts()[0].body).toEqual({ startDate: '2099-05-05', version: 5 }) // 带 newVersion 起步，不是拖前旧 version
    expect(puts()[1].body).toEqual({ deadline: '2099-05-12', version: 6 }) // 第二步接力
    expect(callLog()).toEqual([
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`,
      'PUT /api/artist/orders/1/start-date',
      'PUT /api/artist/orders/1/deadline',
      `GET ${G_QUEUE}`, `GET ${G_BUFFER}`, `GET ${G_PROFILE}`
    ])
    const row = rowOf(store, 1)
    expect(row?.startDate).toBe('2099-05-05')
    expect(row?.deadline).toBe('2099-05-12')
    expect(row?.version).toBe(7) // 本地以重拉回来的服务端真相为准
  })

  it('单步撤销（只拖过截稿日）→ 一个 PUT 写回旧 deadline，写完重拉', async () => {
    DB[1].deadline = '2099-05-16'
    DB[1].version = 4
    const { store } = await bootCloud()
    const res = await store.undoScheduleRange({
      orderId: 1,
      edge: 'end',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-05',
      newDeadline: '2099-05-16',
      newVersion: 4
    })
    expect(res).toEqual({ ok: true })
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe('/api/artist/orders/1/deadline')
    expect(puts()[0].body).toEqual({ deadline: '2099-05-12', version: 4 })
    expect(getLoads()).toBe(2)
    expect(rowOf(store, 1)?.deadline).toBe('2099-05-12')
  })

  it('快照两端与旧值一致（没东西可写）→ skipped + 零请求（含零重拉）', async () => {
    const { store } = await bootCloud()
    const res = await store.undoScheduleRange({
      orderId: 1,
      edge: 'move',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-05',
      newDeadline: '2099-05-12',
      newVersion: 4
    })
    expect(res).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
    expect(callLog()).toHaveLength(3)
  })

  it('撤销吃 409（快照 newVersion 已过期）→ conflict:true + 再重拉一次', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/start-date': () => ({
        status: 409, body: { error: '排期已被别人改过', code: ORDER_CONFLICT }
      })
    })
    const res = await store.undoScheduleRange({
      orderId: 1,
      edge: 'move',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-15',
      newDeadline: '2099-05-22',
      newVersion: 3
    })
    expect(res).toEqual({ ok: false, conflict: true })
    expect(getLoads()).toBe(2)
    expect(rowOf(store, 1)?.startDate).toBe('2099-05-05') // 撤销没写成，本地仍是服务端真相
  })

  it('撤销响应不带 version → 不猜、直接重拉', async () => {
    const { store } = await bootCloud({
      'PUT /api/artist/orders/1/start-date': () => ({
        status: 200, body: { id: 1, deadline: '2099-05-12', start_date: '2099-05-05' }
      })
    })
    const res = await store.undoScheduleRange({
      orderId: 1,
      edge: 'start',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-08',
      newDeadline: '2099-05-12',
      newVersion: 3
    })
    expect(res).toEqual({ ok: false, refreshed: true }) // 同上：不猜版本号，交页面说“没确认”
    expect(puts()).toHaveLength(1)
    expect(getLoads()).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════
// 口径 8：本地模式零写
// ══════════════════════════════════════════════════════════════

describe('本地模式零写（双模式铁律：本地记账无开工日、无队列序）', () => {
  it('三个写动作一律 skipped:true 且零请求', async () => {
    install({})
    const store = useScheduleStore()
    expect(store.mode).toBe('local')
    expect(await store.moveScheduleRange(1, 'move', 3)).toEqual({ ok: false, skipped: true })
    expect(await store.reorderFormal([1, 2])).toEqual({ ok: false, skipped: true })
    expect(await store.undoScheduleRange({
      orderId: 1,
      edge: 'move',
      oldStartDate: '2099-05-05',
      oldDeadline: '2099-05-12',
      newStartDate: '2099-05-08',
      newDeadline: '2099-05-15',
      newVersion: 4
    })).toEqual({ ok: false, skipped: true })
    expect(requests).toHaveLength(0)
  })

  it('登录态被清（切出到本地）后，写动作同样零请求', async () => {
    const { store, auth } = await bootCloud()
    expect(store.mode).toBe('cloud')
    auth.token = null // 切出：mode 翻 local（页面层负责跳转，store 只保证不再写）
    await Promise.resolve()
    expect(store.mode).toBe('local')
    expect(await store.moveScheduleRange(1, 'end', 3)).toEqual({ ok: false, skipped: true })
    expect(puts()).toHaveLength(0)
  })
})
