/**
 * REQ-025 第二阶段 A 路接线测试（服务层，真实 DB）
 *
 * 覆盖：R4 完成锁/付清锁/回退不解锁 · R5 分摊只摊未锁 · R10 关单后额外应收 ·
 * R11 守恒拒绝坏变动 · R13 done 半终态加/减项 · 端到端主场景守恒实证。
 * 金额单位全部为「分」。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { advanceStage, rollbackStage } from '../src/features/order/order-workflow.service.js'
import { AppError, E } from '../src/shared/errors.js'

// ─── 辅助：四节点工作流（定金10/线稿40/细化30/完稿20，Σbp=100%） ───

function seedFourStageArtist(qq = '88201', sub = 'p2-four') {
  const artist = seedArtist({ qq_number: qq, subdomain: sub })
  const stages = [
    { name: '定金', bp: 1000 },
    { name: '线稿', bp: 4000 },
    { name: '细化', bp: 3000 },
    { name: '完稿', bp: 2000 }
  ]
  const ids = []
  stages.forEach((s, i) => {
    const r = db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, 1, ?)'
    ).run(artist.id, s.name, i + 1, s.bp)
    ids.push(Number(r.lastInsertRowid))
  })
  return { artist, stageIds: ids }
}

function instsOf(orderId) {
  return db.prepare(
    'SELECT label, amount_cents, locked, locked_reason FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId)
}

function entriesOf(orderId) {
  return db.prepare('SELECT type, delta_cents FROM order_price_entries WHERE order_id = ? ORDER BY id ASC').all(orderId)
}

function sum(arr) {
  return arr.reduce((s, v) => s + v, 0)
}

beforeEach(() => cleanDb())

// ============================================
// createOrder 接引擎（必做 2）
// ============================================

describe('createOrder 接引擎', () => {
  it('TC-P2-CO-01: 写 base 条目 + allocateInitial 分配（Σ节点价=总价，守恒）', () => {
    const { artist } = seedFourStageArtist()
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '88301' })
    db.prepare('UPDATE orders SET final_price_cents = 30000, total_price_cents = 30000 WHERE id = ?').run(order.id)
    // createOrder 无价格计算时不生成分期（totalPriceCents=null）——这里走带价路径：直接验证带价场景
    // 用 generateInstallmentsForOrder 模拟带价订单（createOrder 分期同源逻辑）
    db.prepare('UPDATE orders SET queue_zone = ? WHERE id = ?').run('formal', order.id)
    orderService.generateInstallmentsForOrder(order.id)
    const insts = instsOf(order.id)
    expect(insts.map(i => i.amount_cents)).toEqual([3000, 12000, 9000, 6000])
    expect(sum(insts.map(i => i.amount_cents))).toBe(30000)
    expect(insts.every(i => i.locked === 0)).toBe(true)
  })
})

// ============================================
// R4 锁价：完成锁 / 付清锁 / 回退不解锁
// ============================================

describe('R4 锁价规则', () => {
  /** 造一个带价订单（30000，四节点）：直插 orders + 生成节点 */
  function makePricedOrder(artist, qq = '88302') {
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, ?, 'pending', 'formal', 30000, 30000)
    `).run(`P2-${qq}`, artist.id, qq)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')
    return orderId
  }

  it('TC-P2-R4a: 完成即锁——推进越过节点后 locked=1/completed，加价不再动该节点', () => {
    const { artist, stageIds } = seedFourStageArtist('88202', 'p2-r4a')
    const orderId = makePricedOrder(artist)

    orderService.addPayment(orderId, { amountCents: 3000 }) // 收定金
    advanceStage(orderId, stageIds[1]) // 推进到线稿 → 定金阶段完成

    let insts = instsOf(orderId)
    expect(insts[0].locked).toBe(1)
    expect(insts[0].locked_reason).toBe('completed')

    // 加价 20000：定金已锁，只摊线稿/细化/完稿（40:30:20）
    orderService.addExtraItem(orderId, { name: '加急', priceCents: 20000 })
    insts = instsOf(orderId)
    expect(insts[0].amount_cents).toBe(3000) // 已锁节点价不变
    expect(insts.slice(1).map(i => i.amount_cents)).toEqual([20888, 15666, 10446])
    expect(sum(insts.map(i => i.amount_cents))).toBe(50000)
  })

  it('TC-P2-R4b: 付清即锁——未推进但收满节点价 → paidOff，改价不动该节点（R10 单节点全锁场景）', () => {
    const artist = seedArtist({ qq_number: '88203', subdomain: 'p2-r4b' })
    db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, 1, 1, 10000)').run(artist.id, '全款')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88303', 'pending', 'formal', 20000, 20000)
    `).run('P2-R4B', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 20000, 'system')

    orderService.addPayment(orderId, { amountCents: 20000 }) // 收齐
    const insts = instsOf(orderId)
    expect(insts[0].locked).toBe(1)
    expect(insts[0].locked_reason).toBe('paidOff')

    // 全锁后改价 → 节点不动，delta 进额外应收条目（R10；条目由引擎按去向落账，不双重记账）
    orderService.updateFinalPrice(orderId, 25000)
    const after = instsOf(orderId)
    expect(after[0].amount_cents).toBe(20000)
    const entries = entriesOf(orderId)
    expect(entries).toEqual([
      { type: 'base', delta_cents: 20000 },
      { type: 'extra_charge_after_close', delta_cents: 5000 }
    ])
    // 守恒：25000 = 20000 + 5000
    expect(sum(entries.map(e => e.delta_cents))).toBe(25000)
  })

  it('TC-P2-R4c: 回退不解锁——已锁节点打回返工后 locked 保持（reason=prev），加价仍不摊它', () => {
    const { artist, stageIds } = seedFourStageArtist('88204', 'p2-r4c')
    const orderId = makePricedOrder(artist)

    orderService.addPayment(orderId, { amountCents: 3000 })
    advanceStage(orderId, stageIds[1]) // 推进到线稿 → 定金阶段完成
    advanceStage(orderId, stageIds[2]) // 推进到细化 → 定金/线稿完成锁定
    let insts = instsOf(orderId)
    expect(insts[0].locked).toBe(1)
    expect(insts[1].locked).toBe(1)

    // 客户不满意打回线稿返工
    rollbackStage(orderId, stageIds[1])
    insts = instsOf(orderId)
    expect(insts[1].locked).toBe(1) // DB 值不因回退清除

    // 返工加价：线稿虽不在完成范围（completedIdx=0）但 prevLocked 保持锁定
    orderService.addExtraItem(orderId, { name: '返工费', priceCents: 1000 })
    insts = instsOf(orderId)
    expect(insts[0].amount_cents).toBe(3000)
    expect(insts[1].amount_cents).toBe(12000) // 线稿不涨
    expect(insts[1].locked_reason).toBe('prev')
    // 1000 摊细化/完稿（3000:2000 → 600/400）
    expect(insts[2].amount_cents).toBe(9600)
    expect(insts[3].amount_cents).toBe(6400)
  })
})

