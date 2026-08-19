import { describe, it, expect } from 'vitest'
import { resolvePriceCents, PRICE_FALLBACK_SQL } from '../src/utils/price.js'

// ============================================
// 价格工具函数测试（技术债 B3）
// 价格回退链：final_price_cents → total_price_cents → price_snapshot×100
// ============================================

describe('价格工具 (utils/price.ts)', () => {

  it('TC-PU-01: resolvePriceCents 优先 final_price_cents', () => {
    const order = { final_price_cents: 50000, total_price_cents: 40000, price_snapshot: 300 }
    expect(resolvePriceCents(order)).toBe(50000)
  })

  it('TC-PU-02: resolvePriceCents 回退 total_price_cents', () => {
    const order = { final_price_cents: null, total_price_cents: 40000, price_snapshot: 300 }
    expect(resolvePriceCents(order)).toBe(40000)
  })

  it('TC-PU-03: resolvePriceCents 回退 price_snapshot×100', () => {
    const order = { final_price_cents: null, total_price_cents: null, price_snapshot: 300.5 }
    expect(resolvePriceCents(order)).toBe(30050)
  })

  it('TC-PU-04: resolvePriceCents 三级均 null 返回 null', () => {
    const order = { final_price_cents: null, total_price_cents: null, price_snapshot: null }
    expect(resolvePriceCents(order)).toBeNull()
  })

  it('TC-PU-05: resolvePriceCents 字段缺失（undefined）返回 null', () => {
    const order = {}
    expect(resolvePriceCents(order)).toBeNull()
  })

  it('TC-PU-06: PRICE_FALLBACK_SQL 是合法 SQL CASE 表达式', () => {
    expect(PRICE_FALLBACK_SQL).toContain('CASE')
    expect(PRICE_FALLBACK_SQL).toContain('final_price_cents')
    expect(PRICE_FALLBACK_SQL).toContain('total_price_cents')
    expect(PRICE_FALLBACK_SQL).toContain('price_snapshot')
  })
})
