// N×M 覆盖批量批：groupSizeOverrides 纯函数（GET /artist/art-styles/overrides 结果 → size._overrides 形状）
// 覆盖：分组、同 size 多 addon、不同 size 隔离、is_hidden 0/1 归一、空数组
import { describe, it, expect } from 'vitest'
import { groupSizeOverrides } from '../styleOverrides'
import type { SizeAddonOverrideBatchItem } from '../../../api/types'

function buildItem(partial: Partial<SizeAddonOverrideBatchItem> & { style_size_id: number; style_addon_id: number }): SizeAddonOverrideBatchItem {
  return {
    id: partial.style_size_id * 100 + partial.style_addon_id,
    price_override: null,
    is_hidden: 0,
    style_id: 1,
    ...partial
  }
}

describe('groupSizeOverrides：批量覆盖分组', () => {
  it('空数组 → 空 Map（调用方据此把各尺寸 _overrides 初始化为 {}）', () => {
    const grouped = groupSizeOverrides([])
    expect(grouped.size).toBe(0)
    expect(grouped.get(1)).toBeUndefined()
  })

  it('同 size 多 addon → 落进同一外层条目，内层 key = style_addon_id', () => {
    const grouped = groupSizeOverrides([
      buildItem({ style_size_id: 11, style_addon_id: 101, price_override: 30, is_hidden: 0 }),
      buildItem({ style_size_id: 11, style_addon_id: 102, price_override: null, is_hidden: 1 })
    ])
    expect(grouped.size).toBe(1)
    expect(grouped.get(11)).toEqual({
      101: { price_override: 30, is_hidden: false },
      102: { price_override: null, is_hidden: true }
    })
  })

  it('不同 size 互相隔离（同名 addon 各自独立，不串组）', () => {
    const grouped = groupSizeOverrides([
      buildItem({ style_size_id: 11, style_addon_id: 101, price_override: 30, is_hidden: 0 }),
      buildItem({ style_size_id: 12, style_addon_id: 101, price_override: 45, is_hidden: 1 }),
      buildItem({ style_size_id: 12, style_addon_id: 103, price_override: null, is_hidden: 0 })
    ])
    expect(grouped.size).toBe(2)
    expect(grouped.get(11)).toEqual({ 101: { price_override: 30, is_hidden: false } })
    expect(grouped.get(12)).toEqual({
      101: { price_override: 45, is_hidden: true },
      103: { price_override: null, is_hidden: false }
    })
    // 内层对象互不共享引用
    expect(grouped.get(11)).not.toBe(grouped.get(12))
  })

  it('is_hidden 后端 0/1 归一为 boolean（0→false，1→true）', () => {
    const grouped = groupSizeOverrides([
      buildItem({ style_size_id: 11, style_addon_id: 101, is_hidden: 0 }),
      buildItem({ style_size_id: 11, style_addon_id: 102, is_hidden: 1 })
    ])
    const row = grouped.get(11)!
    expect(row[101].is_hidden).toBe(false)
    expect(row[102].is_hidden).toBe(true)
    expect(typeof row[101].is_hidden).toBe('boolean')
    expect(typeof row[102].is_hidden).toBe('boolean')
  })

  it('price_override 原样保留（含 0 与 null，不做 0 值兜底）', () => {
    const grouped = groupSizeOverrides([
      buildItem({ style_size_id: 11, style_addon_id: 101, price_override: 0 }),
      buildItem({ style_size_id: 11, style_addon_id: 102, price_override: null })
    ])
    const row = grouped.get(11)!
    expect(row[101].price_override).toBe(0)
    expect(row[102].price_override).toBe(null)
  })

  it('同 size + 同 addon 重复项 → 后者覆盖前者（后端不应出现，仅保证确定行为）', () => {
    const grouped = groupSizeOverrides([
      buildItem({ style_size_id: 11, style_addon_id: 101, price_override: 30, is_hidden: 0 }),
      buildItem({ style_size_id: 11, style_addon_id: 101, price_override: 50, is_hidden: 1 })
    ])
    expect(grouped.get(11)).toEqual({ 101: { price_override: 50, is_hidden: true } })
  })
})
