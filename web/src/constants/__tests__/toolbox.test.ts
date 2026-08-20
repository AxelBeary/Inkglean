// 工具箱注册表测试（812-tools-a：注册表单一事实源 + 中英词条齐备）
import { describe, it, expect } from 'vitest'
import { TOOLS_MENU_ITEMS, TOOL_BOX_CATEGORIES } from '../toolbox'
import zh from '../../locales/zh-CN'
import en from '../../locales/en'

function resolveKey(obj: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc ? (acc as Record<string, unknown>)[part] : undefined), obj)
}

describe('工具箱注册表（812-tools-a 新增工具；改稿计数随 v128 下架）', () => {
  const expected = [
    { index: '/tools/quote', cat: 'money', labelKey: 'menu.quote' },
    { index: '/tools/image-resize', cat: 'delivery', labelKey: 'menu.imageResize' }
  ]

  it('新增工具已注册且分类正确；改稿计数已下架', () => {
    for (const exp of expected) {
      const item = TOOLS_MENU_ITEMS.find((it) => it.index === exp.index)
      expect(item, `${exp.index} 已注册`).toBeDefined()
      expect(item!.cat).toBe(exp.cat)
      expect(item!.labelKey).toBe(exp.labelKey)
      expect(item!.icon).toBeDefined()
    }
    expect(TOOLS_MENU_ITEMS.find((it) => it.index === '/tools/revision-count')).toBeUndefined()
  })

  it('每个注册项的 labelKey 在中英词条中都存在', () => {
    for (const item of TOOLS_MENU_ITEMS) {
      expect(resolveKey(zh, item.labelKey), `zh ${item.labelKey}`).toBeTruthy()
      expect(resolveKey(en, item.labelKey), `en ${item.labelKey}`).toBeTruthy()
    }
  })

  it('四分类 key 与中英词条一致', () => {
    expect(TOOL_BOX_CATEGORIES.map((c) => c.key)).toEqual(['money', 'delivery', 'clients', 'efficiency'])
    for (const cat of TOOL_BOX_CATEGORIES) {
      expect(resolveKey(zh, cat.labelKey)).toBeTruthy()
      expect(resolveKey(en, cat.labelKey)).toBeTruthy()
    }
  })
})
