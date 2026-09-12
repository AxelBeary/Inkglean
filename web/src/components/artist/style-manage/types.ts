// F-09 巨型文件拆分（施工员戊）：以下行结构接口自 ArtStyleManager.vue <script setup> 原样搬入（字段/注释零改动），
// 供父组件与 style-manage/ 子组件共用，保持单一来源。命名与消费子集口径照原文件注释。

/** 增项胶囊行（StyleAddonWithTemplate 消费子集） */
export interface ManagerSa {
  id: number
  addon_template_id: number
  is_enabled: number | boolean
  template_name: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  template_category: string
  price_override?: number | null
}
/** 尺寸行（StyleSize 消费子集 + 前端挂载的 _overrides 缓存） */
export interface ManagerSizeRow {
  id: number
  name: string
  base_price: number
  sort_order: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
  display_status?: string | null
  _overrides?: Record<number, { price_override: number | null; is_hidden: boolean }>
}
/** 画风卡片行（ArtStyleWithDetails 消费子集） */
export interface ManagerStyleRow {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sort_order: number
  is_active: number
  sizes: ManagerSizeRow[]
  addons: ManagerSa[]
}
/** 作品集条目（缩略图解析用） */
export interface ManagerArtwork {
  id: number
  image_path: string
}
/** AddonCreateDialog created 事件载荷 */
export interface AddonCreatedPayload {
  name: string
  control_type: 'switch' | 'quantity'
  price_mode: 'fixed' | 'percent'
  default_price: number
  category: 'add' | 'usage' | 'rush'
  unit_label?: string | null
  max_quantity?: number | null
}
