// XEND-12：fixed 折扣「元 → 分」跨端一致性回归（资金口径）
// 修复前：server computeDiscountCents 用 Math.round(v*100)（1.005→100 分），
//         前端 orderFormDiscount.ts 已用 shared yuanToCents（1.005→101 分）→ 报价 ¥1.01 / 实扣 ¥1.00。
// 本用例断言：① server 与前端事实源 yuanToCents 逐点一致；② SRV-17 percent 向下取整口径不被误改；
//          ③ 路由 moneyPrecision 拒绝超分精度 discountValue（防新码再引入 1.005）。
import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { computeDiscountCents } from '../src/features/pricing/discount.service.js'
import type { DiscountCode } from '../src/features/pricing/discount.service.js'
// 前端报价事实源（orderFormDiscount.ts:80 用的就是这个函数）——跨端 parity 基准
import { yuanToCents as frontendYuanToCents } from '../../shared/src/utils/money.js'
// server 侧金额单一事实源（镜像副本，须与上面逐点一致）
import { yuanToCents as serverYuanToCents } from '../src/shared/money.js'

function fixedCode(value: number): DiscountCode {
  return {
    id: 1, artist_id: 1, code: 'FIX1', discount_type: 'fixed', discount_value: value,
    max_uses: null, used_count: 0, expires_at: null, enabled: 1, created_at: ''
  }
}
function percentCode(value: number): DiscountCode {
  return { ...fixedCode(value), discount_type: 'percent' }
}

describe('XEND-12 fixed 折扣元转分跨端一致', () => {
  it('TC-FC-01: fixed=1.005 → 报价/实扣同为 101 分（修复前实扣 100 分）', () => {
    const code = fixedCode(1.005)
    // 前端下单页预估折扣（orderFormDiscount.ts:80 discountPreviewCents 口径）
    const frontendQuoteCents = frontendYuanToCents(code.discount_value)
    // 服务端实扣
    const serverChargeCents = computeDiscountCents(code, 1_000_000)

    expect(frontendQuoteCents).toBe(101)
    expect(serverChargeCents).toBe(101)
    expect(serverChargeCents).toBe(frontendQuoteCents) // 逐点 parity
  })

  it('TC-FC-02: server 金额事实源与 shared 事实源逐点一致（含边界值）', () => {
    const values: Array<number | string | null | undefined> = [
      1.005, 8.215, 2.675, 0.01, 1, 80, -12.5, 0,
      '1.005', '8.21', '1e5', 1e21, 1e-7,
      Infinity, -Infinity, NaN, 'abc', null, undefined, ''
    ]
    for (const v of values) {
      expect(Object.is(serverYuanToCents(v), frontendYuanToCents(v))).toBe(true)
    }
  })

  it('TC-FC-03: SRV-17 percent 仍向下取整（本次修复不得改变其口径）', () => {
    const code = percentCode(10)
    // 1005 分 × 10% = 100.5 → floor = 100（不是 round 101）
    expect(computeDiscountCents(code, 1005)).toBe(100)
    expect(computeDiscountCents(code, 999)).toBe(99)
    expect(computeDiscountCents(code, 1)).toBe(0)
  })

  it('TC-FC-04: fixed 仍受总价封顶；非有限折扣值归 0（不放大为整单全免）', () => {
    expect(computeDiscountCents(fixedCode(1.005), 50)).toBe(50) // min(101, 50)
    expect(computeDiscountCents(fixedCode(Infinity), 1_000_000)).toBe(0)
    expect(computeDiscountCents(fixedCode(NaN), 1_000_000)).toBe(0)
  })
})

describe('XEND-12 moneyPrecision 路由门禁（防新码再引入超分精度）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let headers: { Authorization: string }

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist({ qq_number: '90120', subdomain: 'xend12-discount' })
    headers = { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
  })

  it('TC-FC-05: POST fixed=1.005 被 moneyPrecision 拒绝（400），两位小数 1.01 放行', async () => {
    const bad = await app.inject({
      method: 'POST', url: '/api/artist/discount-codes', headers,
      payload: { code: 'X12BAD', discountType: 'fixed', discountValue: 1.005 }
    })
    expect(bad.statusCode).toBe(400)

    const good = await app.inject({
      method: 'POST', url: '/api/artist/discount-codes', headers,
      payload: { code: 'X12OK', discountType: 'fixed', discountValue: 1.01 }
    })
    expect(good.statusCode).toBe(200)
  })

  it('TC-FC-06: PUT 更新口同样拒绝 discountValue=1.005', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/artist/discount-codes', headers,
      payload: { code: 'X12PUT', discountType: 'fixed', discountValue: 1.01 }
    })
    expect(created.statusCode).toBe(200)
    const id = (created.json() as { id: number }).id

    const bad = await app.inject({
      method: 'PUT', url: `/api/artist/discount-codes/${id}`, headers,
      payload: { discountValue: 1.005 }
    })
    expect(bad.statusCode).toBe(400)
  })
})
