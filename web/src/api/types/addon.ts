// API 边界 DTO · 增项库（画师端 + 管理端系统模板）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 增项库（addon_templates） ───

export interface AddonTemplate {
  id: number
  artist_id: number | null
  name: string
  control_type: string
  price_mode: string
  default_price: number
  unit_label: string | null
  sort_order: number
  category: string
  max_quantity: number | null
  created_at: string
}

/** DELETE /artist/addon-templates/:id 响应（referenced = 是否被画风引用过） */
export interface DeleteAddonTemplateResult {
  deleted: boolean
  referenced: boolean
}

// ─── 系统增项模板（815 第三批 I 路，管理端） ───

/** 管理端系统增项模板行（仅 artist_id IS NULL；referenced = 被画风引用数） */
export interface AdminAddonTemplate extends AddonTemplate {
  referenced: number
}

/** 管理端新建/编辑系统模板写请求（对齐画师侧字段 + sort_order） */
export interface AdminAddonTemplateInput extends AddonTemplateInput {
  sort_order?: number
}

/** 管理端更新系统模板写请求（sync=true 同步 / false 或缺省=冻结） */
export interface AdminAddonTemplateUpdate extends AdminAddonTemplateInput {
  sync?: boolean
}

/** DELETE /api/admin/addon-templates/:id 响应 */
export interface DeleteAdminAddonTemplateResult {
  deleted: boolean
  referenced: number
}

/** 增项库写请求（SPEC-PRICE-2） */
export interface AddonTemplateInput {
  name: string
  control_type?: 'switch' | 'quantity'
  price_mode?: 'fixed' | 'percent'
  default_price?: number
  unit_label?: string | null
  category?: 'add' | 'usage' | 'rush'
  max_quantity?: number | null
}
