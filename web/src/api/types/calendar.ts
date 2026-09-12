// API 边界 DTO · 日历订阅（ICS）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

/** oimimo 吸纳批一：日历订阅（ICS）状态（GET/PUT /api/artist/calendar-feed） */
export interface CalendarFeedResult {
  enabled: boolean
  /** 含令牌的订阅路径（前端拼 origin 得完整链接）；未启用为 null */
  url: string | null
}
