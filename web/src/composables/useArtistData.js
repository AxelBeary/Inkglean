/**
 * useArtistData — 画师主页数据适配层
 *
 * 所有模板通过它读数据，不直接碰 props 字段名。
 * 后端改字段名时只需改这里，模板零改动。
 * 未来价格计算器上线后，在这里加 addons/multipliers/formatPrice 等。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ARTIST_STATUS_TYPE } from '../constants/order.js'

/**
 * ─── v0.35 F3/F6 纯函数（对接三号波 1 真实 API 契约） ───
 * 抽成模块级纯函数便于单测；后端字段变化只改这里。
 */

/**
 * F3: 尺寸图路径解析（三号契约：后端已解析好引用作品路径，互斥语义——
 * 设作品集图时独立图被清空）。优先级：artwork_image_path（引用作品实时路径）
 * > image（独立上传路径）> 空串（外层兜底画风封面）。
 */
export function resolveSizeImagePath(size) {
  if (!size) return ''
  return size.artwork_image_path || size.image || ''
}

/**
 * F6: 画廊筛选标签列表（直接吃后端 GET /public/gallery 的 filterSizes，
 * 已按多画风开关/启用状态门控）。多画风（style_name 种类 > 1）时拼
 * 「画风 · 尺寸」前缀避免同名尺寸歧义；单画风只显示尺寸名。
 * 返回条目 { sizeId, styleId, label, sortKey }，sortKey 保持后端 sort_order 稳定排序。
 */
export function buildGalleryFilters(filterSizes) {
  const list = filterSizes || []
  const styleNames = new Set(list.map(f => f.style_name))
  const multi = styleNames.size > 1
  return list.map(f => ({
    sizeId: f.id,
    styleId: f.style_id,
    label: multi ? `${f.style_name} · ${f.name}` : f.name,
    sortKey: f.sort_order ?? 0
  }))
}

/**
 * F6: 按档位筛选作品（三号契约：art.size_tags 为对象数组，
 * 按 style_size_id 匹配）；sizeId 为空 → 全部混编。
 * 没标档位的作品只在「全部」下出现。
 */
export function filterArtworksBySize(artworks, sizeId) {
  if (sizeId == null) return artworks || []
  return (artworks || []).filter(a =>
    Array.isArray(a.size_tags) && a.size_tags.some(t => t.style_size_id === sizeId)
  )
}

export function useArtistData(props) {
  const { t } = useI18n()

  const artist = computed(() => props.artist || {})
  const tiers = computed(() => props.tiers || [])
  const artworks = computed(() => props.artworks || [])
  const workflowStages = computed(() => props.workflowStages || [])

  /** 统一拼接上传文件 URL，模板不碰路径拼接 */
  const imgUrl = (path) => (path ? `/uploads/${path}` : '')

  /** 状态文字走 i18n，模板不写死 */
  const statusText = (status) =>
    t(`artistHome.status${String(status).charAt(0).toUpperCase()}${String(status).slice(1)}`)

  /** 状态 → Element Plus tag type */
  const statusType = (status) => ARTIST_STATUS_TYPE[status] || 'info'

  /**
   * REQ-022 F2: 页脚链接列表（读后端 customLinks 新结构 [{ platformId, url }]）
   * platformId → 查 GET /api/platforms 列表拿 name/iconKey/fallbackChar 渲染；
   * platformId=null（「其他」/未知平台/后端重推导失败）→ 通用链接徽标。
   * 模板渲染时每项含 { key, url, label, iconKey, fallbackChar }。
   */
  const footerLinks = computed(() => {
    const links = artist.value.customLinks
    if (!Array.isArray(links) || links.length === 0) return []
    const platforms = Array.isArray(props.platforms) ? props.platforms : []
    return links.map((item, i) => {
      const platform = item.platformId != null
        ? platforms.find((p) => p.id === item.platformId)
        : null
      return {
        key: `link-${i}`,
        url: item.url,
        label: platform?.name || t('artistHome.otherLink'),
        iconKey: platform?.iconKey || null,
        fallbackChar: platform?.fallbackChar || ''
      }
    })
  })

  /** v0.25 A: 封面作品列表（is_cover=1；字段缺失时为空数组=不显示封面区，向后兼容） */
  /** REQ-017: 按 cover_order 排序（字段缺失时 fallback 0，保持后端原序） */
  const coverArtworks = computed(() =>
    artworks.value
      .filter(a => a.is_cover)
      .sort((a, b) => (a.cover_order || 0) - (b.cover_order || 0))
  )

  /** REQ-017: 开场代表作——显式优先封面，无封面 fallback 第一张作品 */
  const heroArtwork = computed(() => coverArtworks.value[0] || artworks.value[0] || null)

  /** REQ-017: 瀑布流作品列表——封面不重复展示（用户拍板约束 2）
   *  兜底：过滤后为空（画师只有一张作品且设了封面）则不去重，避免主页无作品可看 */
  const galleryArtworks = computed(() => {
    const filtered = artworks.value.filter(a => !a.is_cover)
    return filtered.length > 0 ? filtered : artworks.value
  })

  /** 作品预览列表（el-image preview-src-list 用） */
  const previewList = computed(() => artworks.value.map((a) => imgUrl(a.image_path)))

  return {
    artist,
    tiers,
    artworks,
    workflowStages,
    imgUrl,
    statusText,
    statusType,
    footerLinks,
    heroArtwork,
    coverArtworks,
    galleryArtworks,
    previewList
  }
}
