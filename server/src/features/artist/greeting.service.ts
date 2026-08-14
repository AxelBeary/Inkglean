import db from '../../db/connection.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 问候语服务
// E5（814 波 4）：池扩展——深夜池（latenight）+ 可配置特别日池
// 抽取优先级链：特别日命中 → 深夜池 → 普通时段池 → any → 默认兜底
// ============================================

const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'latenight', 'any']

/** 问候语模板行 */
interface GreetingTemplate {
  id: number
  artist_id: number | null
  text: string
  time_slot: string
  is_enabled: number
  special_day_id: number | null
}

/** 特别日行 */
export interface SpecialDay {
  id: number
  name: string
  date_key: string
  artist_id: number | null
  is_enabled: number
}

/** 特别日列表行（附带关联文案数） */
export interface SpecialDayListItem extends SpecialDay {
  greeting_count: number
}

/** 抽取结果行 */
interface TemplateDrawRow {
  text: string
  time_slot: string
}

/**
 * 获取当前时段
 * 注意：23~4 点返回 'night'（既有划分不动）；深夜池 latenight 由 isLatenightHour
 * 在同区间内优先抽取，池空再回落到 night/any——边界处理与既有划分一致。
 */
export function getCurrentSlot(): string {
  const h = new Date().getHours()
  if (h >= 5 && h <= 10) return 'morning'
  if (h >= 11 && h <= 17) return 'afternoon'
  if (h >= 18 && h <= 22) return 'evening'
  return 'night'
}

/** 深夜窗口：23:00~次日 04:59（与 getCurrentSlot 的 night 区间一致） */
export function isLatenightHour(hour: number): boolean {
  return hour >= 23 || hour < 5
}

/**
 * 今日 date_key（'MM-DD'，年重复）。
 * 时区铁律：与 getCurrentSlot 同口径取本机本地时间（部署强制 TZ=Asia/Shanghai）。
 */