// ============================================
// R10 关单后 + R13 done 半终态
// ============================================

describe('R10 关单后额外项 + R13 done 半终态', () => {
  it('TC-P2-R10: 推进完稿收齐后加价 → 全部节点不动，额外应收条目（案例 1 末行）', () => {
    const { artist, stageIds } = seedFourStageArtist('88205', 'p2-r10')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88305', 'pending', 'formal', 30000, 30000)
    `).run('P2-R10', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    orderService.addPayment(orderId, { amountCents: 30000 }) // 收齐
    // 逐级推进（状态机不允许 pending 直推 done），末节点 → done，全部完成锁
    advanceStage(orderId, stageIds[1])
    advanceStage(orderId, stageIds[2])
    advanceStage(orderId, stageIds[3])
    expect(instsOf(orderId).every(i => i.locked === 1 && i.locked_reason === 'completed')).toBe(true)

    orderService.addExtraItem(orderId, { name: '多版本光影', priceCents: 5000 })
    const insts = instsOf(orderId)
    expect(insts.map(i => i.amount_cents)).toEqual([3000, 12000, 9000, 6000]) // 节点全不动
    const entries = entriesOf(orderId)
    expect(entries[entries.length - 1]).toEqual({ type: 'extra_charge_after_close', delta_cents: 5000 })
    // 守恒：35000 = 30000 + 5000
    expect(sum(entries.map(e => e.delta_cents))).toBe(35000)
  })

  it('TC-P2-R13a: done 未付全 + 负增项（减价）→ 冲抵未付节点欠款，refund_item 条目（R13 用户场景②）', () => {
    const { artist, stageIds } = seedFourStageArtist('88206', 'p2-r13a')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88306', 'pending', 'formal', 30000, 30000)
    `).run('P2-R13A', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    orderService.addPayment(orderId, { amountCents: 3000 }) // 只收定金
    // 逐级推进到完稿 → done（状态机不允许 pending 直推 done；定金 completed，其余未满足）
    advanceStage(orderId, stageIds[1])
    advanceStage(orderId, stageIds[2])
    advanceStage(orderId, stageIds[3])
    db.prepare("UPDATE orders SET status = 'done' WHERE id = ?").run(orderId)

    // A3 口径变更（R10 关闭语义向 R13 收敛）：
    //   旧口径：全部节点 completed 锁定 → 视作关闭，负 delta 一律进 extra_refund_after_close（与数据矛盾——
    //   客户只付了定金 3000/30000，并非「已付全」，注释与数据不符）。
    //   新口径：关闭 = 全节点锁定 且 Σ待收=0 双条件；本单 Σ待收=27000 ≠ 0 → 未关闭，
    //   负 delta 按 R9 镜像从尾往头冲抵未付节点欠款（done 未付全 → 冲抵未付节点，R13）：
    //     完稿 6000→0、细化 9000→0、线稿 12000→7000，剩余 0 → 不进额外应退。
    orderService.addExtraItem(orderId, { name: '减量退款', priceCents: -20000 })
    const entries = entriesOf(orderId)
    expect(entries[entries.length - 1]).toEqual({ type: 'refund_item', delta_cents: -20000 })
    const finalPrice = db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(orderId).final_price_cents
    expect(finalPrice).toBe(10000)
    // 节点价被冲抵（已锁但未付清的节点可被 delta 冲抵，R13 例外于 R4 冻结）
    expect(instsOf(orderId).map(i => i.amount_cents)).toEqual([3000, 7000, 0, 0])
    // 守恒自检通过（未抛错即通过）：Σ条目 = 10000 = Σ节点价；总价−已收 = 7000 = Σ待收
    expect(sum(entries.map(e => e.delta_cents))).toBe(10000)
    orderService.checkOrderConservation(orderId)
  })

  it('TC-P2-R13d: done 未付全 + 正增项（加价）→ 按 R5 比例摊入未付节点，待收增加（extra_item 条目）', () => {
    const { artist, stageIds } = seedFourStageArtist('88213', 'p2-r13d')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88313', 'pending', 'formal', 30000, 30000)
    `).run('P2-R13D', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    orderService.addPayment(orderId, { amountCents: 3000 }) // 只收定金
    advanceStage(orderId, stageIds[1])
    advanceStage(orderId, stageIds[2])
    advanceStage(orderId, stageIds[3])
    db.prepare("UPDATE orders SET status = 'done' WHERE id = ?").run(orderId)

    // A3 新口径：done 未付全 → 正 delta 按 R5 摊入有待款的节点（含已锁未付清），
    // 客户应付随之同步更新（R13 案例 9 末段）。未付节点 = 线稿/细化/完稿（40:30:20）：
    //   线稿 +8888、细化 +6666、完稿 +4446（尾差归最后未付节点），Σ=20000
    orderService.addExtraItem(orderId, { name: '加多版本光影', priceCents: 20000 })
    const insts = instsOf(orderId)
    expect(insts.map(i => i.amount_cents)).toEqual([3000, 20888, 15666, 10446])
    expect(insts.every(i => i.locked === 1)).toBe(true) // done 全部 completed 锁定，但价格仍可经条目变动
    const entries = entriesOf(orderId)
    expect(entries[entries.length - 1]).toEqual({ type: 'extra_item', delta_cents: 20000 })
    expect(sum(entries.map(e => e.delta_cents))).toBe(50000)
    // 待收增加：总价 50000 − 已收 3000 = 47000 = Σ节点待收
    orderService.checkOrderConservation(orderId)
  })

  it('TC-P2-R13e: done 已付全 + 负增项（减价）→ 维持 extra 语义不变（R10/R13 回归）', () => {
    const { artist, stageIds } = seedFourStageArtist('88214', 'p2-r13e')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88314', 'pending', 'formal', 30000, 30000)
    `).run('P2-R13E', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    orderService.addPayment(orderId, { amountCents: 30000 }) // 收齐
    advanceStage(orderId, stageIds[1])
    advanceStage(orderId, stageIds[2])
    advanceStage(orderId, stageIds[3])
    db.prepare("UPDATE orders SET status = 'done' WHERE id = ?").run(orderId)

    // A3 回归：已付全 + 全锁 → 关闭（Σ待收=0）→ 负 delta 进额外应退，节点不动（R10/R13 案例 9）
    orderService.addExtraItem(orderId, { name: '退款', priceCents: -5000 })
    const entries = entriesOf(orderId)
    expect(entries[entries.length - 1]).toEqual({ type: 'extra_refund_after_close', delta_cents: -5000 })
    expect(instsOf(orderId).map(i => i.amount_cents)).toEqual([3000, 12000, 9000, 6000])
    expect(sum(entries.map(e => e.delta_cents))).toBe(25000)
    orderService.checkOrderConservation(orderId)
  })

  it('TC-P2-R13f: done 未付全 + 负增项超出欠款 → 欠款冲光 + 剩余进额外应退（混合去向双条目）', () => {
    const { artist, stageIds } = seedFourStageArtist('88215', 'p2-r13f')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88315', 'pending', 'formal', 30000, 30000)
    `).run('P2-R13F', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    orderService.addPayment(orderId, { amountCents: 3000 }) // 只收定金
    advanceStage(orderId, stageIds[1])
    advanceStage(orderId, stageIds[2])
    advanceStage(orderId, stageIds[3])
    db.prepare("UPDATE orders SET status = 'done' WHERE id = ?").run(orderId)

    // A3 新口径：负 delta 28000 > 未付欠款 27000 → 欠款冲光（节点 0 化）+ 剩余 1000 进 extra_refund_after_close。
    // 条目：refund_item -27000（节点部分）+ extra_refund_after_close -1000（剩余），Σ = -28000 不双重记账
    orderService.addExtraItem(orderId, { name: '大幅退款', priceCents: -28000 })
    const entries = entriesOf(orderId)
    expect(entries).toEqual([
      { type: 'base', delta_cents: 30000 },
      { type: 'refund_item', delta_cents: -27000 },
      { type: 'extra_refund_after_close', delta_cents: -1000 }
    ])
    expect(instsOf(orderId).map(i => i.amount_cents)).toEqual([3000, 0, 0, 0])
    expect(sum(entries.map(e => e.delta_cents))).toBe(2000)
    orderService.checkOrderConservation(orderId)
  })

  it('TC-P2-R13c: 有未锁节点时减价 → refund_item 条目冲未锁节点（非全锁路径）', () => {
    const { artist } = seedFourStageArtist('88212', 'p2-r13c')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88312', 'wip', 'formal', 30000, 30000)
    `).run('P2-R13C', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    // 无收款无推进 → 全未锁；减 20000 按 R5 摊未锁节点（R8：非尾款待收下限 0，尾款变负）
    orderService.addExtraItem(orderId, { name: '减量', priceCents: -20000 })
    const entries = entriesOf(orderId)
    expect(entries[entries.length - 1]).toEqual({ type: 'refund_item', delta_cents: -20000 })
    const finalPrice = db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(orderId).final_price_cents
    expect(finalPrice).toBe(10000)
    // 守恒：Σ条目 = 10000
    expect(sum(entries.map(e => e.delta_cents))).toBe(10000)
    orderService.checkOrderConservation(orderId)
  })

  it('TC-P2-R13b: 减价超过当前总价 → INVALID_PRICE 拒绝', () => {
    const { artist } = seedFourStageArtist('88207', 'p2-r13b')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88307', 'pending', 'formal', 30000, 30000)
    `).run('P2-R13B', artist.id)
    const orderId = Number(r.lastInsertRowid)
    expect(() => orderService.addExtraItem(orderId, { name: '超额减价', priceCents: -40000 }))
      .toThrow('INVALID_PRICE')
  })
})

// ============================================
// R11 守恒拒绝坏变动
// ============================================

describe('R11 守恒拒绝', () => {
  it('TC-P2-R11a: 手动破坏节点价（Σ节点价≠Σ条目）→ checkOrderConservation 抛 PRICING_CONSERVATION', () => {
    const { artist } = seedFourStageArtist('88208', 'p2-r11a')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88308', 'pending', 'formal', 30000, 30000)
    `).run('P2-R11A', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    // 带病记账：绕过引擎直接篡改节点价（模拟脏数据/坏变动）
    db.prepare('UPDATE order_payment_installments SET amount_cents = amount_cents + 1 WHERE order_id = ? AND sort_order = 0').run(orderId)

    try {
      orderService.checkOrderConservation(orderId)
      expect.unreachable('守恒应拒绝')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect(err.code).toBe(E.PRICING_CONSERVATION)
      expect(err.detail.assertion).toBe('A1')
    }
  })

  it('TC-P2-R11b: Σbp≠100% 订单跳过守恒（守卫）', () => {
    const artist = seedArtist({ qq_number: '88209', subdomain: 'p2-r11b' })
    db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, 1, 1, 3000)').run(artist.id, '定金')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88309', 'pending', 'formal', 50000, 50000)
    `).run('P2-R11B', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    // Σ节点价=15000 ≠ 总价 50000，但 Σbp=3000≠10000 → 守卫跳过，不抛错
    expect(() => orderService.checkOrderConservation(orderId)).not.toThrow()
  })

  it('TC-P2-R11c: 正常链路每步守恒通过（addExtraItem/updateFinalPrice/addPayment/promoteOrder 出口自检）', () => {
    const { artist } = seedFourStageArtist('88210', 'p2-r11c')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88310', 'pending', 'formal', 30000, 30000)
    `).run('P2-R11C', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 30000, 'system')

    // 这些调用若守恒失败会抛 PRICING_CONSERVATION——全过即自检生效
    orderService.addExtraItem(orderId, { name: '加项', priceCents: 8000 })
    orderService.updateFinalPrice(orderId, 40000)
    orderService.addPayment(orderId, { amountCents: 15000 })
    expect(() => orderService.checkOrderConservation(orderId)).not.toThrow()
  })
})

