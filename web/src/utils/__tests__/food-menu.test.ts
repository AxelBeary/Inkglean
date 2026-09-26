// 「今天吃什么」菜谱库数据完整性校验（2026-09-25 扩建批配套防阀）
// 纯数据文件无逻辑，用单测机械守住合并后的不变量：菜名唯一 / tag 合法 / 池子下限
import { describe, it, expect } from 'vitest'
import { FOOD_MENU, FOOD_CATEGORIES } from '../../utils/food-menu'

const VALID_TAGS = Object.keys(FOOD_CATEGORIES)

describe('food-menu 数据完整性', () => {
  it('菜名全局唯一', () => {
    const names = FOOD_MENU.map(d => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条 tags 非空且只取合法分类 key', () => {
    for (const d of FOOD_MENU) {
      expect(d.tags.length, d.name).toBeGreaterThan(0)
      for (const t of d.tags) expect(VALID_TAGS, `${d.name}:${t}`).toContain(t)
    }
  })

  it('每条 note 非空', () => {
    for (const d of FOOD_MENU) expect(d.note?.trim(), d.name).toBeTruthy()
  })

  it('四大池子各 ≥30 条（REQ-035 四A 底线）', () => {
    for (const key of VALID_TAGS) {
      const n = FOOD_MENU.filter(d => d.tags.includes(key)).length
      expect(n, key).toBeGreaterThanOrEqual(30)
    }
  })
})
