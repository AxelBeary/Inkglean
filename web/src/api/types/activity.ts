// API 边界 DTO · v86 事件流水幕布（2026-11-28 立项）
// 形状以 server/src/features/activity/activity.service.ts 的 ActivityEventDTO 为唯一事实源；
// 本文件经 api/types.ts（barrel）再导出，下游 import 路径不变。

/** 事件主体四态（库层 CHECK 同款） */
export type ActivityActorKind = 'admin' | 'artist' | 'client' | 'anon'

/** 事件结果两态 */
export type ActivityOutcome = 'ok' | 'fail'

/**
 * 流水行（管理端查询面出站形状）。
 * ⚠️ 没有 ua 字段，也没有 meta_json：后端出站走显式字段白名单（见 toActivityEventDTO），
 * 前端不要按"以后可能会加"来预留字段。
 */
export interface ActivityEventItem {
  id: number
  /** 毫秒时间戳（INTEGER 列，服务端单点写入） */
  at: number
  actorKind: ActivityActorKind
  actorId: number | null
  /** 来源 IP 原值（D2=A）；取不到为 null，不是占位串 */
  ip: string | null
  action: string
  targetType: string | null
  targetId: number | null
  outcome: ActivityOutcome
  /** 排障差异字段（reason / orderNo / method 等）；只在此端点可见 */
  meta: Record<string, unknown>
}

/** GET /api/admin/activity-events 查询参数 */
export interface ActivityEventQuery {
  action?: string
  actorKind?: ActivityActorKind
  actorId?: number
  /** 毫秒时间戳（闭区间） */
  from?: number
  to?: number
  /** 复合游标（服务端按 id 反查 at） */
  beforeId?: number
  /** 服务端钳制 1–200 */
  limit?: number
}

/** GET /api/admin/activity-events 响应 */
export interface ActivityEventsResult {
  rows: ActivityEventItem[]
  /** 下一页游标；无更多时为 null */
  nextBeforeId: number | null
  hasMore: boolean
}

/** GET /api/admin/activity-events/filters 响应（筛选下拉的唯一事实源） */
export interface ActivityEventFiltersResult {
  actorKinds: ActivityActorKind[]
  actions: string[]
}
