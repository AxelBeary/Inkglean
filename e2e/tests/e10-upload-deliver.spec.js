import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'

// P1-10 补链二：上传/交付链路 + 一次性下载（815 拍板 #4）
// 客户下单 → 画师上传交付文件并交付 → 客户凭查单令牌完整下载一次后锁定
// → 再次下载被拒（410）→ 画师再许可 → 可重新下载
// 全部走 API（与 E6 同款驱动模式）

// 1x1 PNG（交付上传需要真实文件体）
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

test('E10 上传交付与一次性下载链路', async ({ page, artistPage }) => {
  const base = E2E_BASE_URL

  // ── 1. 客户下单（公开 API），拿到 orderNo + 一次性下发的 customerToken ──
  const createRes = await page.request.post(base + '/api/orders', {
    data: {
      subdomain: 'alice',
      clientQq: '66688',
      clientName: 'E2E 交付链路',
      description: 'E2E 上传交付与一次性下载测试订单',
      agreeRules: true
    }
  })
  expect(createRes.ok()).toBeTruthy()
  const { orderNo, customerToken } = await createRes.json()
  expect(orderNo).toBeTruthy()
  expect(customerToken).toBeTruthy()

  // ── 2. 画师端找到订单并推进到 wip（交付前置状态）──
  const listRes = await artistPage.request.get(base + '/api/artist/orders?pageSize=200')
  const { items } = await listRes.json()
  const order = items.find(o => o.order_no === orderNo)
  expect(order).toBeTruthy()
  const orderId = order.id

  const confirmRes = await artistPage.request.put(base + `/api/artist/orders/${orderId}/status`, {
    data: { status: 'confirmed' }
  })
  expect(confirmRes.ok()).toBeTruthy()
  const wipRes = await artistPage.request.put(base + `/api/artist/orders/${orderId}/status`, {
    data: { status: 'wip' }
  })
  expect(wipRes.ok()).toBeTruthy()

  // ── 3. 画师上传交付文件（multipart）──
  const upRes = await artistPage.request.post(base + '/api/upload/deliverable', {
    multipart: {
      file: { name: 'e10-final.png', mimeType: 'image/png', buffer: PNG_1X1 }
    }
  })
  expect(upRes.ok()).toBeTruthy()
  const { filePath, originalName } = await upRes.json()
  expect(filePath).toBeTruthy()

  // ── 4. 画师交付（携带该文件）──
  const deliverRes = await artistPage.request.post(base + `/api/artist/orders/${orderId}/deliver`, {
    data: { filePath, fileName: originalName }
  })
  expect(deliverRes.ok()).toBeTruthy()
  expect((await deliverRes.json()).status).toBe('delivered')

  // ── 5. 客户凭查单令牌访问交付页数据（文件可见、未锁定）──
  const trackUrl = `${base}/api/orders/delivery/${orderNo}?token=${customerToken}`
  const dRes = await page.request.get(trackUrl)
  expect(dRes.ok()).toBeTruthy()
  const dJson = await dRes.json()
  expect(dJson.deliverables).toHaveLength(1)
  const fileId = dJson.deliverables[0].id
  expect(dJson.deliverables[0].downloadLocked).toBeFalsy()

  const dl = (path) => page.request.post(`${base}${path}?token=${customerToken}`)

  // ── 6. 一次性下载完整链路：start → fetch 全量 → confirm → 锁定 ──
  const startRes = await dl(`/api/orders/delivery/${orderNo}/file/${fileId}/download-start`)
  expect(startRes.ok()).toBeTruthy()
  const { url } = await startRes.json()
  expect(url).toBeTruthy()

  const fileRes = await page.request.get(base + url)
  expect(fileRes.ok()).toBeTruthy()
  expect((await fileRes.body()).length).toBe(PNG_1X1.length)

  const confirmDlRes = await dl(`/api/orders/delivery/${orderNo}/file/${fileId}/download-confirm`)
  expect(confirmDlRes.ok()).toBeTruthy()

  // 交付页数据核对：已锁定
  const dRes2 = await page.request.get(trackUrl)
  expect((await dRes2.json()).deliverables[0].downloadLocked).toBeTruthy()

  // ── 7. 再次下载被拒（410 DOWNLOAD_LOCKED）──
  const start2 = await dl(`/api/orders/delivery/${orderNo}/file/${fileId}/download-start`)
  expect(start2.status()).toBe(410)

  // ── 8. 画师再许可 ──
  const rpRes = await artistPage.request.post(
    base + `/api/artist/orders/${orderId}/deliverables/${fileId}/repermit`
  )
  expect(rpRes.ok()).toBeTruthy()

  // ── 9. 再许可后可重新下载 ──
  const start3 = await dl(`/api/orders/delivery/${orderNo}/file/${fileId}/download-start`)
  expect(start3.ok()).toBeTruthy()
})
