import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, readdirSync } from 'fs'
import { join } from 'path'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'

// ============================================
// 孤儿文件 GC 测试（P0-2 黑名单机制 + 回收站 TTL）
// 覆盖验收三场景：引用中不删 / 无引用可删（移入回收站）/ 回收站超期删
// 原理：buildApp 启动时立即执行一次 gcUploads()，用临时 UPLOAD_DIR 造场景后断言文件系统
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR

/** 在 UPLOAD_DIR 下造一个 mtime 为 48h 前（满足 24h 回收门槛）的文件 */
function createOldFile(rel) {
  const abs = join(UPLOAD_DIR, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'test-content')
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000)
  utimesSync(abs, past, past)
  return abs
}

/** 递归查找某相对路径是否存在于目录树 */
function findRecursive(dir, rel) {
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

    await buildApp({ logger: false })

    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
    // 不应被移入回收站
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
  })

  it('TC-GC-02: 引用中不删——黑名单兜底：未登记白名单的表字段引用也保留', async () => {
    const artist = seedArtist()
    // orders.focus_image_path 不在显式 collect 白名单里，黑名单动态扫描应兜住
    const rel = 'references/2/focus.png'
    createOldFile(rel)
    const order = seedOrder(artist.id, { order_no: 'GC-ORD' })
    db.prepare('UPDATE orders SET focus_image_path = ? WHERE id = ?').run(rel, order.id)

    await buildApp({ logger: false })

    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(true)
  })

  it('TC-GC-03: 无引用可删——孤儿文件被移入回收站（软删除，不物理删）', async () => {
    seedArtist()
    const rel = 'images/9/orphan.png'
    createOldFile(rel)

    await buildApp({ logger: false })

    // 原位置已移走
    expect(existsSync(join(UPLOAD_DIR, rel))).toBe(false)
    // 回收站内存在（保留原始相对路径结构）
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(true)
  })

  it('TC-GC-04: 无引用可删——24h 内的新文件不回收', async () => {
    seedArtist()
    const rel = 'images/9/fresh.png'
    const abs = join(UPLOAD_DIR, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'fresh') // mtime = now，未超 24h

    await buildApp({ logger: false })

    expect(existsSync(abs)).toBe(true)
    expect(findRecursive(join(UPLOAD_DIR, '.recycle-bin'), rel)).toBe(false)
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

    await buildApp({ logger: false })

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

    await buildApp({ logger: false })

    expect(existsSync(join(UPLOAD_DIR, '.recycle-bin', recentName))).toBe(true)
    expect(existsSync(abs)).toBe(true)
  })
})
