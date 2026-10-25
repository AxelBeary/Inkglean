// issue-51 拆分批：档位筛选/分组纯函数（原住 PriceCard.vue <script setup>）
// 纯拆搬零改动：判定口径原样——filled = 名称非空 且 价格非空 且 >0
// （拍3-A：0 元视为非法输入，不计入已填档位；编辑区行内提示由组件层负责）
import type { PriceCardTier, TierGroup } from './types'

/** 已填档位：名称非空 + 价格为正数（0/负数/空一律按未填，见拍3-A） */
export function filledTiers(tiers: PriceCardTier[]): PriceCardTier[] {
  return tiers.filter((td) => td.name.trim() && td.priceYuan != null && Number(td.priceYuan) > 0)
}

/** 档位分组（保持首次出现顺序；空组名渲染时回落「未分组」） */
export function tierGroups(tiers: PriceCardTier[]): TierGroup[] {
  const order: string[] = []
  const map = new Map<string, PriceCardTier[]>()
  for (const tier of filledTiers(tiers)) {
    const g = tier.group.trim()
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(tier)
  }
  return order.map(name => ({ name, tiers: map.get(name)! }))
}
