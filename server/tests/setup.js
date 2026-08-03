/**
 * 测试共享设置：内存数据库 + 建表 + 清表工具
 *
 * 使用方式：
 *   import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
 *
 * 原理：vitest.config.js 设置 DB_PATH=':memory:'，
 * 所有 import connection.js 的模块共享同一个内存数据库实例。
 * 本文件导入 init.js 触发建表。
 */
import db from '../src/db/connection.js'
import { initDatabase } from '../src/db/init.js'
import { rmSync } from 'fs'
import { afterAll } from 'vitest'

// 显式建表（init.js 不再 import 时自动执行）
initDatabase(db)

// 事故修复：测试结束后清理临时上传目录（vitest.config.js 中 UPLOAD_DIR 指向 os.tmpdir() 子目录）
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
export function cleanDb() {
  db.exec(`
    DELETE FROM login_codes;
    DELETE FROM deliverables;
    DELETE FROM order_notes;
    DELETE FROM order_references;
    DELETE FROM order_price_breakdown;
    DELETE FROM order_extra_items;
    DELETE FROM order_payment_installments;
    DELETE FROM orders;
    DELETE FROM addon_tiers;
    DELETE FROM price_addons;
    DELETE FROM price_multipliers;
    DELETE FROM commission_rules;
    DELETE FROM artworks;
    DELETE FROM price_tiers;
    DELETE FROM artist_workflow_stages;
    DELETE FROM greeting_templates;
    DELETE FROM guestbook_messages;
    DELETE FROM artwork_size_tags;
    DELETE FROM size_addon_overrides;
    DELETE FROM style_addons;
    DELETE FROM style_sizes;
    DELETE FROM art_styles;
    DELETE FROM addon_templates;
    DELETE FROM artists;
  `)
}

/**
 * 快速创建一个测试画师，返回完整行
 * 自动生成 artist_code（子域名大写）
 */
export function seedArtist(overrides = {}) {
  const defaults = {
    qq_number: '12345',
    name: '测试画师',
    subdomain: 'alice',
    status: 'open'
  }
  const data = { ...defaults, ...overrides }
  const artistCode = data.artist_code || data.subdomain.toUpperCase()

  const result = db.prepare(`
    INSERT INTO artists (qq_number, name, subdomain, artist_code, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.qq_number, data.name, data.subdomain, artistCode, data.status)

  // 初始化须知
  db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)')
    .run(result.lastInsertRowid, '')

  return db.prepare('SELECT * FROM artists WHERE id = ?').get(result.lastInsertRowid)
}

let seedOrderCounter = 0

/**
 * 快速创建一个测试订单，返回完整行
 */
export function seedOrder(artistId, overrides = {}) {
  const defaults = {
    order_no: `TEST-${String(++seedOrderCounter).padStart(4, '0')}`,
    client_qq: '99999',
    priority: 'medium',
    status: 'pending',
    source: 'self',
    queue_position: 1,
    queue_zone: 'formal'
  }
  const data = { ...defaults, ...overrides }

  const result = db.prepare(`
    INSERT INTO orders (order_no, artist_id, client_qq, client_name, description, priority, status, source, queue_position, queue_zone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.order_no, artistId, data.client_qq,
    data.client_name || null, data.description || null,
    data.priority, data.status, data.source, data.queue_position,
    data.queue_zone
  )

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid)
}
