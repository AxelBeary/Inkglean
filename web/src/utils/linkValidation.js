/**
 * 外链校验纯函数（REQ-022 F2 前端体验层）
 *
 * 安全边界在后端（server/src/shared/utils/platform.ts），此处只做体验层：
 * - 裸链补 https://（其他协议拒绝）
 * - 长度限制：域名 ≤253 / 路径+查询 ≤1500 / 总长 ≤1800
 * - 域名末尾匹配识别平台（weibo.com.evil.com / xweibo.com 一律不认）
 *
 * 铁律：前端校验只能是后端子集的弱化版——前端放过的，后端必须兜住；
 * 前端拦截的，理由必须与后端一致。
 */

export const MAX_HOSTNAME_LEN = 253
export const MAX_PATH_QUERY_LEN = 1500
export const MAX_URL_LEN = 1800
export const MAX_LINK_COUNT = 8

/** 归一化失败原因（与后端错误语义对齐） */
export const LINK_INVALID = 'invalid'
export const LINK_TOO_LONG = 'tooLong'

/**
 * 归一化用户输入的链接（与后端 normalizeLinkUrl 同逻辑，不抛异常改返回结果）
 * @param {string} raw 用户输入
 * @returns {{ ok: true, url: string } | { ok: false, reason: string }}
 */
export function normalizeLinkUrl(raw) {
  const input = typeof raw === 'string' ? raw.trim() : ''
  if (!input) return { ok: false, reason: LINK_INVALID }

  let candidate
  if (/^https?:\/\//i.test(input)) {
    candidate = input
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    // 冒号前缀：可能是危险协议，也可能是裸域名+端口（weibo.com:8080）
    const portForm = input.match(/^([^:/]+):(\d+)([/?#].*)?$/)
    if (portForm && portForm[1].includes('.')) {
      candidate = 'https://' + input
    } else {
      // javascript: / ftp:// / data: 等 → 拒绝
      return { ok: false, reason: LINK_INVALID }
    }
  } else {
    candidate = 'https://' + input
  }

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return { ok: false, reason: LINK_INVALID }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: LINK_INVALID }
  }
  if (!parsed.hostname) return { ok: false, reason: LINK_INVALID }
  return { ok: true, url: parsed.toString() }
}

/**
 * 长度校验（对归一化后的 URL）
 * @param {string} url
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkLinkLength(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: LINK_INVALID }
  }
  if (
    parsed.hostname.length > MAX_HOSTNAME_LEN ||
    (parsed.pathname + parsed.search).length > MAX_PATH_QUERY_LEN ||
    url.length > MAX_URL_LEN
  ) {
    return { ok: false, reason: LINK_TOO_LONG }
  }
  return { ok: true }
}

/**
 * 域名末尾匹配（防投毒核心，与后端 matchDomain 同逻辑）
 * hostname === 域名 或以 `.域名` 结尾才算命中；比较前双方小写化。
 * @param {string} hostname
 * @param {string[]} matchDomains
 * @returns {boolean}
 */
export function matchDomain(hostname, matchDomains) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  return (matchDomains || []).some((d) => {
    const domain = String(d || '').toLowerCase().replace(/^\.+/, '')
    if (!domain) return false
    return host === domain || host.endsWith('.' + domain)
  })
}

/**
 * 组合校验 + 平台识别：一行完整体验层逻辑（Settings.vue 粘贴/保存共用）
 * @param {string} raw 用户输入
 * @param {Array<{ id: number, matchDomains: string[] }>} platforms GET /api/platforms 启用列表
 * @returns {{ ok: true, url: string, platformId: number | null } | { ok: false, reason: string }}
 */
export function validateLink(raw, platforms) {
  const normalized = normalizeLinkUrl(raw)
  if (!normalized.ok) return normalized
  const lengthCheck = checkLinkLength(normalized.url)
  if (!lengthCheck.ok) return lengthCheck

  let platformId = null
  try {
    const hostname = new URL(normalized.url).hostname
    const hit = (platforms || []).find((p) =>
      matchDomain(hostname, Array.isArray(p.matchDomains) ? p.matchDomains : [])
    )
    if (hit) platformId = hit.id
  } catch { /* 解析失败走「其他」 */ }

  return { ok: true, url: normalized.url, platformId }
}
