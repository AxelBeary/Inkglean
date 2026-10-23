// 审计 #21 条目 6：极小金额 + 多分期时，前 N-1 节点的 round 溢出把尾款写成负数
// 修复口径：allocateInitial 把每个非尾款节点钳到剩余额度内，Σ 仍 ≡ ratioTotal（守恒 A1 不变），
// 但初始分期计划里不再出现「未收款却为负」的尾款。
import { describe, it, expect } from 'vitest'
import { allocateInitial, type EngineInstallment } from '../src/features/pricing/pricing-engine.js'

function nodes(basisPointsList: number[]): EngineInstallment[] {
  return basisPointsList.map((bp, i) => ({ sortOrder: i, basisPoints: bp, amountCents: 0 }))
}

describe('allocateInitial 舍入不产生负尾款（#21-6）', () => {
  it('TC-AIR-01: 20 个 500bp 节点 × 总价 10 分 → 无负节点且 Σ ≡ 10', () => {
    const amounts = allocateInitial(nodes(Array.from({ length: 20 }, () => 500)), 10)

    const sum = amounts.reduce((s, v) => s + v, 0)
    expect(sum).toBe(10)
    expect(Math.min(...amounts)).toBeGreaterThanOrEqual(0)
    // 旧口径：前 19 个各 round(0.5)=1 吃掉 19 分，末节点 = 10 − 19 = −9
    expect(amounts[amounts.length - 1]).toBe(0)
    // 待收合计不再超过订单总价（每节点至多 1 分，且只摊到 10 分为止）
    expect(amounts.filter(v => v > 0).length).toBe(10)
    expect(amounts.every(v => v <= 1)).toBe(true)
  })

  it('TC-AIR-02: 常规比例与总价完全不变（钳制只在溢出时生效）', () => {
    expect(allocateInitial(nodes([1000, 4000, 3000, 2000]), 30000)).toEqual([3000, 12000, 9000, 6000])
    expect(allocateInitial(nodes([1000, 4000, 3000, 2000]), 19500)).toEqual([1950, 7800, 5850, 3900])
  })

  it('TC-AIR-03: 比例和≠100%（案例 10）语义不变，末节点仍吸收 ratioTotal 尾差', () => {
    expect(allocateInitial(nodes([3000]), 10001)).toEqual([3000])
    // ratioTotal = round(10003×6000/10000) = 6002；首 = round(3000.9) = 3001；末 = 3001
    expect(allocateInitial(nodes([3000, 3000]), 10003)).toEqual([3001, 3001])
  })

  it('TC-AIR-04: 多组形状下 Σ ≡ ratioTotal 且无节点为负', () => {
    const shapes: Array<{ bps: number[]; total: number }> = [
      { bps: [500, 500, 500, 500, 500, 500, 500, 500], total: 3 },
      { bps: [3333, 3333, 3334], total: 7 },
      { bps: [1, 1, 1, 1, 1], total: 100 },
      { bps: [2500, 2500, 2500, 2500], total: 1 },
      { bps: [9999, 1], total: 999999 }
    ]

    for (const { bps, total } of shapes) {
      const amounts = allocateInitial(nodes(bps), total)
      const ratioTotal = Math.round((total * bps.reduce((s, v) => s + v, 0)) / 10000)
      expect(amounts.reduce((s, v) => s + v, 0), `Σ for ${bps.length}×${total}`).toBe(ratioTotal)
      expect(Math.min(...amounts), `min for ${bps.length}×${total}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('TC-AIR-05: 单节点与空节点入参边界不回归', () => {
    expect(allocateInitial([], 5000)).toEqual([])
    expect(allocateInitial(nodes([10000]), 5000)).toEqual([5000])
  })
})
