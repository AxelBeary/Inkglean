// 桌面端云端数据 API（Bearer 桌面 token，v73 口径：下发 token 不下发 cookie）
// 四板块 + 挂牌的云端数据源；本地模式（未登录脱网）一律不调本文件任何函数（双模式纪律）。
// 响应类型与网页端同源：字段形状照 web/src/api/types.ts 对应接口抄入 ./types（桌面端自带一份，不跨包引用）。
// 失败口径：网络/服务端错误一律抛 `ApiError`（带 status/code/detail，见 ./errors），
// 由板块壳与排期 store 统一降级（临时断网：留言整块隐藏，其余静默态，不留死按钮）。
// 波2 拖拽改期批：写路径要能判定 409 ORDER_CONFLICT，故不再抛丢信息的裸 Error。
import { requireApiBase } from '../config'
import { ApiError } from './errors'
import { useAuthStore } from '../stores/auth'
import type {
  ArtistOrderItem,
  ArtistProfile,
  ArtistStats,
  DeadlineSoonResult,
  GuestbookMessage,
  IncomeOverview,
  OrderWriteResult,
  QueueRow,
  RevenueResult,
  ScheduleBar,
  SimpleSuccessResult,
  TodoItem,
  VersionedOptions
} from './types'

/** 把失败响应读成 ApiError：status 与后端 code/detail 原样保留（不许吞）。
 *  响应体不是 JSON（网关 HTML 错误页等）也不炸：退回带 status 的通用文案。 */
async function toApiError(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => null) as
    | { error?: string; code?: string; detail?: unknown }
    | null
  return new ApiError(
    res.status,
    typeof data?.code === 'string' ? data.code : null,
    data?.error ?? `请求失败（${res.status}）`,
    data?.detail
  )
}

async function getJson<T>(path: string): Promise<T> {
  const auth = useAuthStore()
  if (!auth.token) throw new Error('未登录：云端数据接口仅限云端模式调用')
  const res = await fetch(requireApiBase() + path, {
    headers: { Authorization: `Bearer ${auth.token}` }
  })
  if (!res.ok) throw await toApiError(res)
  return await res.json() as T
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const auth = useAuthStore()
  if (!auth.token) throw new Error('未登录：云端数据接口仅限云端模式调用')
  const res = await fetch(requireApiBase() + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw await toApiError(res)
  return await res.json() as T
}

// ─── today 今日要办（排期 + 账本待办融合）───

/** 近 7 日排期条 */
export function fetchSchedule(): Promise<{ bars: ScheduleBar[] }> {
  return getJson('/api/artist/dashboard/schedule')
}

/** 合并待办（6 级排序，含待收尾款/待确认/待交付等） */
export function fetchTodos(): Promise<{ items: TodoItem[] }> {
  return getJson('/api/artist/dashboard/todo')
}

// ─── ops 经营（收入 + 统计，含墨环时间数据位）───

/** 本月收入概览（到账/待收尾款，与网页端到账卡同源同口径） */
export function fetchIncomeOverview(): Promise<IncomeOverview> {
  return getJson('/api/artist/dashboard/income-overview')
}

/** 收入统计（柱状图数据 + 汇总 + 环比） */
export function fetchRevenue(period: 'month' | 'quarter' | 'year' = 'month'): Promise<RevenueResult> {
  return getJson(`/api/artist/dashboard/revenue?period=${period}`)
}

/** 画师统计（接单数等；F8 本地时间统计不走此接口——永不上传承诺） */
export function fetchArtistStats(): Promise<ArtistStats> {
  return getJson('/api/artist/stats')
}

// ─── 分页累积（#22-4）───

/** 分页累积硬上限：极端数据量下也只为桌面端取这么多行，触顶置 truncated */
const PAGE_COLLECT_MAX_ITEMS = 1000

/** 服务端分页响应形状（messages/orders 同源：{items,total,page,pageSize}） */
interface PagedResponse<T> {
  items?: T[]
  total?: number
}

/** 累积结果：items 为已取到的行，total 为服务端口径总数（计数一律用它），
 *  truncated 表示受硬上限截断（此时 items.length 少于 total） */
export interface Collected<T> {
  items: T[]
  total: number
  truncated: boolean
}

/**
 * 逐页取到 total 为止（审计 #22 条目 4）
 *
 * why：桌面端把这些列表**当全量用**——`Home.vue` 的在账数、MsgsPanel 的待审数、
 * 新留言通知与托盘 tooltip 都从 items 推导。而 `fetchMessages()`/`fetchOrders()`
 * 原先不传 page/pageSize，吃服务端默认第一页（留言 20 条 / 订单 50 条），
 * 于是超出首页的部分永远看不到，计数长期低报。
 *
 * 停止条件三重：取满 total、某页返回空数组（服务端数据变化/越界）、达到硬上限。
 * 页大小由各调用方按服务端允许的最大值传入，正常画师量级一两轮即收敛。
 */
async function collectPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PagedResponse<T>>,
  pageSize: number
): Promise<Collected<T>> {
  const first = await fetchPage(1, pageSize)
  const items = [...(first.items ?? [])]
  const total = first.total ?? items.length
  while (items.length < Math.min(total, PAGE_COLLECT_MAX_ITEMS)) {
    const page = Math.floor(items.length / pageSize) + 1
    const res = await fetchPage(page, pageSize)
    const batch = res.items ?? []
    if (batch.length === 0) break // 空页＝没有更多了，防 total 漂移导致死循环
    items.push(...batch)
  }
  return { items, total, truncated: items.length < total }
}

