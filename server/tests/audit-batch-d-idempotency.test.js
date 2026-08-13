import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { pruneIdempotencyKeys } from '../src/shared/idempotency.js'
import { withIdempotency } from '../src/shared/idempotency.js'

/**
 * 审计批 D-2（R-9）：下单/收款幂等键
 * 同 key 二次提交返回首次缓存；错误响应不缓存；无 header 行为不变
 */

describe('审计批 D-2 幂等键', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88200', subdomain: 'd2artist' })
  })

  it('TC-D2-01: 迁移 v54 后 idempotency_keys 表存在（复合主键 scope+key）', () => {
    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='idempotency_keys'"
    ).get()
    expect(table).toBeTruthy()
    expect(table.sql).toContain('PRIMARY KEY (scope, key)')
  })

  it('TC-D2-02: 下单同 key 二次提交 → 返回首次缓存、只落一单', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const payload = { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      const headers = { 'idempotency-key': 'order-key-0001' }
      const first = await app.inject({ method: 'POST', url: '/api/orders', headers, payload })
      const second = await app.inject({ method: 'POST', url: '/api/orders', headers, payload })
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
      const orders = db.prepare('SELECT * FROM orders').all()
      expect(orders).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-03: 不同 key 正常两笔（幂等键不误伤业务重复）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const payload = { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      await app.inject({ method: 'POST', url: '/api/orders', headers: { 'idempotency-key': 'order-key-0002' }, payload })
      await app.inject({ method: 'POST', url: '/api/orders', headers: { 'idempotency-key': 'order-key-0003' }, payload })
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(2)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-04: 无 idempotency-key header → 行为不变（直接执行）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const payload = { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      const res = await app.inject({ method: 'POST', url: '/api/orders', payload })
      expect(res.statusCode).toBe(200)
      expect(res.json().orderNo).toBeTruthy()
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-05: 错误响应不缓存——同 key 失败后重试可成功', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const headers = { 'idempotency-key': 'order-key-0005' }
      // 第一次：带折扣码但无计价基准 → VALIDATION 400（服务层抛错，不写缓存）
      const bad = await app.inject({
        method: 'POST', url: '/api/orders', headers,
        payload: { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true, discountCode: 'FREE' }
      })
      expect(bad.statusCode).toBe(400)
      // 第二次同 key 合法参数 → 成功（未被失败缓存挡住）
      const ok = await app.inject({
        method: 'POST', url: '/api/orders', headers,
        payload: { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      })
      expect(ok.statusCode).toBe(200)
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-06: 非法幂等键格式（非 [A-Za-z0-9-] / 超 64）→ 400 VALIDATION', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const payload = { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      const badChar = await app.inject({
        method: 'POST', url: '/api/orders', headers: { 'idempotency-key': 'bad_key!' }, payload
      })
      expect(badChar.statusCode).toBe(400)
      expect(badChar.json().code).toBe('VALIDATION')
      const tooLong = await app.inject({
        method: 'POST', url: '/api/orders', headers: { 'idempotency-key': 'k'.repeat(65) }, payload
      })
      expect(tooLong.statusCode).toBe(400)
      expect(tooLong.json().code).toBe('VALIDATION')
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(0)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-07: 收款同 key 二次提交 → 金额不重复入账、返回首次缓存', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const order = db.prepare(`
        INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position, queue_zone)
        VALUES ('D2-PAY-1', ?, '123456', 'medium', 'pending', 'self', 1, 'formal')
      `).run(artist.id)
      const orderId = Number(order.lastInsertRowid)
      const headers = { authorization: `Bearer ${token}`, 'idempotency-key': 'pay-key-0001' }
      const payload = { amountCents: 1000, note: '定金' }
      const first = await app.inject({
        method: 'POST', url: `/api/artist/orders/${orderId}/payments`, headers, payload
      })
      const second = await app.inject({
        method: 'POST', url: `/api/artist/orders/${orderId}/payments`, headers, payload
      })
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
      const payments = db.prepare('SELECT * FROM order_payments').all()
      expect(payments).toHaveLength(1)
      expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId).paid_total_cents).toBe(1000)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-08: 收款不同 key 正常两笔、无 header 正常一笔', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const order = db.prepare(`
        INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position, queue_zone)
        VALUES ('D2-PAY-2', ?, '123456', 'medium', 'pending', 'self', 1, 'formal')
      `).run(artist.id)
      const orderId = Number(order.lastInsertRowid)
      const base = { method: 'POST', url: `/api/artist/orders/${orderId}/payments` }
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pay-key-0002' }, payload: { amountCents: 500 } })
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pay-key-0003' }, payload: { amountCents: 600 } })
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}` }, payload: { amountCents: 700 } })
      expect(db.prepare('SELECT * FROM order_payments').all()).toHaveLength(3)
      expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId).paid_total_cents).toBe(1800)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-09: pruneIdempotencyKeys 只清超 24h 的行', () => {
    const scope = 'prune-test'
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, 'old', 200, '{}', datetime('now', '-2 days'))"
    ).run(scope)
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, 'fresh', 200, '{}', datetime('now', '-1 hours'))"
    ).run(scope)

    const deleted = pruneIdempotencyKeys(24)
    expect(deleted).toBe(1)
    expect(db.prepare('SELECT key FROM idempotency_keys WHERE scope = ?').all(scope).map(r => r.key)).toEqual(['fresh'])
  })

  it('TC-D2-10: GC 接线——启动 GC 自动清超期幂等行（app.ts 定时器同批）', async () => {
    const scope = 'gc-wire-test'
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, 'expired', 200, '{}', datetime('now', '-3 days'))"
    ).run(scope)
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json, created_at) VALUES (?, 'kept', 200, '{}', datetime('now', '-2 hours'))"
    ).run(scope)

    const app = await buildApp({ logger: false })
    try {
      expect(db.prepare('SELECT key FROM idempotency_keys WHERE scope = ?').all(scope).map(r => r.key)).toEqual(['kept'])
    } finally {
      await app.close()
    }
  })

  it('TC-D2-11: 手动录单同 key 二次提交 → 返回首次缓存、只落一单（I6-d v75 遗留收尾）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const headers = {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'manual-order-key-0001'
      }
      const payload = { clientQq: '123456', clientName: '幂等客户', priority: 'medium' }
      const first = await app.inject({
        method: 'POST', url: '/api/artist/orders/manual', headers, payload
      })
      const second = await app.inject({
        method: 'POST', url: '/api/artist/orders/manual', headers, payload
      })
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
      expect(first.json().order_no).toBeTruthy()
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(1)
      expect(db.prepare('SELECT source FROM orders').get().source).toBe('manual')
    } finally {
      await app.close()
    }
  })

  it('TC-D2-12: 手动录单无 header 正常一笔；不同 key 正常两笔', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const base = { method: 'POST', url: '/api/artist/orders/manual' }
      const payload = { clientQq: '123456' }
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}` }, payload })
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'manual-key-0002' }, payload })
      await app.inject({ ...base, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'manual-key-0003' }, payload })
      expect(db.prepare('SELECT * FROM orders').all()).toHaveLength(3)
    } finally {
      await app.close()
    }
  })

  it('TC-D2-13: 损坏 response_json 缓存行被删除并按未命中重执行（不再同 key 永久 500）', () => {
    const scope = 'corrupt-cache-test'
    db.prepare(
      "INSERT INTO idempotency_keys (scope, key, status_code, response_json) VALUES (?, 'bad', 200, 'not-json')"
    ).run(scope)
    let calls = 0
    const result = withIdempotency(scope, 'bad', () => {
      calls++
      return { statusCode: 200, body: { ok: true } }
    })
    expect(result).toEqual({ statusCode: 200, body: { ok: true } })
    expect(calls).toBe(1)
    expect(db.prepare(
      'SELECT response_json FROM idempotency_keys WHERE scope = ? AND key = ?'
    ).get(scope, 'bad').response_json).toBe('{"ok":true}')
  })
})
