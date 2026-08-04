import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'

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

    expect(() => {
      orderService.addPayment(order.id, { amountCents: -20000, note: '超额撤销' })
    }).toThrow()

    // paid_total_cents 不变
    const fresh = orderService.getOrder(order.id)
    expect(fresh.paid_total_cents).toBe(10000)
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
    // 返回结构严格不变：六字段，调用方（order.routes/admin.routes/前端）零改动
    for (const r of result) {
      expect(Object.keys(r).sort()).toEqual(['amountCents', 'id', 'name', 'paidCents', 'remainingCents', 'status'])
      expect(typeof r.id).toBe('number')
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

  // ─── v0.31 F4: 加钱后节点应收联动 ───

  it('TC-ADJ-01: addExtraItem 后 recalcInstallmentAmounts 按比列重算节点应收', () => {
    const artist = seedArtist({ qq_number: '88107', subdomain: 'adj1' })
    const order = seedOrder(artist.id, {
      status: 'confirmed'
    })
    // seedOrder 不含 total_price_cents 列，手动设置
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)
    // 手动插入一个 installment（30% 比例）
    db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(order.id, '定金', 3000, 15000, 1)

    // 添加附加项（+5000 → 总价 55000）
    orderService.addExtraItem(order.id, { name: '加急', priceCents: 5000 })

    // v0.31 F4: 节点应收按 basis_points 比例重算（55000 × 30% = 16500）
    const inst = db.prepare('SELECT amount_cents FROM order_payment_installments WHERE order_id = ?').get(order.id)
    expect(inst.amount_cents).toBe(16500)

    // final_price_cents 已更新
    const fresh = orderService.getOrder(order.id)
    expect(fresh.final_price_cents).toBe(55000)
  })

  // ─── BUG-4: 分期金额舍入尾差归末节点 ───

  it('TC-ADJ-02: recalcInstallmentAmounts 尾差归末节点，节点之和恒等于按比例总额（BUG-4）', () => {
    const artist = seedArtist({ qq_number: '88108', subdomain: 'adj2' })
    const order = seedOrder(artist.id, { status: 'confirmed' })
    db.prepare('UPDATE orders SET total_price_cents = 10000, final_price_cents = 10000 WHERE id = ?').run(order.id)
    // 三节点各 3333bp（合计 9999bp = 99.99%）——原版各自 Math.round 会产生 ±分漂移
    const insert = db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    insert.run(order.id, '一期', 3333, 0, 1)
    insert.run(order.id, '二期', 3333, 0, 2)
    insert.run(order.id, '尾款', 3333, 0, 3)

    orderService.recalcInstallmentAmounts(order.id)

    const rows = db.prepare(
      'SELECT amount_cents FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
    ).all(order.id)
    // 前两个独立四舍五入：10000×3333/10000 = 3333
    expect(rows[0].amount_cents).toBe(3333)
    expect(rows[1].amount_cents).toBe(3333)
    // 末节点 = 按比例总额(round(10000×9999/10000)=9999) − 3333 − 3333 = 3333，吸收尾差
    expect(rows[2].amount_cents).toBe(3333)
    // 节点之和恒等于按比例总额，无漂移
    const sum = rows.reduce((s, r) => s + r.amount_cents, 0)
    expect(sum).toBe(9999)
  })

  it('TC-ADJ-03: 单节点重算不受 BUG-4 修复影响（比例≠100% 场景）', () => {
    const artist = seedArtist({ qq_number: '88109', subdomain: 'adj3' })
    const order = seedOrder(artist.id, { status: 'confirmed' })
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)
    db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(order.id, '定金', 3000, 0, 1)

    orderService.recalcInstallmentAmounts(order.id)

    // 单节点 30%：末节点=按比例总额（50000×30%=15000），不是订单全额
    const inst = db.prepare('SELECT amount_cents FROM order_payment_installments WHERE order_id = ?').get(order.id)
    expect(inst.amount_cents).toBe(15000)
  })
})
