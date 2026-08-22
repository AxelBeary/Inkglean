// 822 批：「进入后台时先打开」落地映射单测
import { describe, it, expect } from 'vitest'
import { DEFAULT_PANEL_ROUTES, resolveDefaultPanelRoute } from '../defaultPanel'

describe('resolveDefaultPanelRoute「先打开」面板解析', () => {
  it('四个功能页映射到真实后台路由（手动录单带 action 参数，同候选池口径）', () => {
    expect(resolveDefaultPanelRoute('queue')).toBe('/queue')
    expect(resolveDefaultPanelRoute('orders')).toBe('/orders')
    expect(resolveDefaultPanelRoute('manual')).toBe('/orders?action=manual')
    expect(resolveDefaultPanelRoute('tiers')).toBe('/tiers')
  })

  it('dashboard / null / 空串 / 未知值 → null（停留仪表盘，不跳转）', () => {
    expect(resolveDefaultPanelRoute('dashboard')).toBeNull()
    expect(resolveDefaultPanelRoute(null)).toBeNull()
    expect(resolveDefaultPanelRoute(undefined)).toBeNull()
    expect(resolveDefaultPanelRoute('')).toBeNull()
    expect(resolveDefaultPanelRoute('nope')).toBeNull()
  })

  it('映射表 key 与后端白名单口径一致（无 dashboard 自身）', () => {
    expect(Object.keys(DEFAULT_PANEL_ROUTES).sort()).toEqual(['manual', 'orders', 'queue', 'tiers'])
  })
})
