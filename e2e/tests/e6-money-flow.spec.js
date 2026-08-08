import { test, expect } from '../fixtures/auth.js'

// E6: 金钱链路（报价→定金→尾款→退款→对账）
// 全部走 API：客户下单（公开）→ 画师改价/收款/推进节点（artist_token cookie）
// 金额一律用整数分，避免浮点误差
test('E6 金钱链路完整流程', async ({ page, artistPage }) => {
  const base = 'http://localhost:3999'

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