export function getTodayDateKey(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/** MM-DD 严格校验：两位月(01-12)-两位日(01-31)。02-30 之类永不命中的组合允许录入但不影响抽取 */
export function isValidDateKey(key: unknown): boolean {
  if (typeof key !== 'string' || !/^\d{2}-\d{2}$/.test(key)) return false
  const [mm, dd] = key.split('-').map(Number)
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31
}

/** {name} 占位符替换（空名回退「画师」） */
function fillName(text: string, artistName: string): string {
  return text.replace(/\{name\}/g, artistName || '画师')
}

/**
 * 时段池抽取：只抽未挂特别日的启用文案（通用 + 该画师专属），随机一条。
 * 特别日文案（special_day_id 非空）不参与普通投放，只在特别日链命中。
 */
function drawFromPool(artistId: number, slots: string[]): TemplateDrawRow | undefined {
  const placeholders = slots.map(() => '?').join(', ')
  return db.prepare(`
    SELECT text, time_slot FROM greeting_templates
    WHERE is_enabled = 1
      AND special_day_id IS NULL
      AND (artist_id IS NULL OR artist_id = ?)
      AND time_slot IN (${placeholders})
    ORDER BY RANDOM()
    LIMIT 1
  `).get(artistId, ...slots) as TemplateDrawRow | undefined
}

/**
 * 为画师抽取一条问候语
 * 优先级链：
 *   1. 特别日池（最高）：当天 date_key 命中、启用的特别日（全平台或该画师专属）
 *      → 从该日关联的启用文案随机一条；miss 继续
 *   2. 深夜池：23:00~次日 04:59 优先抽 latenight 池；池空回落
 *   3. 普通时段池 + any 兜底
 *   4. 全空 → 默认问候
 */
export function drawGreeting(artistId: number, artistName: string): { text: string; slot: string } {
  const now = new Date()
  const name = artistName || '画师'

  // 1) 特别日池：日期命中 + 日启用 + 文案启用（范围：全平台 OR 该画师专属）
  const special = db.prepare(`
    SELECT t.text, t.time_slot FROM greeting_templates t
    JOIN greeting_special_days d ON d.id = t.special_day_id
    WHERE t.is_enabled = 1
      AND d.is_enabled = 1
      AND (d.artist_id IS NULL OR d.artist_id = ?)
      AND d.date_key = ?
    ORDER BY RANDOM()
    LIMIT 1
  `).get(artistId, getTodayDateKey(now)) as TemplateDrawRow | undefined
  if (special) {
    return { text: fillName(special.text, name), slot: 'special' }
  }

  // 2) 深夜池：窗口内优先 latenight（不含 any），池空回落普通链
  if (isLatenightHour(now.getHours())) {
    const late = drawFromPool(artistId, ['latenight'])
    if (late) {
      return { text: fillName(late.text, name), slot: late.time_slot }
    }
  }

  // 3) 普通时段池 + any 兜底（合并查询随机，保持既有行为）
  const slot = getCurrentSlot()
  const row = drawFromPool(artistId, [slot, 'any'])
  const text = row ? fillName(row.text, name) : `你好，${name}`
  return { text, slot: row?.time_slot || 'any' }
}

// ─── 通用库 CRUD ───

export function getGlobalGreetings(slot?: string): GreetingTemplate[] {
  // 特别日文案不进普通池列表（投放链路互相隔离）
  if (slot && SLOTS.includes(slot)) {
    return db.prepare('SELECT * FROM greeting_templates WHERE artist_id IS NULL AND special_day_id IS NULL AND time_slot = ? ORDER BY id').all(slot) as GreetingTemplate[]
  }
  return db.prepare('SELECT * FROM greeting_templates WHERE artist_id IS NULL AND special_day_id IS NULL ORDER BY id').all() as GreetingTemplate[]
}

export function createGlobalGreeting({ text, timeSlot, specialDayId }: { text: string; timeSlot?: string; specialDayId?: number }): GreetingTemplate | undefined {
  const slot = SLOTS.includes(timeSlot || '') ? timeSlot : 'any'
  // d2 P2: 问候语 text 写路径最小清洗（读路径保持原样，纯文本语义）
  const result = db.prepare(
    'INSERT INTO greeting_templates (artist_id, text, time_slot, special_day_id) VALUES (NULL, ?, ?, ?)'
  ).run(sanitizeStoredText(text), slot, specialDayId ?? null)
  return db.prepare('SELECT * FROM greeting_templates WHERE id = ?').get(Number(result.lastInsertRowid)) as GreetingTemplate | undefined
}

export function updateGreeting(id: number, { text, timeSlot, isEnabled, specialDayId }: { text?: string; timeSlot?: string; isEnabled?: boolean; specialDayId?: number | null }): GreetingTemplate | undefined | null {
  const updates: string[] = []
  const values: unknown[] = []
  if (text !== undefined) { updates.push('text = ?'); values.push(sanitizeStoredText(String(text))) }
  if (timeSlot !== undefined && SLOTS.includes(timeSlot)) { updates.push('time_slot = ?'); values.push(timeSlot) }
  if (isEnabled !== undefined) { updates.push('is_enabled = ?'); values.push(isEnabled ? 1 : 0) }
  if (specialDayId !== undefined) { updates.push('special_day_id = ?'); values.push(specialDayId) }
  if (updates.length === 0) return null
  values.push(id)
  db.prepare(`UPDATE greeting_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM greeting_templates WHERE id = ?').get(id) as GreetingTemplate | undefined
}

export function deleteGreeting(id: number): void {
  db.prepare('DELETE FROM greeting_templates WHERE id = ?').run(id)
}

// ─── 画师专属库 CRUD ───

export function getArtistGreetings(artistId: number): GreetingTemplate[] {
  // 特别日文案不进专属池列表（同上隔离）
  return db.prepare('SELECT * FROM greeting_templates WHERE artist_id = ? AND special_day_id IS NULL ORDER BY id').all(artistId) as GreetingTemplate[]
}

export function createArtistGreeting(artistId: number, { text, timeSlot, specialDayId }: { text: string; timeSlot?: string; specialDayId?: number }): GreetingTemplate | undefined {
  const slot = SLOTS.includes(timeSlot || '') ? timeSlot : 'any'
  // d2 P2: 与全局问候语同口径清洗（专属库同样会投放到画师后台）
  const result = db.prepare(
    'INSERT INTO greeting_templates (artist_id, text, time_slot, special_day_id) VALUES (?, ?, ?, ?)'
  ).run(artistId, sanitizeStoredText(text), slot, specialDayId ?? null)
  return db.prepare('SELECT * FROM greeting_templates WHERE id = ?').get(Number(result.lastInsertRowid)) as GreetingTemplate | undefined
}

// ─── 特别日 CRUD（E5 波 4） ───

export function listSpecialDays(): SpecialDayListItem[] {
  return db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM greeting_templates t WHERE t.special_day_id = d.id) AS greeting_count
    FROM greeting_special_days d
    ORDER BY d.date_key, d.id
  `).all() as SpecialDayListItem[]
}

export function getSpecialDay(id: number): SpecialDay | undefined {
  return db.prepare('SELECT * FROM greeting_special_days WHERE id = ?').get(id) as SpecialDay | undefined
}

/** 创建特别日；dateKey 非法或画师范围不存在返回 undefined（路由层转 400/404） */
export function createSpecialDay({ name, dateKey, artistId }: { name: string; dateKey: string; artistId: number | null }): SpecialDay | undefined {
  if (!isValidDateKey(dateKey)) return undefined
  // name 为纯文本展示字段，与问候文案同口径消毒
  const result = db.prepare(
    'INSERT INTO greeting_special_days (name, date_key, artist_id) VALUES (?, ?, ?)'
  ).run(sanitizeStoredText(name), dateKey, artistId)
  return getSpecialDay(Number(result.lastInsertRowid))
}

/** 启停特别日（停用当天即退出抽取链） */
export function setSpecialDayEnabled(id: number, isEnabled: boolean): SpecialDay | undefined {
  db.prepare('UPDATE greeting_special_days SET is_enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, id)
  return getSpecialDay(id)
}

/** 删除特别日——关联文案经 FK ON DELETE CASCADE 级联删除 */
export function deleteSpecialDay(id: number): void {
  db.prepare('DELETE FROM greeting_special_days WHERE id = ?').run(id)
}

/** 某特别日关联的全部文案（含停用，管理端可见可删） */
export function getSpecialDayGreetings(specialDayId: number): GreetingTemplate[] {
  return db.prepare('SELECT * FROM greeting_templates WHERE special_day_id = ? ORDER BY id').all(specialDayId) as GreetingTemplate[]
}
