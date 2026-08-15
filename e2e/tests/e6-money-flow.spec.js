import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'

// E6: 金钱链路（报价→定金→尾款→退款→对账）
// 全部走 API：客户下单（公开）→ 画师改价/收款/推进节点（artist_token cookie）
// 金额一律用整数分，避免浮点误差
test('E6 金钱链路完整流程', async ({ page, artistPage }) => {
  const base = E2E_BASE_URL

  // ── 1. 客户下单（公开 API，无需登录）──
  const createRes = await page.request.post(base + '/api/orders', {
    data: {
      subdomain: 'alice',
      clientQq: '66666',
      clientName: 'E2E 金钱链路',
      description: 'E2E 钱链路测试订单',
      agreeRules: true
    }
  })
  expect(createRes.ok()).toBeTruthy()
  const { orderNo } = await createRes.json()
  expect(orderNo).toBeTruthy()

  // ── 2. 画师端找到订单 id（列表 API 按 order_no 匹配）──
  const listRes = await artistPage.request.get(base + '/api/artist/orders?pageSize=200')
  expect(listRes.ok()).toBeTruthy()
  const { items } = await listRes.json()
  const order = items.find(o => o.order_no === orderNo)
  expect(order).toBeTruthy()
  const orderId = order.id

  // ── 3. 画师改价（报价 500 元 = 50000 分）──
  const priceRes = await artistPage.request.put(base + `/api/artist/orders/${orderId}/price`, {
    data: { finalPriceCents: 50000 }
  })
  expect(priceRes.ok()).toBeTruthy()
  const priceJson = await priceRes.json()
  expect(priceJson.final_price_cents).toBe(50000)

  // ── 4. 收定金（100 元 = 10000 分）──
  const depositRes = await artistPage.request.post(base + `/api/artist/orders/${orderId}/payments`, {
    data: { amountCents: 10000, note: '定金' }
  })
  expect(depositRes.ok()).toBeTruthy()
  const depositJson = await depositRes.json()
  expect(depositJson.paidTotalCents).toBe(10000)

  // ── 5. 推进节点到第二个（收尾款前置）──
  const wfRes = await artistPage.request.get(base + '/api/artist/workflow')
  expect(wfRes.ok()).toBeTruthy()
  const { stages } = await wfRes.json()
  expect(stages.length).toBeGreaterThanOrEqual(2)
  const stageRes = await artistPage.request.put(base + `/api/artist/orders/${orderId}/stage`, {
    data: { stageId: stages[1].id }
  })
  expect(stageRes.ok()).toBeTruthy()

  // ── 6. 收尾款（400 元 = 40000 分），累计 50000 ──
  const tailRes = await artistPage.request.post(base + `/api/artist/orders/${orderId}/payments`, {
    data: { amountCents: 40000, note: '尾款' }
  })
  expect(tailRes.ok()).toBeTruthy()
  const tailJson = await tailRes.json()
  expect(tailJson.paidTotalCents).toBe(50000)

  // ── 7. 对账断言（订单详情 paid_total_cents / final_price_cents）──
  const detailRes = await artistPage.request.get(base + `/api/artist/orders/${orderId}`)
  expect(detailRes.ok()).toBeTruthy()
  const detail = await detailRes.json()
  expect(detail.final_price_cents).toBe(50000)
  expect(detail.paid_total_cents).toBe(50000)

  // ── 8. 退款（负收款 -50 元 = -5000 分）──
  const refundRes = await artistPage.request.post(base + `/api/artist/orders/${orderId}/payments`, {
    data: { amountCents: -5000, note: '退款' }
  })
  expect(refundRes.ok()).toBeTruthy()
  const refundJson = await refundRes.json()
  expect(refundJson.paidTotalCents).toBe(45000)

  // ── 9. 最终对账（45000 分）──
  const finalRes = await artistPage.request.get(base + `/api/artist/orders/${orderId}`)
  expect(finalRes.ok()).toBeTruthy()
  const final = await finalRes.json()
  expect(final.final_price_cents).toBe(50000)
  expect(final.paid_total_cents).toBe(45000)
})

