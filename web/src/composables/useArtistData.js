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
 * R15: 外链图标徽标映射
 * 一号拍板：纯文字标签 + Element Plus Link 图标兜底，不自造 SVG 图标库
 */
const LINK_ICON_BADGE = {
  weibo: '微',
  bilibili: 'B',
  pixiv: 'P',
  x: 'X',
  xiaohongshu: '红',
  lofter: 'L',
  douyin: '抖',
  link: '链'
}

/**
 * R58-8: 平台链接徽标映射（后端识别的 platform → 文字徽标）
 * 与 LINK_ICON_BADGE 共用视觉语言，other 用通用链接徽标
 */
const PLATFORM_BADGE = {
  pixiv: 'P',
  x: 'X',
  weibo: '微',
  lofter: 'L',
  bilibili: 'B',
  xiaohongshu: '红',
  other: '链'
}

/**
 * ─── v0.35 F3/F6 纯函数（mock-first，字段契约以三号波 1 交付为准） ───
 * 抽成模块级纯函数便于单测；三号 API 就绪后字段名若变化只改这里。
 */

/**
 * F3: 尺寸图解析（三号预判契约）：
 * image_artwork_id 指向的作品图 > image 独立上传图 > 空串（外层兜底画风封面）
 */
export function resolveSizeImagePath(size, artworks) {
  if (!size) return ''
  if (size.image_artwork_id != null) {
    const art = (artworks || []).find(a => a.id === size.image_artwork_id)
    if (art?.image_path) return art.image_path
  }
  return size.image || ''
}

/**
 * F6: 画廊筛选标签列表 = 画师全部启用画风下的启用尺寸（从 styles 派生）。
 * 单画风只显示尺寸名；多画风用「画风 · 尺寸」避免同名尺寸歧义。
 */
export function deriveGalleryFilters(styles) {
  const list = styles || []
  const multi = list.length > 1
  const filters = []
  for (const s of list) {
    for (const sz of (s.sizes || [])) {
      filters.push({
        sizeId: sz.id,
        styleId: s.id,
        label: multi ? `${s.name} · ${sz.name}` : sz.name,
        basePrice: sz.base_price
      })
    }
  }
  return filters
}

/** F6: 按档位筛选作品；sizeId 为空 → 全部混编。没标档位的作品只在「全部」下出现 */
export function filterArtworksBySize(artworks, sizeId) {
  if (sizeId == null) return artworks || []
  return (artworks || []).filter(a => Array.isArray(a.tags) && a.tags.includes(sizeId))
}

/**
 * ⚠️ v0.35 波 2 mock 占位 —— 待三号波 1 API 交付后整块删除 ──
 * 迁移 v37 后：getPublicStyles 的 sizes 自带 image/image_artwork_id/description/work_days，
 * getProfile 的 artworks 自带 tags（尺寸 id 数组）/description。
 * 届时代替方案：删掉本函数 + ArtistHome.vue 里的调用行，前端直接读接口字段。
 * mock 策略：基于真实返回数据确定性附加字段（不猜 DB id），保证任何画师都能演示。
 */
export function applyV035MockFields(styles, artworks) {
  const styleList = styles || []
  const artList = artworks || []
  const allSizes = styleList.flatMap(s => (s.sizes || []).map(sz => ({ ...sz, styleId: s.id })))

  const decoratedStyles = styleList.map(s => ({
    ...s,
    sizes: (s.sizes || []).map((sz, i) => {
      const extra = {}
      // 尺寸 0：引用作品图路径（image_artwork_id）；尺寸 1：独立上传路径（image）；其余无图 → 演示封面兜底
      if (i === 0 && artList.length > 0) extra.image_artwork_id = artList[0].id
      else if (i === 1 && artList.length > 1) extra.image = artList[1].image_path
      if (i <= 2) {
        extra.description = `「${sz.name}」mock 描述：构图为半身以上，含简单背景，线稿上色各一轮。`
        extra.work_days = 3 * (i + 1)
      }
      return { ...sz, ...extra }
    })
  }))

  const decoratedArtworks = artList.map((art, j) => {
    // 无尺寸可标时不附加（旧模型画师保持原样）
    if (!allSizes.length) return art
    const extra = {}
    // 最后一张不标档位 → 演示「只在全部下出现」；
    // 其余每张按步长 2 分配两个档位（j→2j, 2j+1）→ 覆盖所有档位，多标签可演示
    if (j < artList.length - 1) {
      const n = allSizes.length
      if (n === 1) {
        extra.tags = [allSizes[0].id]
      } else {
        const a = allSizes[(2 * j) % n].id
        const b = allSizes[(2 * j + 1) % n].id
        extra.tags = a === b ? [a] : [a, b]
      }
    }
    if (j < 3) extra.description = `mock 自由描述：这是第 ${j + 1} 张作品的创作说明（画师可自由填写）。`
    return { ...art, ...extra }
  })

  return { styles: decoratedStyles, artworks: decoratedArtworks }
}
/** ─── mock 占位结束 ─── */

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
   * R15: 外链列表（读后端拼好的 customLinks 数组）
   * 后端已处理旧列回退（custom_links=NULL → 拼 weibo_url/bilibili_url），前端不碰旧字段
   * 每项: { name, url, icon } → 追加 badge 文字徽标
   */
  const socialLinks = computed(() => {
    const links = artist.value.customLinks
    if (!Array.isArray(links) || links.length === 0) return []
    return links.map((item, i) => ({
      key: `${item.icon || 'link'}-${i}`,
      url: item.url,
      label: item.name,
      badge: LINK_ICON_BADGE[item.icon] || LINK_ICON_BADGE.link
    }))
  })

  /**
   * R58-8: 平台链接列表（读后端拼好的 platformUrls 数组）
   * 后端已处理旧格式兼容（纯字符串数组 → 重新识别平台），前端不碰原始 JSON
   * 每项: { url, platform, label } → 追加 badge 文字徽标
   */
  const platformLinks = computed(() => {
    const links = artist.value.platformUrls
    if (!Array.isArray(links) || links.length === 0) return []
    return links.map((item, i) => ({
      key: `platform-${item.platform || 'other'}-${i}`,
      url: item.url,
      label: item.label || item.platform || 'other',
      badge: PLATFORM_BADGE[item.platform] || PLATFORM_BADGE.other
    }))
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
    socialLinks,
    platformLinks,
    heroArtwork,
    coverArtworks,
    galleryArtworks,
    previewList
  }
}
