/**
 * 外链防投毒工具（REQ-022 F2）
 *
 * 职责：URL 归一化 + 硬校验 + 域名末尾匹配（纯函数，不碰数据库）。
 * 安全边界 100% 在这里：前端识别只是体验层，保存时后端强制重推导。
 *
 * 硬规则（用户拍板三规则 + 派工）：
 * 1. 仅 http/https 协议；裸链自动补 https://；其他协议（javascript:/ftp:/data: 等）拒绝
 * 2. 长度限制：域名 ≤253 / 路径+查询 ≤1500 / 总长 ≤1800
 * 3. 域名末尾匹配：主机名 == 目标 或 以 .目标 结尾，其余归「其他」
 *    （weibo.com.evil.com / xweibo.com 一律不认 —— 防投毒核心）
 */

import { AppError, E } from '../errors.js'

// ─── 长度上限（拍板值） ───
export const MAX_HOSTNAME_LEN = 253
export const MAX_PATH_QUERY_LEN = 1500
export const MAX_URL_LEN = 1800
// 条数上限（派工：≤8）
export const MAX_LINK_COUNT = 8

/**
 * 裸链补全 + 协议白名单校验。
 *
 * 归一化策略：
 * - 已带 http:// 或 https:// 前缀 → 原样进入解析
 * - 带其他协议前缀（javascript: / ftp:// / data: 等）→ 拒绝
 * - 裸域名（可带端口/路径，如 weibo.com:8080/x）→ 补 https://
 *
 * 裸域名+端口的歧义处理：`weibo.com:8080` 形式上符合 RFC scheme 语法
 * （scheme 允许含点），但冒号后是纯数字端口时按「裸域名+端口」处理，
 * 补 https://；`javascript:alert(1)` 冒号后非数字端口 → 按危险协议拒绝。
 *
 * @param raw 用户输入的原始链接
 * @returns 归一化后的完整 URL（http/https）
 * @throws AppError LINK_URL_INVALID
 */
export function normalizeLinkUrl(raw: unknown): string {
  const input = typeof raw === 'string' ? raw.trim() : ''
  if (!input) {
    throw new AppError(E.LINK_URL_INVALID)
  }

  let candidate: string
  if (/^https?:\/\//i.test(input)) {
    // 明确的 http(s) 前缀
    candidate = input
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    // 冒号前缀：可能是危险协议，也可能是裸域名+端口
    const portForm = input.match(/^([^:/]+):(\d+)([/?#].*)?$/)
    if (portForm && portForm[1].includes('.')) {
      // weibo.com:8080 / example.com:443/path → 裸域名+端口，补全
      candidate = 'https://' + input
    } else {
      // javascript:alert(1) / ftp://x / data:text/html → 拒绝
      throw new AppError(E.LINK_URL_INVALID)
    }
  } else {
    // 无协议前缀的裸链 → 补 https://
    candidate = 'https://' + input
  }

  // 补全后仍必须解析为合法 http/https URL（兜底，防构造绕过）
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new AppError(E.LINK_URL_INVALID)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(E.LINK_URL_INVALID)
  }
  if (!parsed.hostname) {
    throw new AppError(E.LINK_URL_INVALID)
  }
  return parsed.toString()
}

/**
 * 长度硬校验（对归一化后的 URL）。
 * 域名 ≤253 / 路径+查询 ≤1500 / 总长 ≤1800，超限拒绝。
 * @throws AppError LINK_URL_INVALID
 */
export function assertLinkLengthLimits(url: string): void {
  const parsed = new URL(url)
  if (parsed.hostname.length > MAX_HOSTNAME_LEN
    || (parsed.pathname + parsed.search).length > MAX_PATH_QUERY_LEN
    || url.length > MAX_URL_LEN) {
    throw new AppError(E.LINK_URL_INVALID)
  }
}

/**
 * 域名末尾匹配（防投毒核心算法）。
 *
 * 主机名 == 目标域名，或以 `.目标域名` 结尾才算命中：
 * - weibo.com / m.weibo.com / weibo.com:8080（hostname 天然不含端口）✓
 * - weibo.com.evil.com ✗（以 evil.com 结尾，不以 weibo.com 结尾）
 * - xweibo.com ✗（不含 .weibo.com 后缀，前缀粘连不认）
 *
 * 比较前双方小写化（大小写混写照常匹配）。
 *
 * @param hostname URL 解析出的主机名（不含端口）
 * @param matchDomains 平台的候选域名列表
 * @returns 是否命中
 */
export function matchDomain(hostname: string, matchDomains: string[]): boolean {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  for (const d of matchDomains) {
    const domain = String(d || '').toLowerCase().trim()
    if (!domain) continue
    if (host === domain || host.endsWith('.' + domain)) return true
  }
  return false
}

/**
 * 从 URL 推导平台 id（后端权威推导，忽略前端传值）。
 * 按平台列表顺序取第一个命中的；未命中返回 null（归「其他」）。
 *
 * @param url 归一化后的完整 URL
 * @param platforms 平台列表 [{ id, match_domains(JSON 字符串数组) }]
 * @returns platformId 或 null
 */
export function derivePlatformId(
  url: string,
  platforms: Array<{ id: number; match_domains: string }>
): number | null {
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }
  for (const p of platforms) {
    let domains: string[] = []
    try {
      const parsed = JSON.parse(p.match_domains)
      if (Array.isArray(parsed)) domains = parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      continue
    }
    if (matchDomain(hostname, domains)) return p.id
  }
  return null
}
