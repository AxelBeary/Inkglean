// API 边界 DTO · 通用分页包裹（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 通用分页 ───

/** 标准分页包裹（guestbook/orders/logs/recycle-bin 等） */
export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** "加载更多"分页包裹（artworks paged：无 page/pageSize，带 hasMore） */
export interface HasMoreResult<T> {
  items: T[]
  total: number
  hasMore: boolean
}
