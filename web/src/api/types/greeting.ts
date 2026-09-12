// API 边界 DTO · 问候语与特别日（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 问候语（greeting.service.ts） ───

export interface GreetingTemplate {
  id: number
  artist_id: number | null
  text: string
  time_slot: string
  is_enabled: number
  /** 关联特别日（E5 波 4）；null=普通时段池文案 */
  special_day_id: number | null
}

/** 特别日行（/admin/special-days） */
export interface SpecialDay {
  id: number
  name: string
  /** 'MM-DD' 年重复日期 */
  date_key: string
  /** null=全平台，否则指定画师 */
  artist_id: number | null
  is_enabled: number
}

/** 特别日列表行（附带关联文案数） */
export interface SpecialDayListItem extends SpecialDay {
  greeting_count: number
}

/** 特别日创建请求 */
export interface SpecialDayInput {
  name: string
  dateKey: string
  artistId?: number | null
}

/** GET /artist/greeting 响应 */
export interface GreetingResult {
  text: string
  slot: string
}

/** 问候语模板写请求（通用库/画师专属库共用；E5：可挂特别日） */
export interface GreetingInput {
  text: string
  timeSlot?: 'early' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'midnight' | 'any'
  /** 关联特别日；null=解除关联 */
  specialDayId?: number | null
}
