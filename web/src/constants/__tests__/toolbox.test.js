// 工具箱注册表测试（812-tools-a：注册表单一事实源 + 中英词条齐备）
import { describe, it, expect } from 'vitest'
import { TOOLS_MENU_ITEMS, TOOL_BOX_CATEGORIES } from '../toolbox.js'
import zh from '../../locales/zh-CN.js'
import en from '../../locales/en.js'

function resolveKey(obj, key) {
  return key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj)
}

describe('工具箱注册表（812-tools-a 三个新工具）', () => {
  const expected = [
    { index: '/tools/quote', cat: 'money', labelKey: 'menu.quote' },
    { index: '/tools/revision-count', cat: 'delivery', labelKey: 'menu.revisionCount' },
    { index: '/tools/image-resize', cat: 'delivery', labelKey: 'menu.imageResize' }
  ]

  it('三个新工具已注册且分类正确', () => {
    for (const exp of expected) {
      const item = TOOLS_MENU_ITEMS.find((it) => it.index === exp.index)
      expect(item, `${exp.index} 已注册`).toBeDefined()
      expect(item.cat).toBe(exp.cat)
      expect(item.labelKey).toBe(exp.labelKey)
      expect(item.icon).toBeDefined()
    }
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
