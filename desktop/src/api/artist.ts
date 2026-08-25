// 桌面端云端数据 API（Bearer 桌面 token，v73 口径：下发 token 不下发 cookie）
// 四板块 + 挂牌的云端数据源；本地模式（未登录脱网）一律不调本文件任何函数（双模式纪律）。
// 响应类型与网页端同源：字段形状照 web/src/api/types.ts 对应接口抄入 ./types（桌面端自带一份，不跨包引用）。
// 失败口径：网络/服务端错误向上抛，由板块壳统一降级（临时断网：留言整块隐藏，其余静默态，不留死按钮）。
import { requireApiBase } from '../config'
import { useAuthStore } from '../stores/auth'
import type {
  ArtistOrderItem,
  ArtistStats,
  DeadlineSoonResult,
  GuestbookMessage,
  IncomeOverview,
  RevenueResult,
  ScheduleBar,
  SimpleSuccessResult,
  TodoItem
} from './types'

async function getJson<T>(path: string): Promise<T> {
  const auth = useAuthStore()
  if (!auth.token) throw new Error('未登录：云端数据接口仅限云端模式调用')
  const res = await fetch(requireApiBase() + path, {
    headers: { Authorization: `Bearer ${auth.token}` }
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error ?? `请求失败（${res.status}）`)
  }
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
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error ?? `请求失败（${res.status}）`)
  }
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

// ─── msgs 留言 ───

/** 留言审核列表（分页对象 {items,total}，非裸数组——826 实测纠形；本地模式/断网整块隐藏） */
export function fetchMessages(): Promise<{ items: GuestbookMessage[]; total: number }> {
  return getJson('/api/artist/messages')
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

/** 订单列表（分页对象 {items}，非裸数组——826 实测纠形） */
export function fetchOrders(): Promise<{ items: ArtistOrderItem[] }> {
  return getJson('/api/artist/orders')
}

/** 截稿倒计时（含已逾期，按截稿日升序） */
export function fetchDeadlineSoon(days = 14, limit = 8): Promise<DeadlineSoonResult> {
  return getJson(`/api/artist/dashboard/deadline-soon?days=${days}&limit=${limit}`)
}

// ─── plaque 状态挂牌（题签壳控件）───

/** 读本人公开资料（含 status / slotDisplay，挂牌翻牌依据） */
export function fetchProfile(): Promise<{ status: string; name: string; subdomain: string | null; slotDisplay?: string | null; messagesEnabled?: boolean }> {
  return getJson('/api/artist/profile')
}

/** 翻牌：更新挂牌状态（open/full/break/hidden）；断网时本地记住最新状态，恢复后静默同步由壳层做 */
export function updatePlaqueStatus(status: 'open' | 'full' | 'break' | 'hidden'): Promise<unknown> {
  return putJson('/api/artist/profile', { status })
}
