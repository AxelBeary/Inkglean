// 审计 #21 条目 7：附加工作项此前没有幂等键，重复提交会真实重复加价
// 与收款/下单同口径（D-2/R-9）：同 scope+key 回放首个响应，服务端错误不写缓存允许修正后重试，
// 不带 idempotency-key 的调用行为完全不变。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow, SeededOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'

async function makeApp(artist: ArtistRow): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; headers: Record<string, string> }> {
  const app = await buildApp({ logger: false })
  await app.ready()
  const headers = { Authorization: 'Bearer ' + createSession(artist.id, artist.token_version) }
  return { app, headers }
}

function extraCount(orderId: number): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM order_extra_items WHERE order_id = ?').get(orderId) as { c: number }).c
}

function finalCents(orderId: number): number {
  return (db.prepare('SELECT final_price_cents AS f FROM orders WHERE id = ?').get(orderId) as { f: number }).f
}

describe('附加项幂等键（#21-7）', () => {
  let artist: ArtistRow
  let order: SeededOrder

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89770', subdomain: 'extra-idem' })
    order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = 50000, total_price_cents = 50000 WHERE id = ?').run(order.id)
  })

  it('TC-EXI-01: 同 key 同载荷重复提交 → 只加一次价，回放首个响应', async () => {
    const { app, headers } = await makeApp(artist)
    const payload = { name: '加急', description: '三天内交稿', priceCents: 8000 }

    const first = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-1' }, payload
    })
    const second = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-1' }, payload
    })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(finalCents(order.id)).toBe(58000)
    expect(extraCount(order.id)).toBe(1)
    expect(second.json().final_price_cents).toBe(first.json().final_price_cents)
    await app.close()
  })

  it('TC-EXI-02: 不带幂等键 → 行为不变（两次各落一行，兼容旧客户端）', async () => {
    const { app, headers } = await makeApp(artist)
    const payload = { name: '加急', priceCents: 8000 }

    await app.inject({ method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`, headers, payload })
    await app.inject({ method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`, headers, payload })

    expect(extraCount(order.id)).toBe(2)
    expect(finalCents(order.id)).toBe(66000)
    await app.close()
  })

  it('TC-EXI-03: 不同 key 正常两笔（不误伤「同名同价确实要加两次」）', async () => {
    const { app, headers } = await makeApp(artist)
    const payload = { name: '额外头像', priceCents: 5000 }

    await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-a' }, payload
    })
    await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-b' }, payload
    })

    expect(extraCount(order.id)).toBe(2)
    expect(finalCents(order.id)).toBe(60000)
    await app.close()
  })

  it('TC-EXI-04: 服务端校验错误不写缓存 → 同 key 修正后可成功', async () => {
    const { app, headers } = await makeApp(artist)

    const bad = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-4' },
      payload: { name: '', priceCents: 1000 } // 空名 → 400
    })
    expect(bad.statusCode).toBe(400)

    const ok = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'extra-key-4' },
      payload: { name: '加急', priceCents: 2000 }
    })
    expect(ok.statusCode).toBe(200)
    expect(extraCount(order.id)).toBe(1)
    expect(finalCents(order.id)).toBe(52000)
    await app.close()
  })

  it('TC-EXI-05: 幂等 scope 含订单号 → 跨单同 key 不互相吞', async () => {
    const other = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = 30000, total_price_cents = 30000 WHERE id = ?').run(other.id)
    const { app, headers } = await makeApp(artist)
    const payload = { name: '加急', priceCents: 4000 }

    await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'shared-key' }, payload
    })
    await app.inject({
      method: 'POST', url: `/api/artist/orders/${other.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'shared-key' }, payload
    })

    expect(extraCount(order.id)).toBe(1)
    expect(extraCount(other.id)).toBe(1)
    expect(finalCents(order.id)).toBe(54000)
    expect(finalCents(other.id)).toBe(34000)
    await app.close()
  })

  it('TC-EXI-06: 非法幂等键格式 → 400 VALIDATION（与收款/下单同口径）', async () => {
    const { app, headers } = await makeApp(artist)

    const res = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'bad key with spaces' },
      payload: { name: '加急', priceCents: 1000 }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
    expect(extraCount(order.id)).toBe(0)
    await app.close()
  })
})
