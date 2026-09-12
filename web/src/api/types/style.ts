// API 边界 DTO · 画风管理（画师端：画风/尺寸/增项挂载/覆盖）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 画风管理（画师端） ───

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
  image: string | null
  image_artwork_id: number | null
  description: string | null
  work_days: number | null
  display_status: string
}

/** 画风增项（含模板快照列 + detached 标记） */
export interface StyleAddonWithTemplate {
  id: number
  art_style_id: number
  addon_template_id: number | null
  is_enabled: number
  price_override: number | null
  template_name: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  template_unit_label: string | null
  template_category: string
  template_max_quantity: number | null
  detached: boolean
}

export interface ArtStyleWithDetails extends ArtStyle {
  sizes: StyleSize[]
  addons: StyleAddonWithTemplate[]
}

export interface SizeAddonOverride {
  id: number
  style_size_id: number
  style_addon_id: number
  price_override: number | null
  is_hidden: number
}

export interface DeletedResult {
  deleted: boolean
}

/** 画风写请求 */
export interface ArtStyleInput {
  name?: string
  description?: string | null
  cover_image?: string | null
  sort_order?: number
  is_active?: boolean
}

/** 尺寸写请求（v0.37 F1） */
export interface StyleSizeInput {
  name?: string
  base_price?: number
  sort_order?: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
  display_status?: 'available' | 'showcase' | 'closed'
}

/** PUT /artist/art-styles/:id/addons 单项 */
export interface StyleAddonSetItem {
  addon_template_id: number
  is_enabled?: boolean
  price_override?: number | null
}

/** PUT .../overrides 单项 */
export interface SizeOverrideSetItem {
  style_addon_id: number
  price_override?: number | null
  is_hidden?: boolean
}