// ─── msgs 留言 ───

/** 留言审核列表（分页对象 {items,total}，非裸数组——826 实测纠形；本地模式/断网整块隐藏）
 *  #22-4：按服务端最大页（100）逐页累积，不再只吃默认 20 条 */
export function fetchMessages(): Promise<Collected<GuestbookMessage>> {
  return collectPages((page, pageSize) => getJson(`/api/artist/messages?page=${page}&pageSize=${pageSize}`), 100)
}

/** 留言通过（追加：同网页端 approveMessage 口径；既有签名一律不动） */
export function approveMessage(id: number): Promise<GuestbookMessage> {
  return putJson(`/api/artist/messages/${id}/approve`, {})
}

/** 留言驳回（追加：同网页端 rejectMessage 口径） */
export function rejectMessage(id: number): Promise<SimpleSuccessResult> {
  return putJson(`/api/artist/messages/${id}/reject`, {})
}

// ─── orders 订单速览 ───

/** 订单列表（分页对象 {items}，非裸数组——826 实测纠形）
 *  #22-4：按服务端最大页（200）逐页累积，「在账数」一类计数改读 total */
export function fetchOrders(): Promise<Collected<ArtistOrderItem>> {
  return collectPages((page, pageSize) => getJson(`/api/artist/orders?page=${page}&pageSize=${pageSize}`), 200)
}

/** 截稿倒计时（含已逾期，按截稿日升序） */
export function fetchDeadlineSoon(days = 14, limit = 8): Promise<DeadlineSoonResult> {
  return getJson(`/api/artist/dashboard/deadline-soon?days=${days}&limit=${limit}`)
}

// ─── schedule 排期（9/4 主页重设计波1：三视图只读数据源）───

/** 正式区队列（裸数组，同网页端 getQueue 同源同形状；含 queue_position 顺序） */
export function fetchQueue(): Promise<QueueRow[]> {
  return getJson('/api/artist/queue')
}

/** 缓冲区（候补）队列；月历带与列表分区都要它（六态里的缓冲态靠 zone 区分） */
export function fetchBufferQueue(): Promise<QueueRow[]> {
  return getJson('/api/artist/queue?zone=buffer')
}

// ─── schedule 排期写路径（波2 拖拽改期：9/13 批）───
// 三条口径：①**一律带 version**（不传＝后端走"读当前版本再写"兼容路径，会覆盖别人的改动）；
//          ②两端同时变化时由调用方按 drag.planWrites 钉的顺序发（后端有 deadline ≥ startDate 交叉校验）；
//          ③reorder 只认**整段正式区活跃单**（长度/重复/归属四条 400 码），故调用方必须把界面上
//            全部正式区 id 按新序交上来，不许只交被拖的那一段。

/** 改截稿日：响应带新 version，多步写时由调用方接力给下一步 */
export function updateDeadline(
  id: number,
  deadline: string | null,
  options: VersionedOptions = {}
): Promise<OrderWriteResult> {
  return putJson(`/api/artist/orders/${id}/deadline`, { deadline, ...options })
}

/** 改开工日（同上，字段名走驼峰 startDate，与后端 schema 一字不差） */
export function updateStartDate(
  id: number,
  startDate: string | null,
  options: VersionedOptions = {}
): Promise<OrderWriteResult> {
  return putJson(`/api/artist/orders/${id}/start-date`, { startDate, ...options })
}

/** 列表拖排：整段正式区新顺序。响应体刻意不消费（store 写成功后走 load(true) 重拉） */
export function reorderQueue(orderedIds: number[]): Promise<unknown> {
  return putJson('/api/artist/queue/reorder', { orderedIds })
}

// ─── plaque 状态挂牌（题签壳控件）───

/** 读本人公开资料（含 status / slotDisplay / 名额结构化字段：挂牌翻牌 + 排期「能否接单」依据） */
export function fetchProfile(): Promise<ArtistProfile> {
  return getJson('/api/artist/profile')
}

/** 翻牌：更新挂牌状态（open/full/break/hidden）；断网时本地记住最新状态，恢复后静默同步由壳层做 */
export function updatePlaqueStatus(status: 'open' | 'full' | 'break' | 'hidden'): Promise<unknown> {
  return putJson('/api/artist/profile', { status })
}
