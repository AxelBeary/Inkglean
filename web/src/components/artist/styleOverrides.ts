// 画风管理 · 尺寸覆盖（style_size × style_addon）批量结果 → 组件内 `size._overrides` 形状
// 纯函数零副作用：GET /artist/art-styles/overrides 一次取全量，本函数只做分组与 is_hidden 归一

import type { SizeAddonOverrideBatchItem } from '../../api/types'

/** 单个尺寸的覆盖表：内层 key = style_addon_id（与 ManagerSizeRow._overrides 同形） */
export type SizeOverrideGroup = Record<number, { price_override: number | null; is_hidden: boolean }>

/**
 * 批量覆盖分组：外层 key = style_size_id，内层 key = style_addon_id。
 * `is_hidden` 后端返 0/1（snake_case 原样），此处统一归一为 boolean，消费方无需再判真假。
 * 空数组 → 空 Map（调用方据此把各尺寸的 _overrides 初始化为 `{}`）。
 */
export function groupSizeOverrides(items: SizeAddonOverrideBatchItem[]): Map<number, SizeOverrideGroup> {
  const grouped = new Map<number, SizeOverrideGroup>()
  for (const item of items) {
    let group = grouped.get(item.style_size_id)
    if (!group) {
      group = {}
      grouped.set(item.style_size_id, group)
    }
    group[item.style_addon_id] = { price_override: item.price_override, is_hidden: !!item.is_hidden }
  }
  return grouped
}
