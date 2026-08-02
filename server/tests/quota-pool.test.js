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

  // ─── 分期状态推算 ───

  it('TC-INST-01: 三态推算（paid/partial/pending）', () => {
    const result = orderService.computeInstallmentStatuses(
      [
        { name: '定金', amountCents: 10000 },
        { name: '中期', amountCents: 20000 },
        { name: '尾款', amountCents: 20000 }
      ],
      25000
    )
    expect(result[0]).toEqual({ name: '定金', amountCents: 10000, status: 'paid', paidCents: 10000 })
    expect(result[1]).toEqual({ name: '中期', amountCents: 20000, status: 'partial', paidCents: 15000 })
    expect(result[2]).toEqual({ name: '尾款', amountCents: 20000, status: 'pending', paidCents: 0 })
  })

  it('TC-INST-02: 全款覆盖', () => {
    const result = orderService.computeInstallmentStatuses(
      [
        { name: '定金', amountCents: 10000 },
        { name: '尾款', amountCents: 40000 }
      ],
      50000
    )
    expect(result[0].status).toBe('paid')
    expect(result[1].status).toBe('paid')
  })

  it('TC-INST-03: 零已付全 pending', () => {
    const result = orderService.computeInstallmentStatuses(
      [{ name: '定金', amountCents: 10000 }],
      0
    )
    expect(result[0].status).toBe('pending')
    expect(result[0].paidCents).toBe(0)
  })

  it('TC-INST-04: 多付（paid_total > 总额）', () => {
    const result = orderService.computeInstallmentStatuses(
      [{ name: '全款', amountCents: 50000 }],
      60000
    )
    expect(result[0].status).toBe('paid')
    expect(result[0].paidCents).toBe(50000)
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
})
