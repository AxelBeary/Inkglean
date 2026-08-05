/**
 * 社交平台服务（REQ-022 F2-1）
 *
 * social_platforms 表 CRUD + 画师链接引用的平台清理（DELETE 时归「其他」）。
 * 平台的 match_domains 是后端重推导 platformId 的唯一权威来源。
 */

import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { derivePlatformId } from '../../shared/utils/platform.js'

export interface SocialPlatform {
  id: number
  name: string
  icon_key: string
  fallback_char: string | null
  match_domains: string // JSON 数组字符串
  sort_order: number
  enabled: number
}

interface PlatformInput {
  name: string
  icon_key?: string | null
  fallback_char?: string | null
  match_domains?: string[] | null
  sort_order?: number | null
  enabled?: boolean | number | null
}

function rowToPlatform(row: SocialPlatform) {
  let domains: string[] = []
  try {
    const parsed = JSON.parse(row.match_domains)
    if (Array.isArray(parsed)) domains = parsed.filter((x): x is string => typeof x === 'string')
  } catch { /* 脏数据容错：视为空域名表 */ }
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key,
    fallbackChar: row.fallback_char || null,
    matchDomains: domains,
    sortOrder: row.sort_order ?? 0,
    enabled: !!row.enabled
  }
}

/** 公开：仅启用平台（下拉 + 前端识别体验层用） */
export function getEnabledPlatforms() {
  const rows = db.prepare(
    'SELECT * FROM social_platforms WHERE enabled = 1 ORDER BY sort_order ASC, id ASC'
  ).all() as SocialPlatform[]
  return rows.map(rowToPlatform)
}

/** 管理端：全量含停用 */
export function getAllPlatforms() {
  const rows = db.prepare(
    'SELECT * FROM social_platforms ORDER BY sort_order ASC, id ASC'
  ).all() as SocialPlatform[]
  return rows.map(rowToPlatform)
}

export function getPlatformById(id: number): SocialPlatform | undefined {
  return db.prepare('SELECT * FROM social_platforms WHERE id = ?').get(id) as SocialPlatform | undefined
}

function validatePlatformInput(input: PlatformInput, excludeId?: number) {
  const name = String(input.name || '').trim()
  if (!name) {
    throw new AppError(E.PLATFORM_NAME_EMPTY)
  }
  // icon_key 与 fallback_char 至少给一个（白名单图标 或 单字兜底）
  const iconKey = input.icon_key != null ? String(input.icon_key).trim() : ''
  const fallbackChar = input.fallback_char != null ? String(input.fallback_char).trim() : ''
  if (!iconKey && !fallbackChar) {
    throw new AppError(E.PLATFORM_ICON_REQUIRED)
  }
  // match_domains：字符串数组，逐个校验域名形态（不含协议/路径/端口）
  const rawDomains = Array.isArray(input.match_domains) ? input.match_domains : []
  const domains: string[] = []
  for (const d of rawDomains) {
    const domain = String(d || '').toLowerCase().trim()
    if (!domain) continue
    // 域名形态：字母/数字/连字符/点组成，不含 : / ? # 空格；禁止以 . 开头/结尾
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      throw new AppError(E.PLATFORM_DOMAIN_INVALID, 400, { domain })
    }
    domains.push(domain)
  }
  // 域名冲突检测：同一域名不允许挂在两个启用平台下（推导歧义）
  const conflictRows = db.prepare(
    excludeId
      ? 'SELECT match_domains FROM social_platforms WHERE id != ? AND enabled = 1'
      : 'SELECT match_domains FROM social_platforms WHERE enabled = 1'
  ).all(...(excludeId ? [excludeId] : [])) as Array<{ match_domains: string }>
  const taken = new Set<string>()
  for (const r of conflictRows) {
    try {
      const parsed = JSON.parse(r.match_domains)
      if (Array.isArray(parsed)) {
        for (const d of parsed) if (typeof d === 'string') taken.add(d.toLowerCase())
      }
    } catch { /* 脏数据跳过 */ }
  }
  for (const domain of domains) {
    if (taken.has(domain)) {
      throw new AppError(E.PLATFORM_DOMAIN_TAKEN, 400, { domain })
    }
  }
  return { name, iconKey, fallbackChar, domains }
}

