// 端点方法 · 日历订阅（ICS）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson, putJson } from './http'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── oimimo 吸纳批一：日历订阅（ICS）——手机日历同步排期与截稿日 ───
export const calendarFeedApi = {
  get: (): Promise<import('../types').CalendarFeedResult> =>
    getJson('/artist/calendar-feed'),
  setEnabled: (enabled: boolean): Promise<import('../types').CalendarFeedResult> =>
    putJson('/artist/calendar-feed', { enabled }),
  rotate: (): Promise<import('../types').CalendarFeedResult> =>
    postJson('/artist/calendar-feed/rotate')
}
