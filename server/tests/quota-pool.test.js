import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

describe('B7 额度池（v0.23）', () => {
  beforeEach(() => {
    cleanDb()
  })

  // ─── 收款 API ───

  it('TC-PAY-01: 记录收款 +paid_total_cents 累加', () => {
    const artist = seedArtist({ qq_number: '88101', subdomain: 'pay1' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    const p1 = orderService.addPayment(order.id, { amountCents: 10000, note: '定金' })
    expect(p1.amount_cents).toBe(10000)
    expect(p1.note).toBe('定金')

    const fresh1 = orderService.getOrder(order.id)
    expect(fresh1.paid_total_cents).toBe(10000)

    // 第二笔
    orderService.addPayment(order.id, { amountCents: 20000, note: '中期款' })
    const fresh2 = orderService.getOrder(order.id)
    expect(fresh2.paid_total_cents).toBe(30000)
  })

  it('TC-PAY-02: 撤销（负数）-paid_total_cents', () => {
    const artist = seedArtist({ qq_number: '88102', subdomain: 'pay2' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    orderService.addPayment(order.id, { amountCents: 30000, note: '收款' })
    orderService.addPayment(order.id, { amountCents: -10000, note: '客户退款' })

    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(20000)
  })

  it('TC-PAY-03: 非负约束——减到负数拒绝', () => {
    const artist = seedArtist({ qq_number: '88103', subdomain: 'pay3' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    orderService.addPayment(order.id, { amountCents: 10000, note: '收款' })

    // P2-F4: 原子条件更新（事务内）拒绝超额撤销
    expect(() => {
      orderService.addPayment(order.id, { amountCents: -20000, note: '超额撤销' })
    }).toThrow('INVALID_PRICE')

    // paid_total_cents 不变
    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(10000)
    // 且不落任何流水（事务整体回滚）
    const rows = db.prepare('SELECT COUNT(*) AS c FROM order_payments WHERE order_id = ?').get(order.id)
    expect(rows.c).toBe(1)
  })

  it('TC-PAY-04: 负数必须带 note', () => {
    const artist = seedArtist({ qq_number: '88104', subdomain: 'pay4' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    orderService.addPayment(order.id, { amountCents: 10000, note: '收款' })

    expect(() => {
      orderService.addPayment(order.id, { amountCents: -5000 })
    }).toThrow()
  })

  it('TC-PAY-05: 零金额拒绝', () => {
    const artist = seedArtist({ qq_number: '88105', subdomain: 'pay5' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    expect(() => {
      orderService.addPayment(order.id, { amountCents: 0 })
    }).toThrow()
  })

  it('TC-PAY-06: 不存在的订单拒绝', () => {
    expect(() => {
      orderService.addPayment(999999, { amountCents: 100 })
    }).toThrow()
  })

  it('TC-PAY-07: 流水列表按时间排序', () => {
    const artist = seedArtist({ qq_number: '88106', subdomain: 'pay6' })
    const order = seedOrder(artist.id, { total_price_cents: 50000, final_price_cents: 50000 })

    orderService.addPayment(order.id, { amountCents: 10000, note: '第一笔' })
    orderService.addPayment(order.id, { amountCents: 20000, note: '第二笔' })
    orderService.addPayment(order.id, { amountCents: -5000, note: '撤销' })

    const payments = orderService.getPayments(order.id)
    expect(payments).toHaveLength(3)
    expect(payments[0].amount_cents).toBe(10000)
    expect(payments[1].amount_cents).toBe(20000)
    expect(payments[2].amount_cents).toBe(-5000)
  })

  // ─── P2-F9: 终态订单收款状态守卫 ───

  it('TC-PAY-08: cancelled 订单拒绝正数收款、允许负数冲正', () => {
    const artist = seedArtist({ qq_number: '88108', subdomain: 'pay8' })
    const order = seedOrder(artist.id, {
      status: 'cancelled',
      total_price_cents: 50000,
      final_price_cents: 50000
    })
    db.prepare('UPDATE orders SET paid_total_cents = 30000 WHERE id = ?').run(order.id)

    expect(() => {
      orderService.addPayment(order.id, { amountCents: 10000, note: '补收' })
    }).toThrow('PAYMENT_STATUS_BLOCKED')

    // 负数冲正仍允许
    const refund = orderService.addPayment(order.id, { amountCents: -10000, note: '取消后退款' })
    expect(refund.amount_cents).toBe(-10000)
    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(20000)
  })

  it('TC-PAY-09: delivered 订单拒绝正数收款、允许负数退款', () => {
    const artist = seedArtist({ qq_number: '88109', subdomain: 'pay9' })
    const order = seedOrder(artist.id, {
      status: 'delivered',
      total_price_cents: 50000,
      final_price_cents: 50000
    })
    db.prepare('UPDATE orders SET paid_total_cents = 50000 WHERE id = ?').run(order.id)

    expect(() => {
      orderService.addPayment(order.id, { amountCents: 10000, note: '交付后补收' })
    }).toThrow('PAYMENT_STATUS_BLOCKED')

    // 负数退款仍允许（终态只禁正收款，不堵冲正）
    const refund = orderService.addPayment(order.id, { amountCents: -20000, note: '交付后退款' })
    expect(refund.amount_cents).toBe(-20000)
    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(30000)
  })

  it('TC-PAY-10: 路由层 cancelled/delivered 正数收款 → 400 PAYMENT_STATUS_BLOCKED', async () => {
    const artist = seedArtist({ qq_number: '88110', subdomain: 'pay10' })
    const cancelled = seedOrder(artist.id, { status: 'cancelled' })
    db.prepare('UPDATE orders SET paid_total_cents = 30000 WHERE id = ?').run(cancelled.id)
    const delivered = seedOrder(artist.id, { status: 'delivered' })
    db.prepare('UPDATE orders SET paid_total_cents = 50000 WHERE id = ?').run(delivered.id)
    const app = await buildApp({ logger: false })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: 'Bearer ' + token }

    const r1 = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${cancelled.id}/payments`,
      headers,
      payload: { amountCents: 10000, note: '补收' }
    })
    expect(r1.statusCode).toBe(400)
    expect(r1.json().code).toBe('PAYMENT_STATUS_BLOCKED')

    const r2 = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${delivered.id}/payments`,
      headers,
      payload: { amountCents: 10000, note: '交付后补收' }
    })
    expect(r2.statusCode).toBe(400)
    expect(r2.json().code).toBe('PAYMENT_STATUS_BLOCKED')
    await app.close()
  })

  // ─── v0.36 BUG-1 方案 b: getOrderInstallments 池子推算 ───

  /** 辅助：建订单 + 手动插入节点（金额直设，不走比例重算），返回订单行 */
  function seedOrderWithInstallments(qq, subdomain, insts, totalCents) {
    const artist = seedArtist({ qq_number: qq, subdomain })
    const order = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = ?, final_price_cents = ? WHERE id = ?')
      .run(totalCents, totalCents, order.id)
    const insert = db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    insts.forEach(([name, amt], i) => insert.run(order.id, name, 0, amt, i + 1))
    return order
  }

  it('TC-INST-01: 全款覆盖全部节点 → 全部 paid', () => {
    const order = seedOrderWithInstallments('88110', 'inst1',
      [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000)

    orderService.addPayment(order.id, { amountCents: 50000, note: '全款' })
    const result = orderService.getOrderInstallments(order.id)

    expect(result.map(r => r.status)).toEqual(['paid', 'paid', 'paid'])
    expect(result.map(r => r.paidCents)).toEqual([10000, 20000, 20000])
    expect(result.every(r => r.remainingCents === 0)).toBe(true)
  })

  it('TC-INST-02: 部分覆盖跨节点——paid/partial/pending 三态 + 返回结构不变', () => {
    const order = seedOrderWithInstallments('88111', 'inst2',
      [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000)

    orderService.addPayment(order.id, { amountCents: 25000, note: '部分收款' })
    const result = orderService.getOrderInstallments(order.id)

    expect(result[0]).toMatchObject({ name: '定金', amountCents: 10000, paidCents: 10000, remainingCents: 0, status: 'paid' })
    expect(result[1]).toMatchObject({ name: '中期', amountCents: 20000, paidCents: 15000, remainingCents: 5000, status: 'partial' })
    expect(result[2]).toMatchObject({ name: '尾款', amountCents: 20000, paidCents: 0, remainingCents: 20000, status: 'pending' })
    // REQ-036 批B (02F 遗留闭环): 返回结构 = 八字段，新增 locked/lockedReason（前端批A 渲染「已锁定」标识）
    for (const r of result) {
      expect(Object.keys(r).sort()).toEqual(['amountCents', 'id', 'locked', 'lockedReason', 'name', 'paidCents', 'remainingCents', 'status'])
      expect(typeof r.id).toBe('number')
      expect(typeof r.locked).toBe('boolean')
      expect(r.lockedReason === null || typeof r.lockedReason === 'string').toBe(true)
    }
  })

  it('TC-INST-03: 撤销回冲——负流水后节点状态自动回退', () => {
    const order = seedOrderWithInstallments('88112', 'inst3',
      [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000)

    orderService.addPayment(order.id, { amountCents: 50000, note: '全款' })
    expect(orderService.getOrderInstallments(order.id).map(r => r.status)).toEqual(['paid', 'paid', 'paid'])

    // 撤销 30000 → paid_total_cents=20000 → 推算自动回退
    orderService.addPayment(order.id, { amountCents: -30000, note: '客户退款' })
    const result = orderService.getOrderInstallments(order.id)
    expect(result[0]).toMatchObject({ status: 'paid', paidCents: 10000 })
    expect(result[1]).toMatchObject({ status: 'partial', paidCents: 10000 })
    expect(result[2]).toMatchObject({ status: 'pending', paidCents: 0 })
  })

  it('TC-INST-04: 多付溢出——paidCents 封顶节点金额', () => {
    const order = seedOrderWithInstallments('88113', 'inst4',
      [['定金', 10000], ['尾款', 40000]], 50000)

    orderService.addPayment(order.id, { amountCents: 60000, note: '多付' })
    const result = orderService.getOrderInstallments(order.id)

    expect(result.map(r => r.status)).toEqual(['paid', 'paid'])
    // 多付的 10000 不摊进节点：paidCents 封顶 amountCents，remainingCents 不为负
    expect(result.map(r => r.paidCents)).toEqual([10000, 40000])
    expect(result.every(r => r.remainingCents === 0)).toBe(true)
  })

  it('TC-INST-05: 单节点订单——partial 到 paid', () => {
    const order = seedOrderWithInstallments('88114', 'inst5', [['全款', 50000]], 50000)

    orderService.addPayment(order.id, { amountCents: 20000, note: '部分收款' })
    let result = orderService.getOrderInstallments(order.id)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ status: 'partial', paidCents: 20000, remainingCents: 30000 })

    orderService.addPayment(order.id, { amountCents: 30000, note: '尾款' })
    result = orderService.getOrderInstallments(order.id)
    expect(result[0]).toMatchObject({ status: 'paid', paidCents: 50000, remainingCents: 0 })
  })

  // P2 多收：前端放开正数上限后，累计多收场景的节点推算保障
  it('TC-INST-06: 多收——累计超收后全节点 paid、无负数，退款后回退正确', () => {
    const order = seedOrderWithInstallments('88115', 'inst6',
      [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000)

    // 分两笔多收：30000 + 30000 = 60000 > 应收 50000（多收 10000）
    orderService.addPayment(order.id, { amountCents: 30000, note: '第一笔' })
    orderService.addPayment(order.id, { amountCents: 30000, note: '客户多付' })

    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(60000)

    const result = orderService.getOrderInstallments(order.id)
    // 全节点 paid；paidCents 封顶节点金额，多收不摊入；无负数
    expect(result.map(r => r.status)).toEqual(['paid', 'paid', 'paid'])
    expect(result.map(r => r.paidCents)).toEqual([10000, 20000, 20000])
    expect(result.every(r => r.remainingCents === 0)).toBe(true)

    // 退回多收部分：-20000 → paid_total=40000，节点自动回退（尾款 partial）
    orderService.addPayment(order.id, { amountCents: -20000, note: '退回多收部分' })
    const after = orderService.getOrderInstallments(order.id)
    expect(after.map(r => r.status)).toEqual(['paid', 'paid', 'partial'])
    expect(after[2]).toMatchObject({ paidCents: 10000, remainingCents: 10000 })
  })

  // 2-1（审计 二#1）: 收款后大幅降价——尾款被 R8 压成负价时，
  // 节点级已付/待付推导必须与引擎视图 readInstallmentState 同口径（封顶 + 钳制），不得出现负数
  it('TC-INST-07: 收款后大幅降价 → 节点级已付/待付不出现负数（2-1）', () => {
    const artist = seedArtist({ qq_number: '88116', subdomain: 'inst7' })
    db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, 1, 1, 3000)')
      .run(artist.id, '定金')
    db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, 2, 1, 7000)')
      .run(artist.id, '尾款')
    const order = seedOrder(artist.id, { order_no: 'INST-007' })
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)
    orderService.generateInstallmentsForOrder(order.id)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)')
      .run(order.id, 'base', 50000, 'system')

    // 收 30000（定金 15000 付清即锁）→ 降价到 10000：delta −40000 全摊未锁尾款 → 尾款 −5000
    orderService.addPayment(order.id, { amountCents: 30000, note: '定金+部分' })
    orderService.updateFinalPrice(order.id, 10000)

    const insts = orderService.getOrderInstallments(order.id)
    expect(insts.map(i => i.amountCents)).toEqual([15000, -5000])
    // 已收封顶到 Σ节点价（10000）后顺序填充：定金收满 10000（partial）、负价尾款视为已结清
    expect(insts.map(i => i.paidCents)).toEqual([10000, 0])
    expect(insts.map(i => i.remainingCents)).toEqual([5000, 0])
    expect(insts.map(i => i.status)).toEqual(['partial', 'paid'])
    expect(insts.every(i => i.paidCents >= 0 && i.remainingCents >= 0)).toBe(true)
  })

  // ─── 话术变量修复（T3 BUG） ───

  it('TC-SPEECH-01: {已付} 读 paid_total_cents 而非 SUM installments', async () => {
    const { replaceSpeechVars } = await import('../src/features/order/order-workflow.service.js')
    const fakeOrder = {
      id: 1,
      client_name: '测试客户',
      client_qq: '12345',
      order_no: 'T-001',
      deadline: null,
      final_price_cents: 50000,
      total_price_cents: 50000,
      paid_total_cents: 30000
    }
    const result = replaceSpeechVars('{客户名}，已付{已付}，待付{待付}', fakeOrder, '线稿')
    expect(result).toBe('测试客户，已付¥300，待付¥200')
  })

  // ─── REQ-025 第二阶段：recalcInstallmentAmounts 退役后的节点联动语义 ───

  it('TC-ADJ-01: addExtraItem 后 delta 全摊未锁节点（引擎语义，替代 recalc 按比例重算）', () => {
    const artist = seedArtist({ qq_number: '88107', subdomain: 'adj1' })
    const order = seedOrder(artist.id, {
      status: 'confirmed'
    })
    // seedOrder 不含 total_price_cents 列，手动设置
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)
    // 手动插入一个 installment（30% 比例，未锁）
    db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(order.id, '定金', 3000, 15000, 1)

    // 添加附加项（+5000 → 总价 55000）
    orderService.addExtraItem(order.id, { name: '加急', priceCents: 5000 })

    // REQ-025 R5: delta 按未锁节点原始比例归一化分摊——唯一未锁节点得 100% delta
    //（旧 recalc 语义为按绝对比例重算 55000×30%=16500，已退役）
    const inst = db.prepare('SELECT amount_cents FROM order_payment_installments WHERE order_id = ?').get(order.id)
    expect(inst.amount_cents).toBe(20000)

    // final_price_cents 已更新
    const fresh = orderService.getOrder(order.id)
    expect(fresh.final_price_cents).toBe(55000)
  })

  // ─── BUG-4 语义回归：初始分配尾差归末节点（现由引擎 allocateInitial 承接，经 generateInstallmentsForOrder） ───

  it('TC-ADJ-02: generateInstallmentsForOrder 尾差归末节点，节点之和恒等于总价（BUG-4 语义回归）', () => {
    const artist = seedArtist({ qq_number: '88108', subdomain: 'adj2' })
    seedArtistStages(artist.id) // 默认模板收款节点 3000 + 7000（Σbp=100%）
    // 带舍入漂移的总价：10001 分
    const order = seedOrder(artist.id, { status: 'confirmed' })
    db.prepare('UPDATE orders SET total_price_cents = 10001, final_price_cents = 10001 WHERE id = ?').run(order.id)

    orderService.generateInstallmentsForOrder(order.id)

    const rows = db.prepare(
      'SELECT amount_cents FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
    ).all(order.id)
    // 首节点独立四舍五入：round(10001×3000/10000) = round(3000.3) = 3000
    expect(rows[0].amount_cents).toBe(3000)
    // 末节点 = 总价 − 首节点，吸收尾差（不再各自 round 产生漂移）
    expect(rows[1].amount_cents).toBe(7001)
    const sum = rows.reduce((s, r) => s + r.amount_cents, 0)
    expect(sum).toBe(10001)
  })

  it('TC-ADJ-03: 单收款节点 30%（Σbp≠100%）初始分配按 30% 算（引擎 allocateInitial 语义回归）', () => {
    const artist = seedArtist({ qq_number: '88109', subdomain: 'adj3' })
    // 直插单收款节点 30%（绕过工作流编辑 API 的 SUM_NOT_100 校验，模拟非常规配置）
    db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
    ).run(artist.id, '定金', 1, 1, 3000)
    const order = seedOrder(artist.id, { status: 'confirmed' })
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    orderService.generateInstallmentsForOrder(order.id)

    // 单节点 30%：ratioTotal = round(50000×3000/10000) = 15000，不是订单全额
    const inst = db.prepare('SELECT amount_cents FROM order_payment_installments WHERE order_id = ?').get(order.id)
    expect(inst.amount_cents).toBe(15000)
  })
})
