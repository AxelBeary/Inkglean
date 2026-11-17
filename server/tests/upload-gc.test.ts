import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, readdirSync } from 'fs'
import { join } from 'path'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'

// ============================================
// 孤儿文件 GC 测试（P0-2 黑名单机制 + 回收站 TTL + 审计批E：R-6 窗口 72h / R-20 埋点 TTL / P3-24 动态扫描收敛）
// 覆盖验收三场景：引用中不删 / 无引用可删（移入回收站）/ 回收站超期删
// 原理：buildApp 启动时立即执行一次 gcUploads()，用临时 UPLOAD_DIR 造场景后断言文件系统
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR as string

/** 在 UPLOAD_DIR 下造一个 mtime 为 80h 前（超过 R-6 的 72h 回收窗口）的文件 */
function createOldFile(rel: string): string {
  const abs = join(UPLOAD_DIR, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'test-content')
  const past = new Date(Date.now() - 80 * 60 * 60 * 1000)
  utimesSync(abs, past, past)
  return abs
}

/** 递归查找某相对路径是否存在于目录树 */
function findRecursive(dir: string, rel: string): boolean {
  if (!existsSync(dir)) return false
  const target = join(dir, rel)
  if (existsSync(target)) return true
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (findRecursive(join(dir, e.name), rel)) return true
    }
  }
  return false
}

/**
 * U144：启动时的孤儿回收改为 setImmediate 延后执行，buildApp 返回时它可能还没跑。
 * setImmediate 队列 FIFO——这里排的回调必定排在启动回收之后，等它就等于等回收跑完。
 */
const flushStartupGc = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** buildApp + 等启动那一轮延后的孤儿回收跑完（旧用例默认「buildApp 返回时已回收」） */
async function buildAppAndFlush(): Promise<void> {
  await buildApp({ logger: false })
  await flushStartupGc()
}

