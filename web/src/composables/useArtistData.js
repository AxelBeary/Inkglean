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

  /** 过滤空值后的社交链接列表 */
  const socialLinks = computed(() => {
    const links = []
    if (artist.value.weiboUrl) {
      links.push({ key: 'weibo', url: artist.value.weiboUrl, label: t('artistHome.weiboPlain') })
    }
    if (artist.value.bilibiliUrl) {
      links.push({ key: 'bilibili', url: artist.value.bilibiliUrl, label: t('artistHome.bilibiliPlain') })
    }
    return links
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
