import { getArtistBySubdomain } from '../artist/artist.service.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// REQ-043 I1: OG 分享卡片（server 端 HTML 注入）
// 仅命中 /artist/:subdomain 的 HTML 请求；SPA 其他路由保持 index.html 静态默认
// 安全：所有 OG 值 HTML 实体转义消毒（防 bio/名称注入 XSS）
// ============================================

export interface OgData {
  title: string
  description: string
  url: string
  image: string
  imageAlt: string
}

/** 缓存窗口：subdomain OG 数据内存缓存 5 分钟（Map + 时间戳），降低公开页 DB 压力 */
const OG_CACHE_TTL_MS = 5 * 60 * 1000
const ogCache = new Map<string, { fetchedAt: number; data: OgData }>()

/** 测试/管理用：清空 OG 缓存（普通运行不需要） */
export function clearOgCache(): void {
  ogCache.clear()
}

/** HTML 实体转义（防注入；OG 值是 meta content 属性值，双引号/尖括号/& 必须转义） */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 截断到指定字符数（按码点，避免截断代理对；超长补省略号） */
function truncate(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) return text
  // 保留 max-1 个字符 + 省略号，总长不超过 max
  return chars.slice(0, max - 1).join('').trimEnd() + '…'
}

/** 简介清洗：去 HTML 标签（bio 允许富文本，OG 描述只要纯文本）+ 压缩空白 + 截断 100 字 */
function cleanBio(bio: string): string {
  const plain = bio
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return truncate(plain, 100)
}

/** 公开页可见性判定（对齐公开 API：封禁/隐藏画师不注入个人 OG，回退默认） */
function isOgVisible(artist: Artist): boolean {
  if (artist.is_banned) return false
  if (artist.status === 'hidden') return false
  return true
}

/** HTTPS 绝对地址：DOMAIN env 优先，缺失时用请求 Host 兜底（开发环境可用） */
function absoluteUrl(path: string, host: string | undefined): string {
  const rawDomain = process.env.DOMAIN || host || 'localhost'
  const domain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return `https://${domain}${path}`
}

/** 平台默认 OG（未找到画师/不可见画师时返回，不报错） */
function defaultOg(subdomain: string, host: string | undefined): OgData {
  const pageUrl = absoluteUrl(`/artist/${subdomain}`, host)
  return {
    title: '拾绘 Inkglean — 画师约稿平台',
    description: '开源，自部署，易操作。',
    url: pageUrl,
    image: absoluteUrl('/assets/logo.webp', host),
    imageAlt: '拾绘 Inkglean'
  }
}

/**
 * 构建画师主页 OG 数据（subdomain → 内存缓存 5 分钟）
 * 未找到/不可见画师 → 默认 OG（不抛错）
 */
export function buildOgMeta(subdomain: string, host?: string): OgData {
  const cached = ogCache.get(subdomain)
  if (cached && Date.now() - cached.fetchedAt < OG_CACHE_TTL_MS) {
    return cached.data
  }

  const artist = getArtistBySubdomain(subdomain)
  const data = !artist || !isOgVisible(artist)
    ? defaultOg(subdomain, host)
    : buildArtistOg(artist, host)

  ogCache.set(subdomain, { fetchedAt: Date.now(), data })
  return data
}

/** 画师 OG 数据：标题 = 画师名｜拾绘；描述 = 简介截断 100 字（附接单状态）；图 = 头像（无头像用 logo 兜底） */
function buildArtistOg(artist: Artist, host: string | undefined): OgData {
  const bioText = cleanBio(artist.bio || '')
  const statusSuffix = artist.status === 'full'
    ? ' · 档期已满'
    : artist.status === 'break'
      ? ' · 休息中'
      : ''
  const description = truncate((bioText || '在拾绘（Inkglean）接稿中') + statusSuffix, 100)
  const imagePath = artist.avatar
    ? `/uploads/${artist.avatar.replace(/^\/+/, '')}`
    : '/assets/logo.webp'

  return {
    title: `${artist.name}｜拾绘`,
    description,
    url: absoluteUrl(`/artist/${artist.subdomain}`, host),
    image: absoluteUrl(imagePath, host),
    imageAlt: `${artist.name}头像`
  }
}

/** index.html 中的 OG 锚点区（占位 meta → og:description meta 之间，只替换这一小段） */
const OG_ANCHOR_RE = /<meta\s+name="og-placeholder"[^>]*>[\s\S]*?<meta\s+property="og:description"[^>]*>/i

/**
 * 注入 OG meta：只替换 index.html 预留的占位锚点区（不粗暴整页替换）
 * 结构变化导致锚点缺失时原样返回（fail-open，静态默认 meta 兜底）
 */
export function injectOgMeta(html: string, og: OgData): string {
  const block = [
    `<meta property="og:title" content="${escapeHtml(og.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(og.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(og.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(og.image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(og.imageAlt)}" />`
  ].join('\n  ')

  return OG_ANCHOR_RE.test(html)
    ? html.replace(OG_ANCHOR_RE, block)
    : html
}