export function createPlatform(input: PlatformInput) {
  const { name, iconKey, fallbackChar, domains } = validatePlatformInput(input)
  const result = db.prepare(`
    INSERT INTO social_platforms (name, icon_key, fallback_char, match_domains, sort_order, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    iconKey || null,
    fallbackChar || null,
    JSON.stringify(domains),
    input.sort_order ?? 0,
    input.enabled === false || input.enabled === 0 ? 0 : 1
  )
  return rowToPlatform(getPlatformById(Number(result.lastInsertRowid))!)
}

export function updatePlatform(id: number, input: PlatformInput) {
  const existing = getPlatformById(id)
  if (!existing) {
    throw new AppError(E.PLATFORM_NOT_FOUND, 404)
  }
  const merged: PlatformInput = {
    name: input.name ?? existing.name,
    icon_key: input.icon_key !== undefined ? input.icon_key : existing.icon_key,
    fallback_char: input.fallback_char !== undefined ? input.fallback_char : existing.fallback_char,
    match_domains: input.match_domains !== undefined ? input.match_domains : JSON.parse(existing.match_domains || '[]'),
    sort_order: input.sort_order !== undefined ? input.sort_order : existing.sort_order,
    enabled: input.enabled !== undefined ? input.enabled : existing.enabled
  }
  const { name, iconKey, fallbackChar, domains } = validatePlatformInput(merged, id)
  db.prepare(`
    UPDATE social_platforms
    SET name = ?, icon_key = ?, fallback_char = ?, match_domains = ?, sort_order = ?, enabled = ?
    WHERE id = ?
  `).run(
    name,
    iconKey || null,
    fallbackChar || null,
    JSON.stringify(domains),
    merged.sort_order ?? 0,
    merged.enabled === false || merged.enabled === 0 ? 0 : 1,
    id
  )
  return rowToPlatform(getPlatformById(id)!)
}

/**
 * 删除平台（一号定案）：事务内先把所有画师 custom_links 中引用该平台的
 * 条目 platformId 置 null（归「其他」），再删平台行。不级联删链接。
 */
export function deletePlatform(id: number): { reattributed: number } {
  const existing = getPlatformById(id)
  if (!existing) {
    throw new AppError(E.PLATFORM_NOT_FOUND, 404)
  }
  let reattributed = 0
  const tx = db.transaction(() => {
    // 扫描所有画师的 custom_links JSON，命中 platformId=id 的置 null
    const rows = db.prepare(
      'SELECT id, custom_links FROM artists WHERE custom_links IS NOT NULL AND custom_links != \'[]\''
    ).all() as Array<{ id: number; custom_links: string }>
    const update = db.prepare('UPDATE artists SET custom_links = ? WHERE id = ?')
    for (const row of rows) {
      let links: Array<{ platformId: number | null; url: string }> = []
      try {
        const parsed = JSON.parse(row.custom_links)
        if (!Array.isArray(parsed)) continue
        links = parsed
      } catch { continue }
      let touched = false
      const normalized = links.map(link => {
        if (link && link.platformId === id) {
          touched = true
          reattributed++
          return { platformId: null, url: link.url }
        }
        return link
      })
      if (touched) {
        update.run(JSON.stringify(normalized), row.id)
      }
    }
    db.prepare('DELETE FROM social_platforms WHERE id = ?').run(id)
  })
  tx()
  return { reattributed }
}

/**
 * 保存链接前的后端权威重推导：忽略前端传的 platformId，按 URL 重新推导。
 * platforms 参数缺省时读全量启用平台。
 */
export function rederivePlatformId(
  url: string,
  platforms?: Array<{ id: number; match_domains: string }>
): number | null {
  const list = platforms
    ?? (db.prepare('SELECT id, match_domains FROM social_platforms WHERE enabled = 1').all() as Array<{ id: number; match_domains: string }>)
  return derivePlatformId(url, list)
}
