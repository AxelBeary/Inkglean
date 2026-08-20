// 自定义首页批一（v70）：dashboard-layout 纯函数测试
// 覆盖 order/hidden/width/density 解析与「拉取失败回落默认」纪律
import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_PANEL_IDS,
  CORE_PANEL_IDS,
  isDashboardPanelId,
  resolveDashboardLayout,
  resolvePanelWidth,
  resolveMaxRows
} from '../dashboard-layout'
import type { DashboardPrefs } from '../../api/types'

/** 构造完整合法 prefs（形状钉死 api/types.ts；批二字段本批不消费，填默认即可） */
function makePrefs(overrides: Partial<DashboardPrefs> = {}): DashboardPrefs {
  return {
    v: 1,
    order: [...DASHBOARD_PANEL_IDS],
    hidden: [],
    width: {},
    density: {},
    scheduleStyle: 'bars',
    greetStyle: 'plain',
    pageAlign: 'center',
    pageMax: 1200,
    ...overrides
  }
}

describe('resolveDashboardLayout（默认/回落）', () => {
  it('prefs 为 null（拉取失败）→ 默认布局：基础 10 块默认顺序（可选板块不自动上首页），默认宽度与密度', () => {
    const layout = resolveDashboardLayout(null)
    expect(layout.map(p => p.id)).toEqual([...CORE_PANEL_IDS])
    expect(layout.find(p => p.id === 'greet')?.width).toBe('half')   // 用户拍板：问候卡默认半行
    expect(layout.find(p => p.id === 'stats')?.width).toBe('full')
    expect(layout.find(p => p.id === 'schedule')?.width).toBe('full')
    expect(layout.find(p => p.id === 'todo')?.width).toBe('half')
    expect(layout.find(p => p.id === 'quick')?.width).toBe('half')
    layout.forEach(p => expect(p.maxRows).toBe(0))
  })

  it('prefs 为 undefined 与空字段 prefs 同样落默认', () => {
    expect(resolveDashboardLayout(undefined).map(p => p.id)).toEqual([...CORE_PANEL_IDS])
    expect(resolveDashboardLayout(makePrefs({ order: [] })).map(p => p.id)).toEqual([...CORE_PANEL_IDS])
  })

  it('可选板块（板块库）：order 中有且未 hidden 则渲染；缺失不自动补上首页', () => {
    const added = makePrefs({
      order: [...CORE_PANEL_IDS, 'incomeChart'],
      hidden: ['incomeMonth', 'ddlSoon']
    })
    const ids = resolveDashboardLayout(added).map(p => p.id)
    expect(ids).toContain('incomeChart')
    expect(ids).not.toContain('incomeMonth')
    // 仅基础 order：三个可选板块均不自动出现
    const bare = makePrefs({ order: [...CORE_PANEL_IDS] })
    const bareIds = resolveDashboardLayout(bare).map(p => p.id)
    expect(bareIds).toEqual([...CORE_PANEL_IDS])
  })
})

describe('resolveDashboardLayout（order / hidden）', () => {
  it('按 prefs.order 渲染，hidden 中的板块不出现', () => {
    const prefs = makePrefs({
      order: ['quick', 'todo', 'greet', 'stats', 'schedule', 'guestbook', 'activity', 'announcement', 'onboarding'],
      hidden: ['activity', 'onboarding']
    })
    expect(resolveDashboardLayout(prefs).map(p => p.id))
      .toEqual(['quick', 'todo', 'greet', 'stats', 'schedule', 'guestbook', 'announcement', 'plaque'])
  })

  it('未知 id 丢弃、重复 id 去重、缺失 id 按默认顺序补尾部', () => {
    const prefs = makePrefs({
      order: ['todo', 'todo', 'future-panel', 'greet']
    })
    const ids = resolveDashboardLayout(prefs).map(p => p.id)
    expect(ids.slice(0, 2)).toEqual(['todo', 'greet'])
    // 缺失的 8 块按默认相对顺序补齐
    expect(ids).toEqual(['todo', 'greet', 'plaque', 'stats', 'schedule', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick'])
  })

  it('hidden 中的 id 即使出现在 order 里也不渲染', () => {
    const prefs = makePrefs({ order: ['stats', 'greet'], hidden: ['greet'] })
    const ids = resolveDashboardLayout(prefs).map(p => p.id)
    expect(ids).not.toContain('greet')
    expect(ids[0]).toBe('stats')
  })
})

describe('resolvePanelWidth（宽度解析）', () => {
  it('prefs.width 合法覆盖生效（todo 变 full、schedule 变 half）', () => {
    const prefs = makePrefs({ width: { todo: 'full', schedule: 'half' } })
    expect(resolvePanelWidth(prefs, 'todo')).toBe('full')
    expect(resolvePanelWidth(prefs, 'schedule')).toBe('half')
  })

  it('非法宽度值落默认', () => {
    const prefs = makePrefs({ width: { todo: 'wide' as unknown as 'half' } })
    expect(resolvePanelWidth(prefs, 'todo')).toBe('half')
    expect(resolvePanelWidth(prefs, 'stats')).toBe('full')   // 非法值落默认（stats 默认整行）
  })

  it('prefs 为 null 时走默认档位', () => {
    expect(resolvePanelWidth(null, 'greet')).toBe('half')
    expect(resolvePanelWidth(null, 'announcement')).toBe('half')
  })
})

describe('resolveMaxRows（密度解析）', () => {
  it('仅列表板块生效，0/3/5 档位透传', () => {
    const prefs = makePrefs({ density: { todo: 3, guestbook: 5, activity: 0 } })
    expect(resolveMaxRows(prefs, 'todo')).toBe(3)
    expect(resolveMaxRows(prefs, 'guestbook')).toBe(5)
    expect(resolveMaxRows(prefs, 'activity')).toBe(0)
  })

  it('非列表板块恒 0（即使 prefs 夹带了值）', () => {
    const prefs = makePrefs({ density: { greet: 3 } as unknown as Record<string, number> })
    expect(resolveMaxRows(prefs, 'greet')).toBe(0)
    expect(resolveMaxRows(prefs, 'quick')).toBe(0)
  })

  it('非法档位（负数/越界/非数字）落 0', () => {
    const prefs = makePrefs({ density: { todo: 4, guestbook: -3, activity: Number.NaN } })
    expect(resolveMaxRows(prefs, 'todo')).toBe(0)
    expect(resolveMaxRows(prefs, 'guestbook')).toBe(0)
    expect(resolveMaxRows(prefs, 'activity')).toBe(0)
  })

  it('resolveDashboardLayout 输出携带 maxRows', () => {
    const prefs = makePrefs({ density: { todo: 5 } })
    const panel = resolveDashboardLayout(prefs).find(p => p.id === 'todo')
    expect(panel?.maxRows).toBe(5)
  })
})

describe('isDashboardPanelId', () => {
  it('13 块内为 true，未知/非字符串为 false', () => {
    expect(isDashboardPanelId('greet')).toBe(true)
    expect(isDashboardPanelId('announcement')).toBe(true)
    expect(isDashboardPanelId('incomeChart')).toBe(true)
    expect(isDashboardPanelId('ddlSoon')).toBe(true)
    expect(isDashboardPanelId('income')).toBe(false)
    expect(isDashboardPanelId(42)).toBe(false)
    expect(isDashboardPanelId(null)).toBe(false)
  })
})
