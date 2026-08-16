import db from '../../db/connection.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 问候语服务
// 817 重构（用户拍板终稿 2026-08-16）：7 档时段全覆盖 + 加权随机抽取
// 抽取优先级链：特别日命中 → 加权随机（时段池40%/画师时段专属40%/全天20%）→ 默认兜底
// 回落链：画师专属池空→时段池；时段池空→全天池；全天池空→默认问候
// ============================================

/** 7 档时段（v67 重构；旧 6 档 morning/afternoon/evening/night/latenight/any 已由迁移 v67 搬家） */
export const SLOTS = ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any']

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
 * 获取当前时段（7 档全覆盖无空档，用户拍板终稿）：
 * 清晨 4:00~6:59 ｜ 上午 7:00~11:59 ｜ 午后 12:00~13:59 ｜ 下午 14:00~17:59
 * 夜晚 18:00~21:59 ｜ 深夜 22:00~3:59 ｜ 全天（任意时刻万能兜底，非时段判定值）
 * 时区铁律：取本机本地时间（部署强制 TZ=Asia/Shanghai）。
 */
export function getCurrentSlot(now: Date = new Date()): string {
  const h = now.getHours()
  if (h >= 4 && h <= 6) return 'early'
  if (h >= 7 && h <= 11) return 'morning'
  if (h >= 12 && h <= 13) return 'noon'
  if (h >= 14 && h <= 17) return 'afternoon'
  if (h >= 18 && h <= 21) return 'evening'
  return 'midnight'
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
 * 时段池抽取（只抽未挂特别日的启用文案，随机一条）。
 * 特别日文案（special_day_id 非空）不参与普通投放，只在特别日链命中。
 */
function drawRandom(sql: string, ...params: unknown[]): TemplateDrawRow | undefined {
  return db.prepare(sql).get(...params) as TemplateDrawRow | undefined
}

/** 时段池：系统通用（artist_id 为空）且 time_slot=当前时段 */
function drawSystemSlotPool(slot: string): TemplateDrawRow | undefined {
  return drawRandom(`
    SELECT text, time_slot FROM greeting_templates
    WHERE is_enabled = 1 AND special_day_id IS NULL
      AND artist_id IS NULL AND time_slot = ?
    ORDER BY RANDOM() LIMIT 1
  `, slot)
}

/** 画师时段专属池：artist_id=该画师 且 time_slot=当前时段 */
function drawArtistSlotPool(artistId: number, slot: string): TemplateDrawRow | undefined {
  return drawRandom(`
    SELECT text, time_slot FROM greeting_templates
    WHERE is_enabled = 1 AND special_day_id IS NULL
      AND artist_id = ? AND time_slot = ?
    ORDER BY RANDOM() LIMIT 1
  `, artistId, slot)
}

/** 全天池：time_slot='any'（不分归属） */
function drawAnyPool(artistId: number): TemplateDrawRow | undefined {
  return drawRandom(`
    SELECT text, time_slot FROM greeting_templates
    WHERE is_enabled = 1 AND special_day_id IS NULL
      AND (artist_id IS NULL OR artist_id = ?) AND time_slot = 'any'
    ORDER BY RANDOM() LIMIT 1
  `, artistId)
}

/** 抽取选项（测试可注入骰子与时钟，生产缺省随机） */
export interface DrawOptions {
  /** 加权骰子 0~99（测试注入；缺省 Math.random） */
  roll?: number
  /** 当前时刻（测试注入；缺省 new Date()） */
  now?: Date
}

/**
 * 为画师抽取一条问候语（用户拍板终稿：「节日>（时段40%、画师时段专属40%、全天20%）随机>兜底」）
 * 优先级链：
 *   1. 节日层：当天 date_key 命中、启用的特别日（全平台或该画师专属）
 *      → 从该日关联的启用文案随机一条，结束
 *   2. 加权随机层：掷骰子 0~99
 *      - 0~39  → 时段池（系统通用+当前时段）；池空 → 全天池
 *      - 40~79 → 画师时段专属池；池空 → 时段池 → 全天池
 *      - 80~99 → 全天池（time_slot='any' 不分归属）
 *   3. 兜底层：全空 → 默认问候「你好，{name}」
 */
export function drawGreeting(artistId: number, artistName: string, opts: DrawOptions = {}): { text: string; slot: string } {
  const now = opts.now ?? new Date()
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

  // 2) 加权随机层：时段池 40% / 画师时段专属池 40% / 全天池 20%
  const roll = opts.roll ?? Math.floor(Math.random() * 100)
  const slot = getCurrentSlot(now)

  let row: TemplateDrawRow | undefined
  if (roll < 40) {
    // 时段池；池空 → 全天池（用户确认回落规则）
    row = drawSystemSlotPool(slot) ?? drawAnyPool(artistId)
  } else if (roll < 80) {
    // 画师时段专属池；池空 → 时段池 → 全天池
    row = drawArtistSlotPool(artistId, slot) ?? drawSystemSlotPool(slot) ?? drawAnyPool(artistId)
  } else {
    // 全天池；池空 → 默认问候
    row = drawAnyPool(artistId)
  }

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
