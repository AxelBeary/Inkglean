import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as wf from '../src/features/artist/workflow.service.js'
import * as orderSvc from '../src/features/order/order.service.js'

/** 快速给画师种入默认 7 节点 */
function seed(artistId) {
  wf.seedArtistStages(artistId)
  return wf.getWorkflow(artistId)
}

/** 种入一个正式区订单并生成分期快照（批4 B10 守卫的命中条件：订单行 + 分期行） */
function seedOrderWithInstallments(artistId, overrides = {}) {
  const order = seedOrder(artistId, { queue_zone: 'formal', ...overrides })
  db.prepare('UPDATE orders SET total_price_cents = ?, final_price_cents = ?, price_snapshot = ? WHERE id = ?')
    .run(10000, 10000, 100, order.id)
  orderSvc.generateInstallmentsForOrder(order.id)
  return order
}

/** 断言抛 WORKFLOW_PAYMENT_IN_USE 且 detail.count 正确（批4 B10 守卫） */
function expectBlocked(fn, count) {
  let caught = null
  try { fn() } catch (err) { caught = err }
  expect(caught).toBeInstanceOf(Error)
  expect(caught.code).toBe('WORKFLOW_PAYMENT_IN_USE')
  expect(caught.detail).toEqual({ count })
}

describe('流程与比例服务 (Workflow Service)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  // TC-W-01: 新画师从模板初始化
  it('TC-W-01: 种子 7 节点，排期确认 3000，交付 7000 且 isFinal', () => {
    const stages = seed(artist.id)
    expect(stages).toHaveLength(7)
    expect(stages[0].name).toBe('定稿')
    expect(stages[0].takesPayment).toBe(false)

    const pay = stages.filter(s => s.takesPayment)
    expect(pay).toHaveLength(2)
    expect(pay[0].name).toBe('排期确认')
    expect(pay[0].basisPoints).toBe(3000)
    expect(pay[0].isFinal).toBe(false)
    expect(pay[1].name).toBe('交付')
    expect(pay[1].basisPoints).toBe(7000)
    expect(pay[1].isFinal).toBe(true)
  })

  // TC-W-02: 添加节点插入到倒数第二位
  it('TC-W-02: 添加节点插入到尾款之前', () => {
    seed(artist.id)
    wf.addStage(artist.id, { name: '细化确认' })
    const stages = wf.getWorkflow(artist.id)
    expect(stages).toHaveLength(8)
    // 细化确认应在交付之前
    const idx = stages.findIndex(s => s.name === '细化确认')
    const finalIdx = stages.findIndex(s => s.isFinal)
    expect(idx).toBeLessThan(finalIdx)
  })

  // TC-W-03: 删除尾款节点被拒绝
  it('TC-W-03: 删除尾款节点抛出错误', () => {
    const stages = seed(artist.id)
    const final = stages.find(s => s.isFinal)
    expect(() => wf.deleteStage(artist.id, final.id)).toThrow('FINAL_CANNOT_DELETE')
  })

  // TC-W-04: 删除收款节点，比例并入尾款
  it('TC-W-04: 删除收款节点后比例并入尾款', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal) // 排期确认 3000
    wf.deleteStage(artist.id, pay.id)
    const after = wf.getWorkflow(artist.id)
    const final = after.find(s => s.isFinal)
    expect(final.basisPoints).toBe(10000) // 3000 + 7000
    expect(after.filter(s => s.takesPayment)).toHaveLength(1)
  })

  // TC-W-05: 开启收款（尾款充足）
  it('TC-W-05: 开启收款默认 1000，尾款扣除', () => {
    const stages = seed(artist.id)
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    const after = wf.getWorkflow(artist.id)
    const d = after.find(s => s.id === draft.id)
    const final = after.find(s => s.isFinal)
    expect(d.takesPayment).toBe(true)
    expect(d.basisPoints).toBe(1000)
    expect(final.basisPoints).toBe(6000) // 7000 - 1000
  })

  // TC-W-06: 开启收款（尾款仅让出 500）
  it('TC-W-06: 尾款仅够让出 500 时以 500 开启', () => {
    const stages = seed(artist.id)
    // 排期确认 9000 → 尾款 1000（刚好能让出 500，自己保留 500）
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 9000 }])
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    const after = wf.getWorkflow(artist.id)
    const d = after.find(s => s.id === draft.id)
    const final = after.find(s => s.isFinal)
    expect(d.basisPoints).toBe(500)
    expect(final.basisPoints).toBe(500)
  })

  // TC-W-07: 开启收款（尾款让不出 500）被拒绝
  it('TC-W-07: 尾款仅 500 时无法再开启新收款', () => {
    const stages = seed(artist.id)
    // 排期确认 9000 → 尾款 1000
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 9000 }])
    // 先开草稿确认（500），尾款剩 500
    const draft = stages.find(s => s.name === '草稿确认')
    wf.updateStage(artist.id, draft.id, { takesPayment: true })
    // 再开线稿确认 → 尾款只有 500，让不出 → 拒绝
    const line = stages.find(s => s.name === '线稿确认')
    expect(() => wf.updateStage(artist.id, line.id, { takesPayment: true })).toThrow()
  })

  // TC-W-08: 开启第 21 期被拒绝
  it('TC-W-08: 超过 20 期拒绝', () => {
    seed(artist.id)
    // 直接用 SQL 插入 18 个收款节点（加上原有 2 个 = 20）
    for (let i = 0; i < 18; i++) {
      db.prepare(
        'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, 1, 500)'
      ).run(artist.id, `节点${i}`, 100 + i)
    }
    // 再加一个非收款节点
    wf.addStage(artist.id, { name: '第21个' })
    const stages = wf.getWorkflow(artist.id)
    const nonPay = stages.find(s => s.name === '第21个')
    expect(() => wf.updateStage(artist.id, nonPay.id, { takesPayment: true })).toThrow('MAX_INSTALLMENTS')
  })

  // TC-W-09: 关闭收款（非尾款）
  it('TC-W-09: 关闭收款后比例并入尾款', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.updateStage(artist.id, pay.id, { takesPayment: false })
    const after = wf.getWorkflow(artist.id)
    const p = after.find(s => s.id === pay.id)
    const final = after.find(s => s.isFinal)
    expect(p.takesPayment).toBe(false)
    expect(p.basisPoints).toBeNull()
    expect(final.basisPoints).toBe(10000)
  })

  // TC-W-10: 关闭尾款收款被拒绝
  it('TC-W-10: 关闭尾款收款抛出错误', () => {
    const stages = seed(artist.id)
    const final = stages.find(s => s.isFinal)
    expect(() => wf.updateStage(artist.id, final.id, { takesPayment: false })).toThrow('FINAL_CANNOT_DISABLE')
  })

  // TC-W-11: 批量保存比例，尾款重算
  it('TC-W-11: 保存比例后总和恒 10000', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 1500 }])
    const after = wf.getWorkflow(artist.id)
    const sum = after.filter(s => s.takesPayment).reduce((a, s) => a + s.basisPoints, 0)
    expect(sum).toBe(10000)
    expect(after.find(s => s.isFinal).basisPoints).toBe(8500)
  })

  // TC-W-12: 单期 < 500 被拒绝
  it('TC-W-12: 比例低于 5% 拒绝', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    expect(() => wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 400 }])).toThrow('BP_TOO_LOW')
  })

  // TC-W-13: reorder 使收款节点成为最后收款节点
  it('TC-W-13: 排序后尾款易主，基点重算', () => {
    const stages = seed(artist.id)
    // 把排期确认拖到最后 → 它变成尾款
    const ids = stages.map(s => s.id)
    const payIdx = ids.indexOf(stages.find(s => s.name === '排期确认').id)
    ids.splice(payIdx, 1)
    ids.push(stages.find(s => s.name === '排期确认').id)
    wf.reorderStages(artist.id, ids)
    const after = wf.getWorkflow(artist.id)
    const newFinal = after.find(s => s.isFinal)
    expect(newFinal.name).toBe('排期确认')
    // 总和仍 10000
    const sum = after.filter(s => s.takesPayment).reduce((a, s) => a + s.basisPoints, 0)
    expect(sum).toBe(10000)
  })

  // TC-W-14: 改名后 GET 返回新名
  it('TC-W-14: 改名即时生效', () => {
    const stages = seed(artist.id)
    const s = stages[0]
    wf.updateStage(artist.id, s.id, { name: '需求确认' })
    const after = wf.getWorkflow(artist.id)
    expect(after.find(x => x.id === s.id).name).toBe('需求确认')
  })

  // TC-W-15: 存量画师迁移幂等
  it('TC-W-15: 重复种子不重复插入', () => {
    seed(artist.id)
    wf.seedArtistStages(artist.id) // 第二次调用
    expect(wf.getWorkflow(artist.id)).toHaveLength(7)
  })

  // TC-W-16: 管理员编辑画师 workflow 与自操作一致
  it('TC-W-16: 管理员操作结果一致', () => {
    const stages = seed(artist.id)
    const s = stages[0]
    // 管理员改名（走同一个 service 函数）
    wf.updateStage(artist.id, s.id, { name: '管理员改名' })
    expect(wf.getWorkflow(artist.id).find(x => x.id === s.id).name).toBe('管理员改名')
  })

  // TC-W-17: 默认模板 CRUD + reset
  it('TC-W-17: 模板修改后 reset 恢复出厂', () => {
    wf.resetDefaultTemplate()
    const tpl = wf.getDefaultTemplate()
    expect(tpl).toHaveLength(7)

    // 修改
    wf.updateDefaultTemplate([
      { name: 'A', takesPayment: true, basisPoints: 5000 },
      { name: 'B', takesPayment: true, basisPoints: 5000 }
    ])
    expect(wf.getDefaultTemplate()).toHaveLength(2)

    // reset
    wf.resetDefaultTemplate()
    expect(wf.getDefaultTemplate()).toHaveLength(7)
  })

  // TC-W-18: 定金即全款（1 期 100%）
  it('TC-W-18: 唯一收款节点 isFinal 且 10000', () => {
    seed(artist.id)
    const stages = wf.getWorkflow(artist.id)
    // 关闭排期确认的收款
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    wf.updateStage(artist.id, pay.id, { takesPayment: false })
    const after = wf.getWorkflow(artist.id)
    const payStages = after.filter(s => s.takesPayment)
    expect(payStages).toHaveLength(1)
    expect(payStages[0].isFinal).toBe(true)
    expect(payStages[0].basisPoints).toBe(10000)
  })

  // TC-W-19: 尾款不在列表末尾
  it('TC-W-19: 尾款后有非收款节点，isFinal 正确', () => {
    seed(artist.id)
    const stages = wf.getWorkflow(artist.id)
    // 把交付（尾款）拖到中间
    const ids = stages.map(s => s.id)
    const finalId = stages.find(s => s.isFinal).id
    ids.splice(ids.indexOf(finalId), 1)
    ids.splice(3, 0, finalId) // 插到第 4 位
    wf.reorderStages(artist.id, ids)
    const after = wf.getWorkflow(artist.id)
    const final = after.find(s => s.isFinal)
    const finalIdx = after.findIndex(s => s.isFinal)
    // 尾款后面应该还有节点
    expect(finalIdx).toBeLessThan(after.length - 1)
    expect(final.isFinal).toBe(true)
  })

  // ─── P1-5: 删除有活跃订单引用的节点 ───

  it('TC-W-P15a: 有活跃订单的节点拒绝删除', () => {
    const stages = seed(artist.id)
    // 创建一个订单引用第 3 个节点（草稿确认），状态 wip（活跃）
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stages[2].id, order.id)

    expect(() => wf.deleteStage(artist.id, stages[2].id)).toThrow('STAGE_IN_USE')
  })

  it('TC-W-P15b: 无活跃订单的节点正常删除', () => {
    const stages = seed(artist.id)
    // 创建一个终态订单引用第 3 个节点（delivered 不阻止删除）
    const order = seedOrder(artist.id, { status: 'delivered' })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stages[2].id, order.id)

    const result = wf.deleteStage(artist.id, stages[2].id)
    expect(result.success).toBe(true)
    expect(wf.getWorkflow(artist.id)).toHaveLength(6)
    // 815-P2 状态机#9：终态订单的悬空引用同步置空（不残留指向已删节点的 current_stage_id）
    const row = db.prepare('SELECT current_stage_id FROM orders WHERE id = ?').get(order.id)
    expect(row.current_stage_id).toBeNull()
  })

  it('TC-W-P15c: resetArtistStages 清理终态订单悬空引用（815-P2 状态机#9）', () => {
    const stages = seed(artist.id)
    const order = seedOrder(artist.id, { status: 'delivered' })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stages[2].id, order.id)

    wf.resetArtistStages(artist.id)

    // 重置后旧节点已删，终态订单引用不应悬空指向新模板的碰巧 id，而应置空
    const row = db.prepare('SELECT current_stage_id FROM orders WHERE id = ?').get(order.id)
    expect(row.current_stage_id).toBeNull()
  })

  // ─── P0-1: resetArtistStages 有活跃订单时禁止重置 ───

  it('TC-W-P01: 有活跃订单时 reset 被拒绝（STAGES_RESET_BLOCKED）', () => {
    seed(artist.id)
    // 创建一个非终态订单
    seedOrder(artist.id, { status: 'wip' })

    expect(() => wf.resetArtistStages(artist.id)).toThrow('STAGES_RESET_BLOCKED')
  })

  it('TC-W-P01b: 仅有终态订单时 reset 正常', () => {
    seed(artist.id)
    seedOrder(artist.id, { status: 'delivered' })
    seedOrder(artist.id, { status: 'cancelled' })

    const result = wf.resetArtistStages(artist.id)
    expect(result.length).toBeGreaterThan(0)
  })

  it('TC-W-P01c: 无订单时 reset 正常', () => {
    seed(artist.id)
    const result = wf.resetArtistStages(artist.id)
    expect(result.length).toBeGreaterThan(0)
  })

  // ─── 批4 B10: workflow 模板变更守卫（收款结构变更 vs 活跃订单分期快照） ───

  it('TC-WF-G1: 活跃订单存在时切换收款开关被拒（WORKFLOW_PAYMENT_IN_USE, count=1）', () => {
    const stages = seed(artist.id)
    seedOrderWithInstallments(artist.id, { status: 'wip' })
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    expectBlocked(() => wf.updateStage(artist.id, pay.id, { takesPayment: false }), 1)
  })

  it('TC-WF-G2: 活跃订单存在时 reorder 被拒；无活跃订单时放行', () => {
    const stages = seed(artist.id)
    seedOrderWithInstallments(artist.id, { status: 'wip' })
    expectBlocked(() => wf.reorderStages(artist.id, stages.map(s => s.id).reverse()), 1)
    // 无活跃订单（清空订单）→ 放行（既有排序用例回归不破）
    db.prepare('DELETE FROM orders WHERE artist_id = ?').run(artist.id)
    const result = wf.reorderStages(artist.id, stages.map(s => s.id).reverse())
    expect(result).toHaveLength(7)
  })

  it('TC-WF-G3: 活跃订单存在时 savePayment 放行并标注仅影响新订单（方案 b），新订单按新比例生成', () => {
    const stages = seed(artist.id)
    const oldOrder = seedOrderWithInstallments(artist.id, { status: 'wip' })
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    const result = wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 2000 }])
    // 返回成功 + 活跃订单存在时 appliesToNewOrdersOnly=true
    expect(result.appliesToNewOrdersOnly).toBe(true)
    const after = wf.getWorkflow(artist.id)
    expect(after.find(s => s.id === pay.id).basisPoints).toBe(2000)
    // 既有订单分期仍按旧快照（比例只影响新订单）
    const oldInsts = db.prepare('SELECT basis_points FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(oldOrder.id)
    expect(oldInsts[0].basis_points).toBe(3000)
    expect(oldInsts[1].basis_points).toBe(7000)
    // 新订单按新比例生成
    const newOrder = seedOrderWithInstallments(artist.id, { status: 'wip' })
    const newInsts = db.prepare('SELECT basis_points FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(newOrder.id)
    expect(newInsts[0].basis_points).toBe(2000)
    expect(newInsts[1].basis_points).toBe(8000)
  })

  it('TC-WF-G4: 活跃订单存在时改名/话术等非收款结构变更放行', () => {
    const stages = seed(artist.id)
    seedOrderWithInstallments(artist.id, { status: 'wip' })
    const s = stages[0]
    expect(wf.updateStage(artist.id, s.id, { name: '需求确认' }).name).toBe('需求确认')
    expect(wf.updateStage(artist.id, s.id, { speechTemplate: '新的话术' }).speechTemplate).toBe('新的话术')
  })

  it('TC-WF-G5: 活跃订单仅缓冲/0价（无分期行）时三处均拦截（L-1 统计口径覆盖全部活跃订单）', () => {
    const stages = seed(artist.id)
    // 缓冲单：不生成分期
    seedOrder(artist.id, { status: 'wip', queue_zone: 'buffer' })
    // 正式区 0 价单：无分期行
    const zero = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET total_price_cents = 0, final_price_cents = 0 WHERE id = ?').run(zero.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    // savePayment 标注仅影响新订单（存在活跃订单）
    const result = wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 2000 }])
    expect(result.appliesToNewOrdersOnly).toBe(true)
    // reorder 拦截（count = 缓冲 1 + 0 价 1）
    expectBlocked(() => wf.reorderStages(artist.id, stages.map(s => s.id)), 2)
    // takesPayment 切换拦截（开启草稿确认收款）
    const draft = stages.find(s => s.name === '草稿确认')
    expectBlocked(() => wf.updateStage(artist.id, draft.id, { takesPayment: true }), 2)
  })

  it('TC-WF-G8: deleteStage 收款节点补 B10 守卫——缓冲活跃单拦截，终态不拦，非收款节点不受影响', () => {
    const stages = seed(artist.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    // 缓冲单（无分期行）→ 删除收款节点拦截
    seedOrder(artist.id, { status: 'wip', queue_zone: 'buffer' })
    expectBlocked(() => wf.deleteStage(artist.id, pay.id), 1)
    // 清掉缓冲单后，终态订单不拦（B10 口径排除 delivered/cancelled）
    db.prepare('DELETE FROM orders WHERE artist_id = ?').run(artist.id)
    seedOrderWithInstallments(artist.id, { status: 'delivered' })
    seedOrderWithInstallments(artist.id, { status: 'cancelled' })
    expect(wf.deleteStage(artist.id, pay.id).success).toBe(true)
    // 非收款节点不受 B10 拦截（有活跃订单时仍可删；STAGE_IN_USE 仅拦 current_stage_id 命中）
    const after = wf.getWorkflow(artist.id)
    const nonPay = after.find(s => !s.takesPayment)
    seedOrder(artist.id, { status: 'wip' })
    expect(wf.deleteStage(artist.id, nonPay.id).success).toBe(true)
  })

  it('TC-WF-G6: 已交付/已取消订单不拦截（终态排除）', () => {
    const stages = seed(artist.id)
    seedOrderWithInstallments(artist.id, { status: 'delivered' })
    seedOrderWithInstallments(artist.id, { status: 'cancelled' })
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    const result = wf.savePayment(artist.id, [{ id: pay.id, basisPoints: 2000 }])
    expect(result.appliesToNewOrdersOnly).toBe(false)
    expect(() => wf.reorderStages(artist.id, stages.map(s => s.id))).not.toThrow()
    const draft = stages.find(s => s.name === '草稿确认')
    expect(() => wf.updateStage(artist.id, draft.id, { takesPayment: true })).not.toThrow()
  })

  it('TC-WF-G7: 变更被拒后既有订单节点金额与锁定状态不变（防摊错节点）', () => {
    const stages = seed(artist.id)
    const order = seedOrderWithInstallments(artist.id, { status: 'wip' })
    orderSvc.refreshInstallmentLocks(order.id)
    const before = db.prepare('SELECT amount_cents, locked, locked_reason FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(order.id)
    const pay = stages.find(s => s.takesPayment && !s.isFinal)
    expectBlocked(() => wf.updateStage(artist.id, pay.id, { takesPayment: false }), 1)
    expectBlocked(() => wf.reorderStages(artist.id, stages.map(s => s.id).reverse()), 1)
    // 拒绝后刷新锁定，结果与变更前一致
    orderSvc.refreshInstallmentLocks(order.id)
    const after = db.prepare('SELECT amount_cents, locked, locked_reason FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(order.id)
    expect(after).toEqual(before)
  })
})
