// DSK-11 回归：「导入我的价格」档位聚合必须剔除 price=0 的草稿，均价不被系统性拉低。
// 聚合口径抽成 PriceCardTool.vue 普通 <script> 块的纯函数 aggregateImportTiers（与 shared/PriceCard.vue
// 同款命名导出做法），此处直接导入断言，不必挂载哑组件。
import { describe, it, expect } from 'vitest'
import { aggregateImportTiers } from '../views/tools/PriceCardTool.vue'
import type { LocalOrder, LocalOrderStatus } from '../stores/localLedger'

/** 造一行本地记账（默认已收款，按需覆写） */
function mk(over: Partial<LocalOrder> & { title: string; price: number }): LocalOrder {
  return {
    id: 0,
    client_name: '客户',
    title: over.title,
    price: over.price,
    deadline: null,
    status: (over.status ?? 'paid') as LocalOrderStatus,
    created_at: '',
    updated_at: ''
  }
}

describe('DSK-11：导入价格聚合剔除 0 元草稿，均价不被拉低', () => {
  it('price=0 的草稿不进均价分母（核心缺陷场景）', () => {
    const tiers = aggregateImportTiers([
      mk({ title: '头像', price: 100, status: 'paid' }),
      mk({ title: '头像', price: 0, status: 'draft' }),   // 草稿金额留空即 0
      mk({ title: '头像', price: 200, status: 'delivered' })
    ])
    expect(tiers).toHaveLength(1)
    // 修复前 = (100+0+200)/3 = 100（被草稿拉低）；修复后 = (100+200)/2 = 150
    expect(tiers[0].priceYuan).toBe(150)
    // 均价笔数口径也只算有实价的 2 笔
    expect(tiers[0].note).toContain('2 笔')
    expect(tiers[0].group).toBe('本地记账')
  })

  it('整组全是 0 元草稿 → 不产出档位（而非产出 0 元档）', () => {
    const tiers = aggregateImportTiers([
      mk({ title: '头像', price: 0, status: 'draft' }),
      mk({ title: '半身', price: 0, status: 'draft' })
    ])
    expect(tiers).toEqual([])
  })

  it('负值 / NaN 价同样不进分母（price>0 口径兜住脏数据）', () => {
    const tiers = aggregateImportTiers([
      mk({ title: '头像', price: 300, status: 'paid' }),
      mk({ title: '头像', price: -50, status: 'draft' }),
      mk({ title: '头像', price: Number.NaN, status: 'draft' })
    ])
    expect(tiers).toHaveLength(1)
    expect(tiers[0].priceYuan).toBe(300)
  })

  it('空 title 不进聚合（与 price 过滤叠加）', () => {
    const tiers = aggregateImportTiers([
      mk({ title: '   ', price: 500, status: 'paid' }),
      mk({ title: '全身', price: 400, status: 'paid' })
    ])
    expect(tiers).toHaveLength(1)
    expect(tiers[0].name).toBe('全身')
  })

  it('多档位分组均价各自独立、按出现顺序保留', () => {
    const tiers = aggregateImportTiers([
      mk({ title: '头像', price: 100, status: 'paid' }),
      mk({ title: '全身', price: 500, status: 'paid' }),
      mk({ title: '头像', price: 200, status: 'paid' }),
      mk({ title: '全身', price: 0, status: 'draft' })   // 全身组的 0 元草稿被剔
    ])
    expect(tiers.map(t => t.name)).toEqual(['头像', '全身'])
    expect(tiers[0].priceYuan).toBe(150) // (100+200)/2
    expect(tiers[1].priceYuan).toBe(500) // 仅 1 笔有价
  })

  it('档位上限 12（超出截断），名称超 24 字截断', () => {
    const many = Array.from({ length: 14 }, (_, i) => mk({ title: `档${i + 1}`, price: 100 + i, status: 'paid' }))
    const tiers = aggregateImportTiers(many)
    expect(tiers).toHaveLength(12)

    const longName = aggregateImportTiers([mk({ title: '这是一个非常非常非常非常长的委托内容标题', price: 100, status: 'paid' })])
    expect(longName[0].name.length).toBeLessThanOrEqual(24)
  })
})