// E6b: SPEC-PRICE-2 风格模式计价链路（公式铁律：(基础价+Σ固定增项+Σ百分比增项[只按基础价])×用途×加急−折扣，全程整数分）
test('E6b SPEC-PRICE-2 风格模式算价+下单+收款', async ({ page, artistPage }) => {
  const base = E2E_BASE_URL

  // ── 1. 建画风 + 尺寸（基础价 600 元）──
  const styleRes = await artistPage.request.post(base + '/api/artist/art-styles', {
    data: { name: 'E2E风格' }
  })
  expect(styleRes.ok()).toBeTruthy()
  const style = await styleRes.json()

  const sizeRes = await artistPage.request.post(base + `/api/artist/art-styles/${style.id}/sizes`, {
    data: { name: '全身', base_price: 600 }
  })
  expect(sizeRes.ok()).toBeTruthy()
  const size = await sizeRes.json()

  // ── 2. 建四类增项模板：固定加法/百分比加法/用途/加急 ──
  const mkTpl = async (data) => {
    const res = await artistPage.request.post(base + '/api/artist/addon-templates', { data })
    expect(res.ok()).toBeTruthy()
    return res.json()
  }
  const tplBg = await mkTpl({ name: 'E2E背景', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add' })
  const tplDetail = await mkTpl({ name: 'E2E精细', control_type: 'switch', price_mode: 'percent', default_price: 20, category: 'add' })
  const tplUsage = await mkTpl({ name: 'E2E商用', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage' })
  const tplRush = await mkTpl({ name: 'E2E加急', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'rush' })

  // ── 3. 挂到画风 ──
  const bindRes = await artistPage.request.put(base + `/api/artist/art-styles/${style.id}/addons`, {
    data: { items: [
      { addon_template_id: tplBg.id },
      { addon_template_id: tplDetail.id },
      { addon_template_id: tplUsage.id },
      { addon_template_id: tplRush.id }
    ] }
  })
  expect(bindRes.ok()).toBeTruthy()
  const bound = await bindRes.json()
  const saOf = (tplId) => bound.find(a => a.addon_template_id === tplId)

  // ── 4. 公开算价：精确整数分断言 ──
  // (600 + 150 + 600×20%=120) = 870 小计 → ×1.5 = 1305 → ×2 = 2610 元
  const calcRes = await page.request.post(base + '/api/public/calculate-style-price', {
    data: {
      subdomain: 'alice',
      styleSizeId: size.id,
      addons: [
        { styleAddonId: saOf(tplBg.id).id },
        { styleAddonId: saOf(tplDetail.id).id },
        { styleAddonId: saOf(tplUsage.id).id },
        { styleAddonId: saOf(tplRush.id).id }
      ]
    }
  })
  expect(calcRes.ok()).toBeTruthy()
  const calc = await calcRes.json()
  expect(calc.baseCents).toBe(60000)
  expect(calc.subtotalCents).toBe(87000) // 百分比增项只按基础价：600×20%=120（而非 750×20%）
  expect(calc.usage.percent).toBe(50)
  expect(calc.rush.percent).toBe(100)
  expect(calc.afterMultipliersCents).toBe(261000) // 870×1.5×2
  expect(calc.totalCents).toBe(261000)

  // ── 5. 同用途双选 → 后端互斥拦截 400 ──
  const tplUsage2 = await mkTpl({ name: 'E2E买断', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'usage' })
  await artistPage.request.put(base + `/api/artist/art-styles/${style.id}/addons`, {
    data: { items: [{ addon_template_id: tplUsage2.id }] }
  })
  const bound2 = await (await artistPage.request.get(base + '/api/artist/art-styles')).json()
  const saUsage2 = bound2.find(s => s.id === style.id).addons.find(a => a.addon_template_id === tplUsage2.id)
  const mutexRes = await page.request.post(base + '/api/public/calculate-style-price', {
    data: {
      subdomain: 'alice',
      styleSizeId: size.id,
      addons: [{ styleAddonId: saOf(tplUsage.id).id }, { styleAddonId: saUsage2.id }]
    }
  })
  expect(mutexRes.status()).toBe(400)
  expect((await mutexRes.json()).code).toBe('ADDON_SELECTION_MUTEX')

  // ── 6. 下单（同算价选择）→ 总价一致，快照含画风/尺寸 ──
  const orderRes = await page.request.post(base + '/api/orders', {
    data: {
      subdomain: 'alice',
      clientQq: '66667',
      clientName: 'E2E 风格链路',
      agreeRules: true,
      styleSizeId: size.id,
      styleAddons: [
        { styleAddonId: saOf(tplBg.id).id },
        { styleAddonId: saOf(tplDetail.id).id },
        { styleAddonId: saOf(tplUsage.id).id },
        { styleAddonId: saOf(tplRush.id).id }
      ]
    }
  })
  expect(orderRes.ok()).toBeTruthy()
  const { orderNo } = await orderRes.json()

  const listRes = await artistPage.request.get(base + '/api/artist/orders?pageSize=200')
  const order = (await listRes.json()).items.find(o => o.order_no === orderNo)
  expect(order).toBeTruthy()
  const detail = await (await artistPage.request.get(base + `/api/artist/orders/${order.id}`)).json()
  expect(detail.total_price_cents).toBe(261000)
  expect(detail.quote_snapshot).toContain('E2E风格')
  expect(detail.quote_snapshot).toContain('全身')

  // ── 7. 收 50% 定金 → 对账 ──
  const depRes = await artistPage.request.post(base + `/api/artist/orders/${order.id}/payments`, {
    data: { amountCents: 130500, note: '定金50%' }
  })
  expect(depRes.ok()).toBeTruthy()
  expect((await depRes.json()).paidTotalCents).toBe(130500)
  const finalDetail = await (await artistPage.request.get(base + `/api/artist/orders/${order.id}`)).json()
  expect(finalDetail.total_price_cents).toBe(261000)
  expect(finalDetail.paid_total_cents).toBe(130500)
})