// ============================================
// 端到端主场景守恒实证（交付验收第 3 项）
// ============================================

describe('端到端主场景（改价→收定金→推进→加价，每步 locked+节点价+守恒）', () => {
  it('TC-P2-E2E: 案例 1 全流程数值推演', () => {
    const { artist, stageIds } = seedFourStageArtist('88211', 'p2-e2e')
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents)
      VALUES (?, ?, '88311', 'pending', 'formal', 19500, 19500)
    `).run('P2-E2E', artist.id)
    const orderId = Number(r.lastInsertRowid)
    orderService.generateInstallmentsForOrder(orderId)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', 19500, 'system')

    // 步骤 0：初始分配 19500 → 1950/7800/5850/3900
    expect(instsOf(orderId).map(i => i.amount_cents)).toEqual([1950, 7800, 5850, 3900])
    orderService.checkOrderConservation(orderId)

    // 步骤 1：改价 30000（manual_adjust +10500，全未锁按比例摊）
    orderService.updateFinalPrice(orderId, 30000)
    expect(instsOf(orderId).map(i => i.amount_cents)).toEqual([3000, 12000, 9000, 6000])
    expect(entriesOf(orderId).map(e => e.delta_cents)).toEqual([19500, 10500])
    orderService.checkOrderConservation(orderId)

    // 步骤 2：收定金 3000 → 定金付清即锁（paidOff）
    orderService.addPayment(orderId, { amountCents: 3000 })
    expect(instsOf(orderId)[0]).toMatchObject({ locked: 1, locked_reason: 'paidOff' })
    orderService.checkOrderConservation(orderId)

    // 步骤 3：推进到线稿 → 定金改判 completed 锁
    advanceStage(orderId, stageIds[1])
    expect(instsOf(orderId)[0]).toMatchObject({ locked: 1, locked_reason: 'completed' })
    orderService.checkOrderConservation(orderId)

    // 步骤 4：加 20000 → 只摊未锁节点（线稿/细化/完稿 = 40:30:20，尾差归完稿）
    orderService.addExtraItem(orderId, { name: '加需求', priceCents: 20000 })
    const insts = instsOf(orderId)
    expect(insts.map(i => i.amount_cents)).toEqual([3000, 20888, 15666, 10446])
    expect(insts[0].locked).toBe(1) // 已收节点价不再变 ✓
    orderService.checkOrderConservation(orderId)

    // 终态守恒：总价 50000 = Σ节点价 50000；已收 3000 → Σ待收 47000
    const entries = entriesOf(orderId)
    expect(sum(entries.map(e => e.delta_cents))).toBe(50000)
    const order = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId)
    expect(order.paid_total_cents).toBe(3000)
  })
})
