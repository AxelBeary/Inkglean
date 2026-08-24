/**
 * 测试共享设置：内存数据库 + 建表 + 清表工具
 *
 * 使用方式：
 *   import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
 *
 * 原理：vitest.config.ts 设置 DB_PATH=':memory:'，
 * 所有 import connection.js 的模块共享同一个内存数据库实例。
 * 本文件导入 init.js 触发建表。
 */
import db from '../src/db/connection.js'
import { initDatabase } from '../src/db/init.js'
import { createHash, randomBytes } from 'crypto'
import { rmSync } from 'fs'
import { afterAll } from 'vitest'
import type { Artist, Order } from '../src/types/entities.js'

/** 测试用画师行：Artist 已知字段带类型，其余列按 unknown 透传（测试可访问任意列） */
export type ArtistRow = Artist & Record<string, unknown>

/** 测试用订单行：Order 已知字段带类型，其余列按 unknown 透传（测试可访问任意列） */
export type OrderRow = Order & Record<string, unknown>

/** seedOrder 返回值：订单行 + 客户令牌明文 */
export type SeededOrder = OrderRow & { customerToken: string }

// 显式建表（init.js 不再 import 时自动执行）
initDatabase(db)

// 事故修复：测试结束后清理临时上传目录（vitest.config.ts 中 UPLOAD_DIR 指向 os.tmpdir() 子目录）
afterAll(() => {
  const uploadDir = process.env.UPLOAD_DIR
  if (uploadDir && uploadDir.includes('commission-test-uploads')) {
    try { rmSync(uploadDir, { recursive: true, force: true }) } catch { /* 静默 */ }
  }
})

export { db }

/**
 * 清空所有表（保留结构），按外键依赖顺序删除
 */
export function cleanDb(): void {
  db.exec(`
    DELETE FROM deliverables;
    DELETE FROM order_notes;
    DELETE FROM order_references;
    DELETE FROM order_price_breakdown;
    DELETE FROM order_extra_items;
    DELETE FROM order_price_entries;
    DELETE FROM order_payment_installments;
    DELETE FROM orders;
    DELETE FROM idempotency_keys;
    DELETE FROM commission_rules;
    DELETE FROM artworks;
    DELETE FROM artist_workflow_stages;
    DELETE FROM greeting_templates;
    DELETE FROM greeting_special_days;
    DELETE FROM guestbook_messages;
    DELETE FROM reports;
    DELETE FROM admin_actions;
    DELETE FROM artwork_size_tags;
    DELETE FROM size_addon_overrides;
    DELETE FROM style_addons;
    DELETE FROM style_sizes;
    DELETE FROM art_styles;
    -- v49 (REQ-036): 保留系统预置模板（artist_id NULL，initDatabase 自动种子），只清画师私有模板
    DELETE FROM addon_templates WHERE artist_id IS NOT NULL;
    DELETE FROM totp_used_codes;
    -- v73: 桌面设备账本引用 artists，须先于 artists 清理
    DELETE FROM desktop_devices;
    -- v71: 邀请码使用明细引用 artists，须先于 artists 清理（父表 invite_codes 随后）
    DELETE FROM invite_code_uses;
    DELETE FROM invite_codes;
    DELETE FROM artists;
    DELETE FROM social_platforms;
    DELETE FROM events;
    DELETE FROM anon_tokens;
  `)
}

/** seedArtist 默认列（overrides 按列名覆盖） */
const ARTIST_DEFAULTS = {
  qq_number: '12345',
  name: '测试画师',
  subdomain: 'alice',
  status: 'open',
  // 会话门禁批：种子画师默认「已绑定动态口令」（测试惯用占位密钥，
  // security-dto/last-login 等已有先例），避免 requireAuth/requireAdmin 的
  // TOTP_BIND_REQUIRED 新门禁误伤无关用例；需要未绑定态的用例显式传
  // totp_verified: 0（可配 totp_secret: null）覆盖。
  totp_secret: 'JBSWY3DPEHPK3PXP',
  totp_verified: 1
} as const

/**
 * 快速创建一个测试画师，返回完整行
 * 自动生成 artist_code（子域名大写）
 */
export function seedArtist(overrides: Record<string, unknown> = {}): ArtistRow {
  const data: Record<string, unknown> = { ...ARTIST_DEFAULTS, ...overrides }
  const artistCode = (data.artist_code as string | undefined) || (data.subdomain as string).toUpperCase()

  const result = db.prepare(`
    INSERT INTO artists (qq_number, name, subdomain, artist_code, status, totp_secret, totp_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.qq_number as string, data.name as string, data.subdomain as string, artistCode, data.status as string,
    (data.totp_secret as string | null) ?? null, (data.totp_verified as number) ?? 0
  )

  // 初始化须知
  db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)')
    .run(result.lastInsertRowid, '')

  return db.prepare('SELECT * FROM artists WHERE id = ?').get(result.lastInsertRowid) as ArtistRow
}

let seedOrderCounter = 0

/** seedOrder 默认列（overrides 按列名覆盖；customerToken 指定固定令牌明文） */
const ORDER_DEFAULTS = {
  client_qq: '99999',
  priority: 'medium',
  status: 'pending',
  source: 'self',
  queue_position: 1,
  queue_zone: 'formal'
} as const

/**
 * 快速创建一个测试订单，返回完整行
 * F1 围剿：默认同时生成客户令牌（哈希入库），返回对象附带 customerToken 明文，
 * 供 track/delivery 令牌门禁用例直接使用；overrides.customerToken 可指定固定令牌。
 */
export function seedOrder(artistId: number, overrides: Record<string, unknown> = {}): SeededOrder {
  const defaults = { order_no: `TEST-${String(++seedOrderCounter).padStart(4, '0')}`, ...ORDER_DEFAULTS }
  const data: Record<string, unknown> = { ...defaults, ...overrides }
  const customerToken = (data.customerToken as string | undefined) || `test-${randomBytes(12).toString('base64url')}`
  const customerTokenHash = createHash('sha256').update(customerToken).digest('hex')

  const result = db.prepare(`
    INSERT INTO orders (order_no, artist_id, client_qq, client_name, description, priority, status, source, queue_position, queue_zone, customer_token_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.order_no as string, artistId, data.client_qq as string,
    (data.client_name as string | null | undefined) ?? null,
    (data.description as string | null | undefined) ?? null,
    data.priority as string, data.status as string, data.source as string, data.queue_position as number,
    data.queue_zone as string, customerTokenHash
  )

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid) as OrderRow
  return { ...row, customerToken }
}