describe('孤儿文件回收 GC（黑名单 + 回收站 TTL）', () => {
  beforeEach(() => {
    cleanDb()
    rmSync(UPLOAD_DIR, { recursive: true, force: true })
    mkdirSync(UPLOAD_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(UPLOAD_DIR, { recursive: true, force: true })
  })

  it('TC-GC-01: 引用中不删——artworks.image_path 引用的文件保留', async () => {
    const artist = seedArtist()
    // DB 引用一个文件 + 磁盘上存在该文件（mtime 超期，若不保护会被回收）
    const rel = 'images/1/ref-artwork.png'
    createOldFile(rel)
    db.prepare('INSERT INTO artworks (artist_id, image_path, title) VALUES (?, ?, ?)')
      .run(artist.id, rel, 'GC 测试作品')

    await buildAppAndFlush()

    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
    // 不应被移入回收站
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
  })

  it('TC-GC-02: 引用中不删——黑名单兜底：未登记白名单的表字段引用也保留', async () => {
    const artist = seedArtist()
    // P3-24（审计批E）收敛后已无显式 collect 清单：orders.focus_image_path 这类
    // 「只登记过白名单」的字段仍由全表动态扫描兜住（本用例即收敛回归验证）
    const rel = 'references/2/focus.png'
    createOldFile(rel)
    const order = seedOrder(artist.id, { order_no: 'GC-ORD' })
    db.prepare('UPDATE orders SET focus_image_path = ? WHERE id = ?').run(rel, order.id)

    await buildAppAndFlush()

    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
  })

  it('TC-GC-03: 无引用可删——孤儿文件被移入回收站（软删除，不物理删）', async () => {
    seedArtist()
    const rel = 'images/9/orphan.png'
    createOldFile(rel)

    await buildAppAndFlush()

    // 原位置已移走
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(false)
    // 回收站内存在（保留原始相对路径结构）
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(true)
  })

  it('TC-GC-04: 无引用可删——72h 内的新文件不回收', async () => {
    seedArtist()
    const rel = 'images/9/fresh.png'
    const abs = join(UPLOAD_DIR, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'fresh') // mtime = now，未超 72h（R-6 窗口）

    await buildAppAndFlush()

    expect(existsSync(abs)).toBe(true)
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
  })

  it('TC-GC-07: 埋点 TTL（R-20）——过期 events/anon_tokens 被删，近期与业务表保留', async () => {
    const artist = seedArtist()
    // 过期/近期 events（created_at 与写入方同口径：SQLite datetime 文本 UTC）
    db.prepare("INSERT INTO events (name, ts, artist_id, payload_json, created_at) VALUES ('dashboard_view', 1, ?, '{}', datetime('now', '-200 days'))").run(artist.id)
    db.prepare("INSERT INTO events (name, ts, artist_id, payload_json, created_at) VALUES ('queue_view', 2, ?, '{}', datetime('now', '-10 days'))").run(artist.id)
    // 过期/近期 anon_tokens
    db.prepare("INSERT INTO anon_tokens (token, created_at) VALUES ('old-token', datetime('now', '-40 days'))").run()
    db.prepare("INSERT INTO anon_tokens (token, created_at) VALUES ('fresh-token', datetime('now', '-5 days'))").run()
    // 业务/审计表不得被 TTL 清理（guestbook 为业务数据、order_activity_logs 永久保留）
    db.prepare("INSERT INTO guestbook_messages (artist_id, nickname, content, created_at) VALUES (?, 'old', '业务数据', datetime('now', '-200 days'))").run(artist.id)
    const order = seedOrder(artist.id, { order_no: 'GC-TTL-ORD' })
    db.prepare("INSERT INTO order_activity_logs (order_id, action_type, actor, created_at) VALUES (?, 'note_update', 'artist', datetime('now', '-200 days'))").run(order.id)

    await buildAppAndFlush()

    expect((db.prepare("SELECT COUNT(*) AS c FROM events WHERE name = 'dashboard_view'").get() as { c: number }).c).toBe(0)
    expect((db.prepare("SELECT COUNT(*) AS c FROM events WHERE name = 'queue_view'").get() as { c: number }).c).toBe(1)
    expect((db.prepare("SELECT COUNT(*) AS c FROM anon_tokens WHERE token = 'old-token'").get() as { c: number }).c).toBe(0)
    expect((db.prepare("SELECT COUNT(*) AS c FROM anon_tokens WHERE token = 'fresh-token'").get() as { c: number }).c).toBe(1)
    expect((db.prepare("SELECT COUNT(*) AS c FROM guestbook_messages").get() as { c: number }).c).toBe(1)
    expect((db.prepare("SELECT COUNT(*) AS c FROM order_activity_logs").get() as { c: number }).c).toBe(1)
  })

  it('TC-GC-08: P3-24 收敛——新表 TEXT 列自动被动态扫描覆盖（无需登记显式清单）', async () => {
    seedArtist()
    // 模拟未来新增引用表：不在任何显式清单里，动态扫描应自动把带路径的值视为引用
    db.exec('CREATE TABLE IF NOT EXISTS gc_probe_refs (id INTEGER PRIMARY KEY, file_path TEXT)')
    try {
      const rel = 'deliverables/7/probe.png'
      createOldFile(rel)
      db.prepare('INSERT INTO gc_probe_refs (file_path) VALUES (?)').run(rel)

      await buildAppAndFlush()

      expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
      expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
    } finally {
      db.exec('DROP TABLE IF EXISTS gc_probe_refs')
    }
  })

  it('TC-GC-05: 回收站超期删——30 天前的回收站日期目录被物理删除', async () => {
    seedArtist()
    // 造一个 35 天前的回收站日期目录
    const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    const oldDirName = oldDate.toISOString().slice(0, 10)
    const oldRel = join('.recycle-bin', oldDirName, 'images/1/old.png')
    const oldAbs = join(UPLOAD_DIR, oldRel)
    mkdirSync(join(oldAbs, '..'), { recursive: true })
    writeFileSync(oldAbs, 'old')
    // 目录 mtime 也设成过去（防止目录本身 mtime 干扰；TTL 按目录名日期判断）
    utimesSync(join(oldAbs, '..'), oldDate, oldDate)

    await buildAppAndFlush()

    expect(existsSync(join(UPLOAD_DIR, '.recycle-bin', oldDirName))).toBe(false)
  })

  it('TC-GC-06: 回收站超期删——30 天内的回收站目录保留', async () => {
    seedArtist()
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const recentName = recent.toISOString().slice(0, 10)
    const rel = join('.recycle-bin', recentName, 'images/2/keep.png')
    const abs = join(UPLOAD_DIR, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'keep')

    await buildAppAndFlush()

    expect(existsSync(join(UPLOAD_DIR, '.recycle-bin', recentName))).toBe(true)
    expect(existsSync(abs)).toBe(true)
  })

  it('TC-GC-09: 反斜杠分隔符的入库值同样算引用（U144 谓词下推分支回归）', async () => {
    const artist = seedArtist()
    const rel = 'images/4/backslash.png'
    createOldFile(rel)
    // Windows 风格反斜杠入库（历史导入数据里真实存在）：下推谓词必须同时认 '/' 与 '\'，
    // 漏掉反斜杠分支 = 这类引用全部失效，文件会被当孤儿移走（U144 改动最容易踩的点）
    db.prepare('INSERT INTO artworks (artist_id, image_path, title) VALUES (?, ?, ?)')
      .run(artist.id, rel.replace(/\//g, '\\'), '反斜杠引用')

    await buildAppAndFlush()

    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
  })

  it('TC-GC-10: 启动不再同步跑全库扫描——延到事件循环空闲期，且不会丢这一轮', async () => {
    seedArtist()
    createOldFile('images/9/deferred.png')

    // U144：用 db.prepare 探针观察「启动阶段有没有跑孤儿回收的全表 DISTINCT 扫描」。
    // 修复前 gcUploads() 同步跑在 buildApp 里 → buildApp 返回时扫描早已执行完；
    // 修复后扫描排在 setImmediate → buildApp 返回时一次都还没跑，等一轮空闲才跑。
    const origPrepare = db.prepare
    const seenSql: string[] = []
    db.prepare = ((sql: string) => {
      seenSql.push(sql)
      return origPrepare.call(db, sql)
    }) as typeof db.prepare
    const scanned = () => seenSql.some((sql) => sql.includes('SELECT DISTINCT "'))

    try {
      await buildApp({ logger: false })
      expect(scanned()).toBe(false) // 修复前必为 true：启动被同步扫描挡住
      await flushStartupGc()
      expect(scanned()).toBe(true) // 延后不等于不跑：空闲期照样扫一轮
    } finally {
      db.prepare = origPrepare
    }
  })
})
