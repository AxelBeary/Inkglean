// API 边界 DTO · 埋点（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 埋点（tracking.service.ts） ───

export type StatsMode = 'off' | 'hidden' | 'on'

export interface NameCount {
  name: string
  count: number
}

export interface DayCount {
  day: string
  count: number
}

/** GET /admin/tracking/summary 响应（含下单漏斗） */
export interface TrackingSummary {
  total: number
  byName: NameCount[]
  byDay: DayCount[]
  funnel: NameCount[]
}

/** GET /artist/tracking/summary 响应（联合：开关关 | 开并附统计） */
export type ArtistTrackingResult =
  | { mode: StatsMode; enabled: false }
  | { mode: StatsMode; enabled: true; total: number; byName: NameCount[]; byDay: DayCount[] }

/** GET /admin/tracking-config 响应 */
export interface TrackingConfig {
  statsMode: StatsMode
  artistStatsVisible: boolean
  /** 820-L: 统计功能管理员总开关（默认 false=关闭，画师后台隐藏整个统计导航） */
  statsEnabled: boolean
}
