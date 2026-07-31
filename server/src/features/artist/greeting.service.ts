import db from '../../db/connection.js'

// ============================================
// 问候语服务
// ============================================

const SLOTS = ['morning', 'afternoon', 'evening', 'night', 'any']

/** 问候语模板行 */
interface GreetingTemplate {
  id: number
  artist_id: number | null
  text: string
  time_slot: string
  is_enabled: number
}

/**
 * 获取当前时段
 */
export function getCurrentSlot(): string {
  const h = new Date().getHours()
  if (h >= 5 && h <= 10) return 'morning'
  if (h >= 11 && h <= 17) return 'afternoon'
  if (h >= 18 && h <= 22) return 'evening'
  return 'night'
}

/**
 * 为画师抽取一条问候语
 * 合并通用库 + 专属库，按时段过滤，随机取一条
 */
export function drawGreeting(artistId: number, artistName: string): { text: string; slot: string } {
  const slot = getCurrentSlot()
  const row = db.prepare(`
    SELECT text, time_slot FROM greeting_templates
    WHERE is_enabled = 1
      AND (artist_id IS NULL OR artist_id = ?)
      AND time_slot IN (?, 'any')
    ORDER BY RANDOM()
    LIMIT 1
  `).get(artistId, slot) as { text: string; time_slot: string } | undefined

  const text = row ? row.text.replace(/\{name\}/g, artistName || '画师') : `你好，${artistName || '画师'}`
  return { text, slot: row?.time_slot || 'any' }
}

// ─── 通用库 CRUD ───

export function getGlobalGreetings(slot?: string): GreetingTemplate[] {
  if (slot && SLOTS.includes(slot)) {
    return db.prepare('SELECT * FROM greeting_templates WHERE artist_id IS NULL AND time_slot = ? ORDER BY id').all(slot) as GreetingTemplate[]
  }
  return db.prepare('SELECT * FROM greeting_templates WHERE artist_id IS NULL ORDER BY id').all() as GreetingTemplate[]
}

export function createGlobalGreeting({ text, timeSlot }: { text: string; timeSlot?: string }): GreetingTemplate | undefined {
  const slot = SLOTS.includes(timeSlot || '') ? timeSlot : 'any'
  const result = db.prepare(
    'INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, ?, ?)'
  ).run(text, slot)
  return db.prepare('SELECT * FROM greeting_templates WHERE id = ?').get(Number(result.lastInsertRowid)) as GreetingTemplate | undefined
}

export function updateGreeting(id: number, { text, timeSlot, isEnabled }: { text?: string; timeSlot?: string; isEnabled?: boolean }): GreetingTemplate | undefined | null {
  const updates: string[] = []
  const values: unknown[] = []
  if (text !== undefined) { updates.push('text = ?'); values.push(text) }
  if (timeSlot !== undefined && SLOTS.includes(timeSlot)) { updates.push('time_slot = ?'); values.push(timeSlot) }
  if (isEnabled !== undefined) { updates.push('is_enabled = ?'); values.push(isEnabled ? 1 : 0) }
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
  return db.prepare('SELECT * FROM greeting_templates WHERE artist_id = ? ORDER BY id').all(artistId) as GreetingTemplate[]
}

export function createArtistGreeting(artistId: number, { text, timeSlot }: { text: string; timeSlot?: string }): GreetingTemplate | undefined {
  const slot = SLOTS.includes(timeSlot || '') ? timeSlot : 'any'
  const result = db.prepare(
    'INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (?, ?, ?)'
  ).run(artistId, text, slot)
  return db.prepare('SELECT * FROM greeting_templates WHERE id = ?').get(Number(result.lastInsertRowid)) as GreetingTemplate | undefined
}
