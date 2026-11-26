// 小票计算口径纯函数测试（oimimo 吸纳批五）——shared-824 自 web 侧 receipt.test.ts 搬迁
// 断言口径不变：赠品计 0 / 折扣钳制 / 定金尾款 / 折与百分号文案
import { describe, it, expect } from 'vitest'
import { clampQty, computeReceiptTotals, discountLabel, validItems, MAX_ITEM_QTY } from '../receipt/totals'
import type { ReceiptItemLike } from '../receipt/totals'

function item(name: string, qty: number, priceYuan: number | null, gift = false): ReceiptItemLike {
  return { name, qty, priceYuan, gift }
}

describe('receipt 计算口径（shared 事实源）', () => {
  it('小计 = 数量×单价，赠品计 0，无效行不进', () => {
    const items = [item('头像', 2, 100), item('贴纸', 1, null, true), item('', 1, 50), item('立绘', 0, 600)]
    const t = computeReceiptTotals(items, 'none', 0, null)
    expect(t.subtotalCents).toBe(20000) // 只有头像 2×100 有效
  })

  it('打折：90 = 九折（折扣金额 = 小计 10%）', () => {
    const t = computeReceiptTotals([item('头像', 1, 100)], 'percent', 90, null)
    expect(t.subtotalCents).toBe(10000)
    expect(t.discountCents).toBe(1000)
    expect(t.totalCents).toBe(9000)
  })

  it('直减钳制：不超过小计，应收不变负', () => {
    const t = computeReceiptTotals([item('头像', 1, 100)], 'amount', 999, null)
    expect(t.discountCents).toBe(10000)
    expect(t.totalCents).toBe(0)
  })

  it('定金 → 尾款 = 应收 - 定金（下限 0）', () => {
    const t = computeReceiptTotals([item('头像', 1, 100)], 'none', 0, 30)
    expect(t.depositCents).toBe(3000)
    expect(t.balanceCents).toBe(7000)
    const over = computeReceiptTotals([item('头像', 1, 100)], 'none', 0, 200)
    expect(over.balanceCents).toBe(0)
  })

  it('百分比越界钳制：>100 按 100（原价），负数按 0（全免）', () => {
    expect(computeReceiptTotals([item('a', 1, 100)], 'percent', 150, null).totalCents).toBe(10000)
    expect(computeReceiptTotals([item('a', 1, 100)], 'percent', -20, null).totalCents).toBe(0)
  })

  it('validItems：赠品无需价格，非赠品需正价', () => {
    expect(validItems([item('赠', 1, null, true)])).toHaveLength(1)
    expect(validItems([item('无价', 1, null)])).toHaveLength(0)
    expect(validItems([item('零价', 1, 0)])).toHaveLength(0)
  })

  it('discountLabel 中英形态（折 / 百分号文案）', () => {
    expect(discountLabel('percent', 90, 'zh-CN')).toBe('9 折')
    expect(discountLabel('percent', 90, 'en')).toBe('10% off')
    expect(discountLabel('amount', 50, 'zh-CN')).toContain('-')
    expect(discountLabel('none', 0, 'zh-CN')).toBe('')
  })

  // GHSA Wave2 issue #51-1：数量未取整会算出半分（100.01 元 × 1.5 = 15001.5 分），
  // 而 ReceiptPrinter 载入草稿时又会 floor 成 1 → 同一张票刷新前后金额跳变
  it('数量按整数计：1.5 件按 1 件算，小计不出现半分', () => {
    expect(computeReceiptTotals([item('a', 1.5, 100.01)], 'none', 0, null).subtotalCents).toBe(10001)
    expect(computeReceiptTotals([item('a', 0.5, 100)], 'none', 0, null).subtotalCents).toBe(0)
  })

  // issue #51-2：直减超过小计时实扣已钳到小计，文案仍写原值 → 同一行出现「-999.00 -¥100.00」
  it('discountLabel amount 形态与实扣同源（钳制后的分）', () => {
    const t = computeReceiptTotals([item('a', 1, 100)], 'amount', 999, null)
    expect(t.discountCents).toBe(10000)
    expect(discountLabel('amount', 999, 'zh-CN', t.discountCents)).toBe('-100.00')
    expect(discountLabel('amount', 50, 'zh-CN', 5000)).toBe('-50.00')
  })

  // X1：输入框可键入 150，而载入草稿原先钳到 99 → 刷新前后金额跳变。上限收敛到 MAX_ITEM_QTY 后两处同值
  it('数量上限 99：超限按 99 计，与草稿回灌口径一致', () => {
    expect(computeReceiptTotals([item('a', 150, 100)], 'none', 0, null).subtotalCents).toBe(990000)
    expect(clampQty(150)).toBe(MAX_ITEM_QTY)
    expect(clampQty(99)).toBe(99)
  })

  // X2：清空折扣输入框时 v-model.number 得到 '' → 兜底必须按原价，否则整单静默变 ¥0
  it('percent 非有限值（含清空）兜底按原价，不得把整单打成 0 元', () => {
    const t = computeReceiptTotals([item('a', 1, 100)], 'percent', Number.NaN, null)
    expect(t.totalCents).toBe(10000)
    expect(t.discountCents).toBe(0)
  })
})
