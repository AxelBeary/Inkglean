import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as styleService from '../src/features/pricing/style.service.js'

// ============================================
// 815-P2 金额#7（清扫批）：moneyPrecision 浮点安全的两位小数精度校验
// 背景：原 multipleOf: 0.01 因 ajv 浮点除法误拒合法金额（8.21/19.99/0.07 实测被拒），
// 改用 app.ts 注册的 moneyPrecision 关键字（四舍五入后整数比对）。
// ============================================

describe('moneyPrecision 金额精度校验（路由层 schema）', () => {
  let app
  let artist
  let style

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist({ qq_number: '77090', subdomain: 'money-precision' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
  })

  afterEach(async () => {
    await app.close()
  })

  function authH() {
    return { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
  }

  function postSize(payload) {
    return app.inject({
      method: 'POST',
      url: `/api/artist/art-styles/${style.id}/sizes`,
      headers: authH(),
      payload
    })
  }

  it('TC-MP-01: 曾被 multipleOf 误拒的合法两位小数全部放行（8.21/19.99/0.07/100.15）', async () => {
    for (const price of [8.21, 19.99, 0.07, 100.15]) {
      const res = await postSize({ name: `测${price}`, base_price: price })
      expect(res.statusCode, `base_price=${price} 应放行`).toBe(200)
    }
  })

  it('TC-MP-02: 整数与一位小数放行（无精度损失的值不受影响）', async () => {
    for (const price of [100, 8.2, 0.5]) {
      const res = await postSize({ name: `测${price}`, base_price: price })
      expect(res.statusCode, `base_price=${price} 应放行`).toBe(200)
    }
  })

  it('TC-MP-03: 超过两位小数拒绝（8.215/0.001）——原守卫语义保留', async () => {
    for (const price of [8.215, 0.001]) {
      const res = await postSize({ name: `测${price}`, base_price: price })
      expect(res.statusCode, `base_price=${price} 应拒绝`).toBe(400)
    }
  })

  it('TC-MP-04: 增项模板 default_price 同款校验生效（19.99 放行 / 19.999 拒绝）', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/artist/addon-templates',
      headers: authH(),
      payload: { name: '加细节', default_price: 19.99 }
    })
    expect(ok.statusCode).toBe(200)

    const bad = await app.inject({
      method: 'POST',
      url: '/api/artist/addon-templates',
      headers: authH(),
      payload: { name: '加细节2', default_price: 19.999 }
    })
    expect(bad.statusCode).toBe(400)
  })
})
