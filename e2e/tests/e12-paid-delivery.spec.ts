import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// 客户沿用保存的查单链接；后台通过正常的双重认证会话为同一已交付文件补签。
test('E12 已收款订单下架后可取件，管理员可从后台补发', async ({ page, artistPage, adminPage }) => {
  const create = await page.request.post(E2E_BASE_URL + '/api/orders', {
    data: { subdomain: 'alice', clientQq: '66689', description: '本地已付款交付验证', agreeRules: true }
  })
  expect(create.ok()).toBe(true)
  const { orderNo, customerToken } = await create.json()

  const listed = await artistPage.request.get(E2E_BASE_URL + '/api/artist/orders?pageSize=200')
  expect(listed.ok()).toBe(true)
  const { items } = await listed.json()
  const order = items.find((item: { order_no: string }) => item.order_no === orderNo)
  expect(order).toBeTruthy()
  const artistOrder = E2E_BASE_URL + '/api/artist/orders/' + order.id
  expect((await artistPage.request.put(artistOrder + '/price', { data: { finalPriceCents: 20000 } })).ok()).toBe(true)
  const payment = await artistPage.request.post(artistOrder + '/payments', { data: { amountCents: 20000 } })
  expect(payment.ok()).toBe(true)
  expect((await payment.json()).paidTotalCents).toBe(20000)
  for (const status of ['confirmed', 'wip']) {
    expect((await artistPage.request.put(artistOrder + '/status', { data: { status } })).ok()).toBe(true)
  }

  const upload = await artistPage.request.post(E2E_BASE_URL + '/api/upload/deliverable', {
    multipart: { file: { name: 'e12-final.png', mimeType: 'image/png', buffer: png } }
  })
  expect(upload.ok()).toBe(true)
  const { filePath, originalName } = await upload.json()
  const delivered = await artistPage.request.post(artistOrder + '/deliver', { data: { filePath, fileName: originalName } })
  expect(delivered.ok()).toBe(true)
  expect((await delivered.json()).status).toBe('delivered')

  const artists = await adminPage.request.get(E2E_BASE_URL + '/api/admin/artists')
  expect(artists.ok()).toBe(true)
  const artist = (await artists.json()).find((item: { subdomain: string }) => item.subdomain === 'alice')
  expect(artist).toBeTruthy()
  const management = E2E_BASE_URL + '/api/admin/artists/' + artist.id
  expect((await adminPage.request.post(management + '/home-takedown', { data: { reason: '本地交付用例' } })).ok()).toBe(true)

  try {
    const query = new URLSearchParams({ no: orderNo, token: customerToken })
    await page.goto('/artist/alice/track?' + query)
    await expect(page).toHaveURL(url => url.pathname === '/artist/alice/delivery/' + orderNo)
    const fileItem = page.locator('.file-item')
    await expect(fileItem.getByText('e12-final.png', { exact: true })).toBeVisible()
    const firstDownload = page.waitForEvent('download')
    await fileItem.getByRole('button', { name: '下载', exact: true }).click()
    expect((await firstDownload).suggestedFilename()).toBe('e12-final.png')
    await expect(fileItem.locator('.el-tag')).toBeVisible()

    await adminPage.goto('/admin/delivery')
    await adminPage.locator('#admin-delivery-order-no').fill(orderNo)
    await adminPage.getByTestId('delivery-search').click()
    const issue = adminPage.getByTestId('delivery-reissue')
    await expect(issue).toBeVisible()
    await issue.click()
    const issued = adminPage.waitForResponse(res => res.request().method() === 'POST' && res.url().endsWith('/reissue'))
    await adminPage.locator('.el-message-box__btns .el-button--primary').click()
    const result = await issued
    expect(result.ok()).toBe(true)
    const { url, expiresInSeconds } = await result.json()
    expect(expiresInSeconds).toBe(300)
    await expect(adminPage.getByTestId('delivery-receipt')).toBeVisible()

    const download = await page.request.get(E2E_BASE_URL + url)
    expect(download.ok()).toBe(true)
    expect(await download.body()).toEqual(png)
    const audit = await adminPage.request.get(E2E_BASE_URL + '/api/admin/admin-actions?action=delivery_link_reissue')
    expect(audit.ok()).toBe(true)
    const { rows } = await audit.json()
    expect(rows.some((row: { action: string; reason?: string }) =>
      row.action === 'delivery_link_reissue' && row.reason?.includes(orderNo)
    )).toBe(true)
  } finally {
    expect((await adminPage.request.post(management + '/home-restore', { data: { reason: '本地用例清理' } })).ok()).toBe(true)
  }
})
