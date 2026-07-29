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

  /** 开场代表作（第一张作品），无作品时为 null */
  const heroArtwork = computed(() => artworks.value[0] || null)

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
    heroArtwork,
    previewList
  }
}
