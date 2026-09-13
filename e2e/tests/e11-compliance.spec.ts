import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'

// R3 · W8：compliance 合规链路端到端测试（举报 → 处理下架 → 客户侧不可见 → 恢复 → 留痕可查）
// 该域此前 E2E 零覆盖（e2e/tests 仅 e1~e10，无举报/下架域）。
// 主链走「主页下架」（seed.ts 不播种 artworks，走此链无需造作品，最省）。
// 全链以 API 断言为主（后端 v75/v76 端点已就绪，不依赖本轮任何前端批）：
//   客户侧「不可见」用「最小载荷」结构断言（仅 id/name/subdomain/status），
//   刻意不校验主页提示文案——与 R2/W7 文案口径解耦（W7 停等中，不赌文案是否定稿）。
// 复用 fixtures/auth.ts 的三 fixture（page 客户 / adminPage 已 step-up），不新建/改 fixture、不改 global-setup。
// 驱动模式与 E10/E6/E9 同款（page.request / adminPage.request 直调接口）。

test('E11 compliance 主页下架全链路（API 断言，与文案解耦）', async ({ page, adminPage }) => {
  const base = E2E_BASE_URL

  // ── 0. 取 Alice 的管理端数字 id（home-takedown/restore 端点按 :id 寻址）──
  const artistsRes = await adminPage.request.get(base + '/api/admin/artists')
  expect(artistsRes.ok()).toBeTruthy()
  const artists = await artistsRes.json()
  const alice = artists.find((a: { subdomain: string }) => a.subdomain === 'alice')
  expect(alice, 'seed 应存在 subdomain=alice 的画师').toBeTruthy()
  const aliceId = alice.id as number

  // ── 1. 举报：匿名客户提交对 Alice 主页的 artist_home 举报（公开入口）──
  const reportRes = await page.request.post(base + '/api/public/reports', {
    data: {
      targetType: 'artist_home',
      targetId: aliceId,
      description: 'E2E 合规链路测试举报：主页含违规内容'
    }
  })
  expect(reportRes.status()).toBe(201)
  const { id: reportId } = await reportRes.json()
  expect(reportId).toBeTruthy()

  // 举报落库后管理端可查，且 v75 取证 IP 已写入（report_ip 非空，仅管理端可见）
  const pendingRes = await adminPage.request.get(base + '/api/admin/reports?status=pending')
  expect(pendingRes.ok()).toBeTruthy()
  const pendingReports = await pendingRes.json()
  const myReport = pendingReports.find((r: { id: number }) => r.id === reportId)
  expect(myReport, '新举报应出现在待处理列表').toBeTruthy()
  expect(myReport.target_type).toBe('artist_home')
  expect(typeof myReport.report_ip).toBe('string')
  expect((myReport.report_ip as string).length).toBeGreaterThan(0)

  // ── 2. 处理 + 主页下架：管理员对 Alice 执行 home-takedown ──
  const takedownRes = await adminPage.request.post(
    base + `/api/admin/artists/${aliceId}/home-takedown`,
    { data: { reason: 'E2E 合规链路：主页违规下架' } }
  )
  expect(takedownRes.ok()).toBeTruthy()
  const takedownJson = await takedownRes.json()
  expect(takedownJson.success).toBe(true)
  expect(takedownJson.already).toBeUndefined()

  // 幂等：已是下架态再次下架 → success:true + already:true（不重复记账）
  const takedownAgain = await adminPage.request.post(
    base + `/api/admin/artists/${aliceId}/home-takedown`,
    { data: { reason: 'E2E 合规链路：重复下架' } }
  )
  expect(takedownAgain.ok()).toBeTruthy()
  const takedownAgainJson = await takedownAgain.json()
  expect(takedownAgainJson.success).toBe(true)
  expect(takedownAgainJson.already).toBe(true)

  // ── 3. 客户侧不可见：公开主页仅返回最小载荷（不校验文案，与 W7 解耦）──
  const hiddenRes = await page.request.get(base + '/api/artists/alice')
  expect(hiddenRes.ok()).toBeTruthy()
  const hiddenJson = await hiddenRes.json()
  // 下架态与自助隐身同载荷：status='hidden'，仅回 id/name/subdomain/status
  expect(hiddenJson.status).toBe('hidden')
  expect(hiddenJson.id).toBe(aliceId)
  // 刻意不暴露 bio / artworks / rules / pricing（结构断言，不依赖任何主页提示文案）
  expect(hiddenJson).not.toHaveProperty('bio')
  expect(hiddenJson).not.toHaveProperty('artworks')
  expect(hiddenJson).not.toHaveProperty('rules')

  // ── 4. 恢复：管理员 home-restore → 主页回到公开可见完整载荷 ──
  const restoreRes = await adminPage.request.post(
    base + `/api/admin/artists/${aliceId}/home-restore`,
    { data: { reason: 'E2E 合规链路：整改完成恢复' } }
  )
  expect(restoreRes.ok()).toBeTruthy()
  expect((await restoreRes.json()).success).toBe(true)

  const visibleRes = await page.request.get(base + '/api/artists/alice')
  expect(visibleRes.ok()).toBeTruthy()
  const visibleJson = await visibleRes.json()
  // 恢复后不再是 hidden 最小载荷，返回完整主页信息（含 bio）
  expect(visibleJson.status).not.toBe('hidden')
  expect(visibleJson).toHaveProperty('bio')

  // ── 5. 留痕可查（覆盖 v75：该表此前只写不读）：下架/恢复动作带 admin_ip ──
  // 注意口径：admin_actions 的 target_type 为 'artist'（主页下架以画师为对象），
  //   与 reports 表的 'artist_home' 不同名——以代码为准（compliance.service.ts:182/198）。
  for (const action of ['home_takedown', 'home_restore']) {
    const actionsRes = await adminPage.request.get(
      base + `/api/admin/admin-actions?action=${action}&targetType=artist&targetId=${aliceId}`
    )
    expect(actionsRes.ok()).toBeTruthy()
    const { rows, total } = await actionsRes.json()
    expect(total, `${action} 应至少留痕 1 条`).toBeGreaterThanOrEqual(1)
    const matched = (rows as Array<Record<string, unknown>>).filter(
      (r) => r.action === action && r.target_type === 'artist' && r.target_id === aliceId
    )
    expect(matched.length, `${action} 留痕可按对象查到`).toBeGreaterThanOrEqual(1)
    // v75 取证：留痕必须带来源 IP（REQ-042 §七 验收 4「时间/IP/原因」欠账补齐）
    for (const row of matched) {
      expect(typeof row.admin_ip).toBe('string')
      expect((row.admin_ip as string).length).toBeGreaterThan(0)
      expect(row.created_at).toBeTruthy()
    }
  }

  // ── 6. 幂等不重复记账反证：重复下架未新增 home_takedown 留痕 ──
  const counted = await adminPage.request.get(
    base + `/api/admin/admin-actions?action=home_takedown&targetType=artist&targetId=${aliceId}`
  )
  expect(counted.ok()).toBeTruthy()
  const { total: takedownTotal } = await counted.json()
  // 步骤 2 连续下架两次，但第二次 already 不写账 → 全程本用例只应留 1 条 home_takedown
  expect(takedownTotal).toBe(1)
})
