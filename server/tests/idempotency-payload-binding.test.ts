// 审计 #21 条目 3：幂等键必须绑定请求内容
// 旧行为：withIdempotency 只按 scope+key 命中 → 同 key 换载荷静默回放旧响应，
// 新内容根本没执行（客户端失败时保留同一个 key，用户改完金额再点一次即中招）。
// 新行为：同 key 不同载荷 → 409 IDEMPOTENCY_CONFLICT；不带 payload / 存量无指纹行 → 维持旧重放语义。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { withIdempotency, hashIdempotencyPayload } from '../src/shared/idempotency.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'

function execCounters() {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    exec: (statusCode = 200) => {
      calls++
      return { statusCode, body: { seq: calls } }
    }
  }
}

function readRow(scope: string, key: string) {
  return db
    .prepare('SELECT status_code, response_json, request_hash FROM idempotency_keys WHERE scope = ? AND key = ?')
    .get(scope, key) as { status_code: number; response_json: string; request_hash: string | null } | undefined
}

describe('幂等键绑定请求载荷（#21-3）', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-IDM-01: 同 key 同载荷 → 回放缓存，业务只执行一次', () => {
    const c = execCounters()
    const payload = { amountCents: 1000, note: '定金' }

    const first = withIdempotency('payment:1', 'k-same', () => c.exec(), payload)
    const second = withIdempotency('payment:1', 'k-same', () => c.exec(), payload)

    expect(c.calls).toBe(1)
    expect(second).toEqual(first)
    expect(readRow('payment:1', 'k-same')?.request_hash).toBe(hashIdempotencyPayload(payload))
  })

  it('TC-IDM-02: 同 key 不同载荷 → 409 IDEMPOTENCY_CONFLICT，业务不执行、旧缓存不被覆盖', () => {
    const c = execCounters()
    withIdempotency('payment:2', 'k-mix', () => c.exec(), { amountCents: 1000 })

    expect(() =>
      withIdempotency('payment:2', 'k-mix', () => c.exec(), { amountCents: 2000 })
    ).toThrow('IDEMPOTENCY_CONFLICT')

    expect(c.calls).toBe(1)
    const row = readRow('payment:2', 'k-mix')
    expect(row?.response_json).toBe(JSON.stringify({ seq: 1 }))
    expect(row?.request_hash).toBe(hashIdempotencyPayload({ amountCents: 1000 }))
  })

  it('TC-IDM-03: 冲突后换新 key 正常受理（调用方据此重开一次意图）', () => {
    const c = execCounters()
    withIdempotency('payment:3', 'k-old', () => c.exec(), { amountCents: 1000 })

    const res = withIdempotency('payment:3', 'k-new', () => c.exec(), { amountCents: 2000 })

    expect(c.calls).toBe(2)
    expect(res.body).toEqual({ seq: 2 })
  })

  it('TC-IDM-04: 载荷键序/undefined 差异不算冲突（指纹规范化）', () => {
    const c = execCounters()
    withIdempotency('payment:4', 'k-order', () => c.exec(), { amountCents: 500, note: 'a', installmentId: undefined })

    const replay = withIdempotency('payment:4', 'k-order', () => c.exec(), { installmentId: null, note: 'a', amountCents: 500 })

    expect(c.calls).toBe(1)
    expect(replay.body).toEqual({ seq: 1 })
  })

  it('TC-IDM-05: 嵌套结构逐层规范化，数组顺序仍算不同载荷', () => {
    const base = { refs: [{ path: 'a.png', order: 1 }], tags: ['x', 'y'] }
    expect(hashIdempotencyPayload(base)).toBe(hashIdempotencyPayload({ refs: [{ order: 1, path: 'a.png' }], tags: ['x', 'y'] }))
    expect(hashIdempotencyPayload(base)).not.toBe(hashIdempotencyPayload({ refs: [{ path: 'a.png', order: 1 }], tags: ['y', 'x'] }))
  })

  it('TC-IDM-06: 不带 payload 的调用维持旧重放语义（向后兼容）', () => {
    const c = execCounters()
    withIdempotency('payment:6', 'k-legacy', () => c.exec(201))

    const replay = withIdempotency('payment:6', 'k-legacy', () => c.exec(201), { anything: true })

    expect(c.calls).toBe(1)
    expect(replay.statusCode).toBe(201)
    // 回放不改写缓存行：首笔没记录指纹，就保持 NULL——不拿后一次请求的载荷去冒充首笔的指纹，
    // 该 key 在 24h TTL 内一律按旧重放语义处理，过期后自然收敛到新口径
    expect(readRow('payment:6', 'k-legacy')?.request_hash).toBeNull()
  })

  it('TC-IDM-07: 存量无指纹行 + 新载荷 → 先按旧语义回放，不追溯收紧', () => {
    db.prepare("INSERT INTO idempotency_keys (scope, key, status_code, response_json, request_hash) VALUES ('payment:7', 'k-null', 200, '{\"seq\":9}', NULL)").run()
    let calls = 0

    const replay = withIdempotency('payment:7', 'k-null', () => {
      calls++
      return { statusCode: 200, body: { seq: 1 } }
    }, { amountCents: 777 })

    expect(calls).toBe(0)
    expect(replay.body).toEqual({ seq: 9 })
  })

  it('TC-IDM-08: key 为空完全不启用幂等（旧调用零影响）', () => {
    let calls = 0
    const exec = () => {
      calls++
      return { statusCode: 200, body: { seq: calls } }
    }

    withIdempotency('payment:8', null, exec, { amountCents: 1 })
    withIdempotency('payment:8', null, exec, { amountCents: 2 })

    expect(calls).toBe(2)
    expect(db.prepare("SELECT COUNT(*) AS c FROM idempotency_keys WHERE scope = 'payment:8'").get()).toMatchObject({ c: 0 })
  })

  it('TC-IDM-09: 路由层同 key 换金额 → 409，且第二笔未入账', async () => {
    const artist = seedArtist({ qq_number: '89330', subdomain: 'idem-route' })
    const order = seedOrder(artist.id, { status: 'wip' })
    const app = await buildApp({ logger: false })
    const headers = { Authorization: 'Bearer ' + createSession(artist.id, artist.token_version) }

    const first = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/payments`,
      headers: { ...headers, 'idempotency-key': 'route-key-1' },
      payload: { amountCents: 1000, note: '定金' }
    })
    expect(first.statusCode).toBe(200)

    const changed = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/payments`,
      headers: { ...headers, 'idempotency-key': 'route-key-1' },
      payload: { amountCents: 9000, note: '定金' }
    })
    expect(changed.statusCode).toBe(409)
    expect(changed.json().code).toBe('IDEMPOTENCY_CONFLICT')

    const replay = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/payments`,
      headers: { ...headers, 'idempotency-key': 'route-key-1' },
      payload: { amountCents: 1000, note: '定金' }
    })
    expect(replay.statusCode).toBe(200)

    const paid = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id) as { paid_total_cents: number }
    expect(paid.paid_total_cents).toBe(1000)
    expect((db.prepare('SELECT COUNT(*) AS c FROM order_payments WHERE order_id = ?').get(order.id) as { c: number }).c).toBe(1)
    await app.close()
  })
})
