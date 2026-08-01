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
  link: '🔗'
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
  other: '🔗'
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

  /** 开场代表作（第一张作品），无作品时为 null */
  const heroArtwork = computed(() => artworks.value[0] || null)

  /** v0.25 A: 封面作品列表（is_cover=1；后端已将封面排前，此处再过滤兜底；字段缺失时为空数组=不显示封面区，向后兼容） */
  const coverArtworks = computed(() => artworks.value.filter(a => a.is_cover))

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
    previewList
  }
}
