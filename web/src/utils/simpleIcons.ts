/**
 * simple-icons 白名单精选映射（REQ-022 F2）
 *
 * 只按后端 24 平台 icon_key 白名单导入 20 个 simple-icons slug，
 * 其余 4 平台（LOFTER/抖音/QQ空间/米画师）用 fallback_char 单字兜底。
 * 构建时 tree-shaking 只打包被引用的图标路径，避免全量 3453 个图标入库。
 */
import {
  siSinaweibo,
  siBilibili,
  siXiaohongshu,
  siPixiv,
  siX,
  siKuaishou,
  siDouban,
  siYoutube,
  siInstagram,
  siTwitch,
  siArtstation,
  siTiktok,
  siDeviantart,
  siZcool,
  siAfdian,
  siWeasyl,
  siThreads,
  siTumblr,
  siBehance,
  siNeteasecloudmusic
} from 'simple-icons'

/** iconKey（后端 social_platforms.icon_key）→ simple-icons 的 SVG path 数据 */
export const PLATFORM_ICON_PATHS: Record<string, string> = {
  sinaweibo: siSinaweibo.path,
  bilibili: siBilibili.path,
  xiaohongshu: siXiaohongshu.path,
  pixiv: siPixiv.path,
  x: siX.path,
  kuaishou: siKuaishou.path,
  douban: siDouban.path,
  youtube: siYoutube.path,
  instagram: siInstagram.path,
  twitch: siTwitch.path,
  artstation: siArtstation.path,
  tiktok: siTiktok.path,
  deviantart: siDeviantart.path,
  zcool: siZcool.path,
  afdian: siAfdian.path,
  weasyl: siWeasyl.path,
  threads: siThreads.path,
  tumblr: siTumblr.path,
  behance: siBehance.path,
  neteasecloudmusic: siNeteasecloudmusic.path
}

/** iconKey → 中文平台名（管理端下拉 + 图标选择用；英文界面平台名走平台表 name 字段） */
export const PLATFORM_ICON_NAMES = {
  sinaweibo: '微博',
  bilibili: 'Bilibili',
  xiaohongshu: '小红书',
  pixiv: 'Pixiv',
  x: 'X (Twitter)',
  kuaishou: '快手',
  douban: '豆瓣',
  youtube: 'YouTube',
  instagram: 'Instagram',
  twitch: 'Twitch',
  artstation: 'ArtStation',
  tiktok: 'TikTok',
  deviantart: 'DeviantArt',
  zcool: '站酷',
  afdian: '爱发电',
  weasyl: 'Weasyl',
  threads: 'Threads',
  tumblr: 'Tumblr',
  behance: 'Behance',
  neteasecloudmusic: '网易云音乐'
}

/**
 * 取图标 SVG path；无白名单图标时返回空串（外层用 fallbackCharacter 单字兜底）
 * @param {string|null|undefined} iconKey
 * @returns {string}
 */
export function getIconPath(iconKey: string | null | undefined): string {
  return (iconKey && PLATFORM_ICON_PATHS[iconKey]) || ''
}
