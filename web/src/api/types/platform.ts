// API 边界 DTO · 社交平台（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 社交平台（platform） ───

export interface PlatformDTO {
  id: number
  name: string
  iconKey: string
  fallbackChar: string
  matchDomains: string[]
  sortOrder: number
  enabled: boolean
}

/** DELETE /admin/platforms/:id 响应 */
export interface DeletePlatformResult {
  success: boolean
  reattributed: number
}

/** 社交平台写请求（REQ-022 F2） */
export interface PlatformInput {
  name?: string
  iconKey?: string | null
  fallbackChar?: string | null
  matchDomains?: string[]
  sortOrder?: number
  enabled?: boolean
}
