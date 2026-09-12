// ============================================
// 画风域共用 DB 行类型（F-09 巨型文件拆分批·纯搬移，零行为变更）
// 来源：features/pricing/style.service.ts 原 219-228 / 368-381 / 639-645 三处接口声明，原文照搬未改一字。
// 存在理由：公开读模型域要用这三个行类型，若它反向 import 入口文件、入口又 export * 它，
//           就成循环 import；故共用类型单点存放，入口以 export * 原样再导出，下游 import 路径不变。
// ============================================

export interface ArtStyle {
  id: number
  artist_id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  is_active: number
  created_at: string
}

export interface StyleSize {
  id: number
  art_style_id: number
  name: string
  base_price: number
  sort_order: number
  // v0.37 (REQ-024 F1): 尺寸带图/描述/天数
  image: string | null
  image_artwork_id: number | null
  description: string | null
  work_days: number | null
  // v49 (REQ-036): 尺寸三态 available/showcase/closed
  display_status: string
}

export interface SizeAddonOverride {
  id: number
  style_size_id: number
  style_addon_id: number
  price_override: number | null
  is_hidden: number
}
