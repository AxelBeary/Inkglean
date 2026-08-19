/**
 * templates/types — 客户端画师主页四模板（Atelier/Classic/Folio/Gallery）共享 prop 宽松形状
 *
 * 各形状与子组件（TplHero / TplGallery / TplPricingSection）内部 prop 接口结构镜像一致，
 * 供模板运行时 declareProps 的 PropType 注解使用。实际传入数据为
 * Artwork[] / PublicArtStyle[] / WorkflowStageDTO[] / PlatformDTO[] 等，字段均为这些形状的超集。
 */

/** TplHero 作品行宽松形状 */
export interface HeroArtworkLike {
  id: number
  title?: string | null
  image_path?: string | null
  is_cover?: number | null
  cover_order?: number | null
  size_tags?: Array<{ style_size_id?: number | null }> | null
}

/** TplGallery 兜底作品行宽松形状 */
export interface GalleryArtworkLike {
  id: number
  title?: string | null
  image_path?: string | null
  is_cover?: number | null
  like_count?: number | null
  description?: string | null
  width?: number | null
  height?: number | null
  size_tags?: Array<{ style_size_id?: number | null }> | null
}

/** TplPricingSection 画风尺寸宽松形状 */
export interface PricingSizeLike {
  id: number
  name: string
  base_price: number
  description?: string | null
  work_days?: number | null
  display_status?: string | null
  artwork_image_path?: string | null
  image?: string | null
}

/** TplPricingSection 画风宽松形状 */
export interface PricingStyleLike {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sizes?: PricingSizeLike[] | null
}

/** TplPricingSection 档位宽松形状 */
export interface PricingTierLike {
  id: number
  name: string
  price: number
  description?: string | null
  work_days?: number | null
  example_image?: string | null
  visibility?: string | null
}

/** TplPricingSection 流程阶段宽松形状 */
export interface WorkflowStageLike {
  id: number
  name: string
  takesPayment?: boolean | number | null
  basisPoints?: number | null
  isFinal?: boolean
}
