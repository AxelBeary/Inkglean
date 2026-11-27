// B-1 真服务端防线（PR #116 复核 BLOCKER）：手动录单「自定义增项」补写用的**派生幂等键**
// 必须真的能过服务端 readIdempotencyKey 的校验。
//
// 背景：前端 ManualOrderRight.vue 原先按 `\${idemKey}:extra:\${uid}` 直接拼派生键，拼出的串
// 恒为 82 字符且含冒号 → server/src/shared/idempotency.ts 的 ≤64 与 /^[A-Za-z0-9-]+$/ 双重违规
// → 端点**必 400**，导致「带自定义增项的录单」永远写不进增项、父页「重试」也永远失败。
// PR 自带的 composite 用例在 artistApi 层 mock，请求根本不出组件，测不出这条（假绿）。
//
// 本文件的立场：
//   ① 用**前端同一算法**（web/src/utils/hash.ts 的 deriveIdempotencyKey）算出的键打真端点 → 必须 200；
//   ② 同键重放不重复计增项（幂等语义在真链路上成立）；
//   ③ 原写法（超 64 / 含冒号）→ 必须 400，钉住服务端契约**不许被放宽**。
//
// 为什么直连 web 源文件而不是在 server 里 cp 一份：两侧同一份实现，前端改了算法这里立刻红。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow, SeededOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { deriveIdempotencyKey } from '../../web/src/utils/hash.js'

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

describe('B-1 手动录单增项派生幂等键（走真 app.inject）', () => {
  let artist: ArtistRow
  let order: SeededOrder
  // 与前端同形态的输入：submitIdemKey = generateId() 的 UUID，增项 uid = 'ca-' + generateId()
  const submitIdemKey = 'c4f3b7a2-1111-4222-8333-944455556666'
  const itemUid = 'ca-8f14e45f-ceea-467f-a1b2-3c4d5e6f7a8b'

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89771', subdomain: 'b1-derived-key' })
    order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = 50000, total_price_cents = 50000 WHERE id = ?').run(order.id)
  })

  it('TC-B1-01: 用前端派生键打真端点 → 200（不是 400），增项真的落库', async () => {
    const { app, headers } = await makeApp(artist)
    const key = deriveIdempotencyKey(submitIdemKey, 'extra', itemUid)

    // 前置：派生键本身合规（若这条先红，说明前端算的键就不合法，端点必 400）
    expect(key.length).toBeLessThanOrEqual(64)
    expect(key).toMatch(/^[A-Za-z0-9-]+$/)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': key },
      payload: { name: '加急费', priceCents: 5000 }
    })

    expect(res.statusCode).toBe(200)
    expect(extraCount(order.id)).toBe(1)
    expect(finalCents(order.id)).toBe(55000)
    await app.close()
  })

  it('TC-B1-02: 同派生键重放 → 不重复计增项，回放首个响应（重试路径成立）', async () => {
    const { app, headers } = await makeApp(artist)
    const key = deriveIdempotencyKey(submitIdemKey, 'extra', itemUid)
    const payload = { name: '加急费', priceCents: 5000 }

    const first = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': key }, payload
    })
    // 模拟「响应丢失后父页重试」：同一 submitIdemKey + 同一 uid ⇒ 派生键不变
    const second = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': deriveIdempotencyKey(submitIdemKey, 'extra', itemUid) }, payload
    })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(extraCount(order.id)).toBe(1)
    expect(finalCents(order.id)).toBe(55000)
    expect(second.json().final_price_cents).toBe(first.json().final_price_cents)
    await app.close()
  })

  it('TC-B1-03: 同一 submitIdemKey 下不同 uid → 键不同，两条增项各自落库（不被误判为重放）', async () => {
    const { app, headers } = await makeApp(artist)
    const otherUid = 'ca-11111111-2222-4333-8444-555566667777'
    const kA = deriveIdempotencyKey(submitIdemKey, 'extra', itemUid)
    const kB = deriveIdempotencyKey(submitIdemKey, 'extra', otherUid)
    expect(kA).not.toBe(kB)

    const a = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': kA }, payload: { name: '加急费', priceCents: 5000 }
    })
    const b = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': kB }, payload: { name: '背景费', priceCents: 8000 }
    })

    expect(a.statusCode).toBe(200)
    expect(b.statusCode).toBe(200)
    expect(extraCount(order.id)).toBe(2)
    expect(finalCents(order.id)).toBe(63000)
    await app.close()
  })

  it('TC-B1-04: 钉住服务端契约——原 PR 写法（82 字符含冒号）必 400，且不落库', async () => {
    const { app, headers } = await makeApp(artist)
    const naive = `${submitIdemKey}:extra:${itemUid}`
    expect(naive).toHaveLength(82)

    const res = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': naive },
      payload: { name: '加急费', priceCents: 5000 }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
    expect(res.json().detail?.field).toBe('idempotency-key')
    expect(extraCount(order.id)).toBe(0)
    expect(finalCents(order.id)).toBe(50000)
    await app.close()
  })

  it('TC-B1-05: 钉住服务端契约——超过 64 字符（即便纯字母数字）也必 400', async () => {
    const { app, headers } = await makeApp(artist)
    const tooLong = 'a'.repeat(65)

    const res = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': tooLong },
      payload: { name: '加急费', priceCents: 5000 }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
    expect(extraCount(order.id)).toBe(0)
    await app.close()
  })

  it('TC-B1-06: 钉住服务端契约——含冒号必 400（字符集不许被放宽）', async () => {
    const { app, headers } = await makeApp(artist)

    const res = await app.inject({
      method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`,
      headers: { ...headers, 'idempotency-key': 'abc:def' },
      payload: { name: '加急费', priceCents: 5000 }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
    expect(extraCount(order.id)).toBe(0)
    await app.close()
  })
})
