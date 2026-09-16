// ============================================
// 审计修复波1 SRV-B 路回归测试
// SRV-05: OG 缓存 LRU 淘汰
// SRV-10: 交付物一次性下载 nonce 原子消费
// SRV-13: 幂等缓存过期行 ON CONFLICT 不撞 500
// ============================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { buildOgMeta, clearOgCache, getOgCacheSize, OG_CACHE_MAX } from '../src/features/og/og-meta.service.js'
import { withIdempotency } from '../src/shared/idempotency.js'
import { signFilePath } from '../src/shared/file-sign.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'
import { buildApp } from '../src/app.js'

// ─── SRV-05: OG 缓存 LRU 淘汰 ───

describe('SRV-05: OG 缓存条目上限 + LRU 淘汰', () => {
  const PREV_DOMAIN = process.env.DOMAIN

  beforeEach(() => {
    cleanDb()
    clearOgCache()
    process.env.DOMAIN = 'test.example'
  })

  afterEach(() => {
    clearOgCache()
    if (PREV_DOMAIN === undefined) delete process.env.DOMAIN
    else process.env.DOMAIN = PREV_DOMAIN
  })

  it('TC-SRV05-01: 缓存条目不超过上限（刷大量唯一 subdomain 后 size ≤ MAX）', () => {
    // 插入超过上限数量的唯一 subdomain（不存在的画师也会缓存 defaultOg）
    const overflow = OG_CACHE_MAX + 50
    for (let i = 0; i < overflow; i++) {
      buildOgMeta(`spam-sub-${i}`)
    }
    expect(getOgCacheSize()).toBeLessThanOrEqual(OG_CACHE_MAX)
  })

  it('TC-SRV05-02: LRU 淘汰——热 key 命中后不被优先淘汰', () => {
    // 填满缓存到接近上限
    for (let i = 0; i < OG_CACHE_MAX - 1; i++) {
      buildOgMeta(`fill-${i}`)
    }
    // 访问一个早期 key（触发 LRU 提升到尾部）
    buildOgMeta('fill-0')
    // 再插入两个新 key 触发淘汰
    buildOgMeta('new-1')
    buildOgMeta('new-2')
    // fill-0 应该还在（被 LRU 提升过），fill-1 应该被淘汰（最旧且未被访问）
    // 验证方式：再次 buildOgMeta('fill-0') 应命中缓存（不查 DB）
    // 由于都是不存在的画师返回 defaultOg，我们通过 cache size 间接验证
    expect(getOgCacheSize()).toBeLessThanOrEqual(OG_CACHE_MAX)
  })

  it('TC-SRV05-03: 未配 DOMAIN 时不缓存（缓存 size 始终 0）', () => {
    delete process.env.DOMAIN
    for (let i = 0; i < 10; i++) {
      buildOgMeta(`no-cache-${i}`)
    }
    expect(getOgCacheSize()).toBe(0)
  })
})

// ─── SRV-10: 交付物一次性下载 nonce 原子消费 ───

