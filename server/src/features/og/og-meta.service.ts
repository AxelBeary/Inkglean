import { getArtistBySubdomain } from '../artist/artist.service.js'
import { isArtistHomeHidden } from '../artist/artist-visibility.service.js'
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

/**
 * 缓存窗口：subdomain OG 数据内存缓存 5 分钟（Map + 时间戳），降低公开页 DB 压力。
 * 815 M-4：分享卡 URL 只以 DOMAIN 配置为来源，Host 头完全不参与；
 * 未配置 DOMAIN 时固定降级 localhost，且不启用缓存（防运行时改配置读到旧域）。
 *
 * SRV-05 修复：加条目上限 + LRU 淘汰——刷 /artist/随机串 不再无限撑内存。
 * 上限 500 条（按单条 ~1KB 估算 ≈ 500KB，对 Node 堆无感）；
 * 写入时超限则按插入序（Map 迭代序）删最旧条目直到降至上限。
 */
const OG_CACHE_TTL_MS = 5 * 60 * 1000
const OG_CACHE_MAX_ENTRIES = 500
const ogCache = new Map<string, { fetchedAt: number; data: OgData }>()

/** 测试/管理用：清空 OG 缓存（普通运行不需要） */
export function clearOgCache(): void {
  ogCache.clear()
}

/** 测试用：返回当前缓存条目数（SRV-05 回归断言用） */
export function getOgCacheSize(): number {
  return ogCache.size
}

/** 测试用：返回缓存上限常量 */
export const OG_CACHE_MAX = OG_CACHE_MAX_ENTRIES

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

/** 公开页可见性判定（对齐公开 API：封禁/隐藏/平台下架画师不注入个人 OG，回退默认） */
function isOgVisible(artist: Artist): boolean {
  if (artist.is_banned) return false
  // v76：隐身判定收敛到 helper，纳入平台下架；封禁仍是独立守卫
  // （OG 属「主页可见性」范畴，不下沉到 Invisible——deleted_at 已由 getArtistBySubdomain 过滤）
  return !isArtistHomeHidden(artist)
}

/** HTTPS 绝对地址：DOMAIN env 是唯一来源；缺失时如实降级为 localhost（绝不反射 Host 头） */
function absoluteUrl(path: string): string {
  let domain = (process.env.DOMAIN || 'localhost').replace(/^https?:\/\//i, '')
  while (domain.endsWith('/')) domain = domain.slice(0, -1)
  return `https://${domain}${path}`
}

/** 平台默认 OG（未找到画师/不可见画师时返回，不报错） */
function defaultOg(subdomain: string): OgData {
  const pageUrl = absoluteUrl(`/artist/${subdomain}`)
  return {
    title: '拾绘 Inkglean — 画师约稿平台',
    description: '开源，自部署，易操作。',
    url: pageUrl,
    image: absoluteUrl('/assets/logo.webp'),
    imageAlt: '拾绘 Inkglean'
  }
}

/**
 * SRV-05: LRU 淘汰——写入时超限则按 Map 迭代序（= 插入序）删最旧条目。
 * Map.delete + Map.set 对已存在 key 不改变迭代位置，因此先 delete 再 set 可把
 * 命中的热 key 移到尾部（最新位置），实现简易 LRU。
 */
function evictIfNeeded(): void {
  while (ogCache.size >= OG_CACHE_MAX_ENTRIES) {
    const oldest = ogCache.keys().next()
    if (oldest.done) break
    ogCache.delete(oldest.value)
  }
}

/**
 * 构建画师主页 OG 数据（subdomain → 内存缓存 5 分钟）
 * 未找到/不可见画师 → 默认 OG（不抛错）
 */
export function buildOgMeta(subdomain: string): OgData {
  // 815 M-4：Host 反射投毒面关闭——DOMAIN 未配置时固定降级 localhost，且不缓存
  const useCache = !!process.env.DOMAIN
  const cached = useCache ? ogCache.get(subdomain) : undefined
  if (cached && Date.now() - cached.fetchedAt < OG_CACHE_TTL_MS) {
    // SRV-05 LRU: 命中时刷新迭代位置（delete + set → 移到尾部 = 最近使用）
    ogCache.delete(subdomain)
    ogCache.set(subdomain, cached)
    return cached.data
  }

  // TTL 过期但键还在 → 先删旧键释放位（避免 evict 误删活跃条目）
  if (useCache && cached) {
    ogCache.delete(subdomain)
  }

  const artist = getArtistBySubdomain(subdomain)
  const data = !artist || !isOgVisible(artist)
    ? defaultOg(subdomain)
    : buildArtistOg(artist)

  if (useCache) {
    evictIfNeeded()
    ogCache.set(subdomain, { fetchedAt: Date.now(), data })
  }
  return data
}

/** 画师 OG 数据：标题 = 画师名｜拾绘；描述 = 简介截断 100 字（附接单状态）；图 = 头像（无头像用 logo 兜底） */
function buildArtistOg(artist: Artist): OgData {
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
    url: absoluteUrl(`/artist/${artist.subdomain}`),
    image: absoluteUrl(imagePath),
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
