// TASK2-01 端到端：密钥轮换 + 同 key 重提 → 独立 409，不产生第二笔订单/第二笔扣款
// 独立测试文件避免与 TC-D2-02 等共用下单限流计数（guardRateLimit 模块级状态按文件隔离）
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'

describe('TASK2-01 幂等信封密钥轮换与前端 key 生命周期契约', () => {
  let artist: ReturnType<typeof seedArtist>

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88700', subdomain: 'env-rotation' })
  })

  it('TC-ENV-01: S1 下单 → 密钥轮换 S2 → 同 key 重提 409 新码 → 零第二笔订单/不删行', async () => {
    const originalSecret = process.env.SESSION_SECRET
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const payload = { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      const headers = { 'idempotency-key': 'order-key-rotation' }

      // 1) S1 首响：订单 #1 创建、缓存封为 enc:v1
      const first = await app.inject({ method: 'POST', url: '/api/orders', headers, payload })
      expect(first.statusCode).toBe(200)
      expect(first.json().orderNo).toBeTruthy()
      expect(db.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 1 })
      const cached = db.prepare(
        'SELECT response_json FROM idempotency_keys WHERE key = ?'
      ).get('order-key-rotation') as { response_json: string }
      expect(cached.response_json).toMatch(/^enc:v1:/)
      expect(cached.response_json).not.toContain(first.json().customerToken)

      // 2) 密钥轮换为 S2（envelopeKey 每次从 env 派生，无模块级缓存）
      process.env.SESSION_SECRET = 'rotated-secret-key-for-vitest-32chars'
      const retry = await app.inject({ method: 'POST', url: '/api/orders', headers, payload })
      expect(retry.statusCode).toBe(409)
      expect(retry.json().code).toBe('IDEMPOTENCY_ENVELOPE_INVALID')
      // 文案明确「不可重试」，不得引导换 key（换 key = 新意图 = 第二笔订单/扣款）
      expect(retry.json().error).toBe('该提交可能已受理，请勿重复提交；如未确认请联系客服')
      expect(retry.json().error).not.toMatch(/更换|换 ?key|重新提交/)

      // 3) 服务端纪律：缓存行保留、exec 未重跑、订单仍 1 笔
      expect(db.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 1 })
      expect((db.prepare('SELECT response_json FROM idempotency_keys WHERE key = ?').get('order-key-rotation') as { response_json: string }).response_json).toBe(cached.response_json)
    } finally {
      process.env.SESSION_SECRET = originalSecret
      await app.close()
    }
  })

  it('TC-ENV-02: 载荷冲突仍保持 IDEMPOTENCY_CONFLICT（前端换 key 语义不误伤）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const headers = { 'idempotency-key': 'order-key-payload-conflict' }
      const first = await app.inject({
        method: 'POST', url: '/api/orders', headers,
        payload: { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true }
      })
      expect(first.statusCode).toBe(200)
      const changed = await app.inject({
        method: 'POST', url: '/api/orders', headers,
        payload: { subdomain: artist.subdomain, clientQq: '123456', agreeRules: true, clientName: '改了内容' }
      })
      expect(changed.statusCode).toBe(409)
      expect(changed.json().code).toBe('IDEMPOTENCY_CONFLICT')
      expect(db.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 1 })
    } finally {
      await app.close()
    }
  })
})