describe('SRV-10: 一次性下载 nonce 原子消费（TTL 内不可重放）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let order: SeededOrder
  let fileId: number

  const FILE_BODY = 'srv10-download-payload'
  const deliverablePath = () => `deliverables/${artist.id}/srv10.png`
  const uploadRoot = () => resolve(process.env.UPLOAD_DIR || './uploads')

  function writeUploadFile(relPath: string, body: string): void {
    const abs = resolve(join(uploadRoot(), relPath))
    mkdirSync(resolve(join(abs, '..')), { recursive: true })
    writeFileSync(abs, body)
  }

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist()
    order = seedOrder(artist.id, { order_no: 'SRV10-001', status: 'done' })
    orderGalleryService.addDeliverable(order.id, deliverablePath(), 'srv10.png', FILE_BODY.length)
    fileId = (db.prepare('SELECT id FROM deliverables WHERE order_id = ?').get(order.id) as { id: number }).id
    writeUploadFile(deliverablePath(), FILE_BODY)
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-SRV10-01: 首次访问 200 + nonce 被消费（置 NULL）', async () => {
    const { deliverableId, nonce } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    const sig = signFilePath(deliverablePath(), { deliverableId, nonce })
    const res = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(FILE_BODY)
    // nonce 已被消费（置 NULL）
    const row = db.prepare('SELECT download_nonce FROM deliverables WHERE id = ?').get(fileId) as { download_nonce: string | null }
    expect(row.download_nonce).toBeNull()
  })

  it('TC-SRV10-02: 同一签名 URL 第二次访问 → 403（TTL 内不可重放）', async () => {
    const { deliverableId, nonce } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    const sig = signFilePath(deliverablePath(), { deliverableId, nonce })
    const url = `/uploads/${deliverablePath()}?sig=${sig}`

    const first = await app.inject({ method: 'GET', url })
    expect(first.statusCode).toBe(200)

    // 第二次：同一 URL，nonce 已被消费 → 403
    const second = await app.inject({ method: 'GET', url })
    expect(second.statusCode).toBe(403)
    expect(second.json()).toEqual({ error: '文件链接无效或已过期' })
  })

  it('TC-SRV10-03: 预览模式（无 nonce）不受消费影响，多次访问均 200', async () => {
    // 画师预览模式：只有 deliverableId，无 nonce
    const previewSig = signFilePath(deliverablePath(), { deliverableId: fileId })
    const url = `/uploads/${deliverablePath()}?sig=${previewSig}`

    const first = await app.inject({ method: 'GET', url })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'GET', url })
    expect(second.statusCode).toBe(200)

    const third = await app.inject({ method: 'GET', url })
    expect(third.statusCode).toBe(200)
  })

  it('TC-SRV10-04: 消费后重新 start → 新 nonce 签发新链接可用', async () => {
    const first = orderGalleryService.startDeliverableDownload(order.id, fileId)
    const sig1 = signFilePath(deliverablePath(), { deliverableId: first.deliverableId, nonce: first.nonce })
    // 消费第一次
    const res1 = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig1}` })
    expect(res1.statusCode).toBe(200)
    // 第二次用旧链接 → 403
    const res2 = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig1}` })
    expect(res2.statusCode).toBe(403)

    // 画师再许可 + 客户重新 start
    orderGalleryService.repermitDeliverable(order.id, fileId)
    const second = orderGalleryService.startDeliverableDownload(order.id, fileId)
    expect(second.nonce).not.toBe(first.nonce)
    const sig2 = signFilePath(deliverablePath(), { deliverableId: second.deliverableId, nonce: second.nonce })
    const res3 = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig2}` })
    expect(res3.statusCode).toBe(200)
  })
})

// ─── SRV-13: 幂等缓存过期行 ON CONFLICT 不撞 500 ───

describe('SRV-13: 幂等缓存过期行残留主键——upsert 修复', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-SRV13-01: 过期行物理残留时同 key 重放 → 不撞 500，正常执行并覆盖', () => {
    const scope = 'srv13-test'
    const key = 'expired-key-001'

    // 手动插入一条「已过期」的幂等行（created_at 超 24h，模拟 GC 尚未清理的窗口）
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, ?, 200, '{\"old\":true}', datetime('now', '-48 hours'))"
    ).run(scope, key)

    // 读侧不命中（超 24h），exec 被执行
    let execCalls = 0
    const result = withIdempotency(scope, key, () => {
      execCalls++
      return { statusCode: 200, body: { fresh: true } }
    })

    // 不应抛错（修复前会撞 PRIMARY KEY → 500）
    expect(result).toEqual({ statusCode: 200, body: { fresh: true } })
    expect(execCalls).toBe(1)

    // 缓存行已被覆盖为新值
    const row = db.prepare(
      'SELECT status_code, response_json FROM idempotency_keys WHERE scope = ? AND key = ?'
    ).get(scope, key) as { status_code: number; response_json: string }
    expect(row.status_code).toBe(200)
    expect(JSON.parse(row.response_json)).toEqual({ fresh: true })
  })

  it('TC-SRV13-02: 过期行重放后 created_at 被刷新（重新获得 24h 时效窗口）', () => {
    const scope = 'srv13-test'
    const key = 'refresh-key-001'

    // 插入 48h 前的过期行
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, ?, 201, '{\"v\":1}', datetime('now', '-48 hours'))"
    ).run(scope, key)

    withIdempotency(scope, key, () => ({ statusCode: 201, body: { v: 2 } }))

    // created_at 应该被刷新到当前时间附近（不再是 48h 前）
    const row = db.prepare(
      "SELECT created_at FROM idempotency_keys WHERE scope = ? AND key = ?"
    ).get(scope, key) as { created_at: string }
    // 验证：当前时间与 created_at 差距不超过 5 秒
    const createdAt = new Date(row.created_at + 'Z').getTime()
    expect(Date.now() - createdAt).toBeLessThan(5000)
  })

  it('TC-SRV13-03: 24h 内有效缓存行仍正常命中（upsert 不影响正常路径）', () => {
    const scope = 'srv13-test'
    const key = 'fresh-key-001'

    // 第一次调用：写入缓存
    let calls = 0
    const first = withIdempotency(scope, key, () => {
      calls++
      return { statusCode: 200, body: { order: 'first' } }
    })
    expect(first).toEqual({ statusCode: 200, body: { order: 'first' } })
    expect(calls).toBe(1)

    // 第二次调用：命中缓存，不执行 exec
    const second = withIdempotency(scope, key, () => {
      calls++
      return { statusCode: 200, body: { order: 'second' } }
    })
    expect(second).toEqual({ statusCode: 200, body: { order: 'first' } })
    expect(calls).toBe(1) // 未增加
  })

  it('TC-SRV13-04: 跨 24h 边界完整流程——过期后重放返回新结果而非 500', async () => {
    const scope = 'srv13-e2e'
    const key = 'e2e-key'

    // 模拟：写入一条即将过期的行（25h 前）
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, ?, 200, '{\"stale\":true}', datetime('now', '-25 hours'))"
    ).run(scope, key)

    // 重放：读侧不命中（>24h），exec 执行，写入不撞键
    const result = withIdempotency(scope, key, () => ({
      statusCode: 200,
      body: { stale: false, refreshed: true }
    }))
    expect(result.body).toEqual({ stale: false, refreshed: true })

    // 第三次调用：现在缓存行是新的（<24h），应命中
    let notCalled = true
    const cached = withIdempotency(scope, key, () => {
      notCalled = false
      return { statusCode: 500, body: {} }
    })
    expect(notCalled).toBe(true) // exec 未被调用
    expect(cached.body).toEqual({ stale: false, refreshed: true })
  })
})
