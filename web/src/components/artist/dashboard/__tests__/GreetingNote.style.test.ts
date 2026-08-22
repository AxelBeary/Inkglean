// GreetingNote 问候卡四款式切换测试（自定义首页批二 G）
// 口径：四款（plain/seal/ribbon/rule）都渲染完整问候内容（长句+日期+统计+落款），
//      只换装饰框不换内容；默认 plain 不带额外框类名。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { ArtistStats } from '../../../../api/types'

if (!window.matchMedia) {
  window.matchMedia = (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}

const h = vi.hoisted(() => ({
  getGreeting: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  // t 原样返回词条键，便于断言；locale 供 dateLine 读取
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: { getGreeting: h.getGreeting }
}))

// 返回当日 → 走 settleNow 直出（内容可见），不依赖真实演绎定时器；
// 洇墨回归用例内用 vi.mocked 改返回 null 走演绎态
vi.mock('../../../../utils/storage.js', () => ({
  safeGetItem: vi.fn(() => new Date().toDateString()),
  safeSetItem: vi.fn()
}))

// 金额滚动 composable 直出终值，避免 rAF 依赖
vi.mock('../../../../utils/useCountUp.js', () => ({
  useCountUp: () => ({ display: 0 })
}))

import GreetingNote from '../GreetingNote.vue'
import { safeGetItem } from '../../../../utils/storage.js'

type GreetStyle = 'plain' | 'seal' | 'ribbon' | 'rule'

const GREET_TEXT = '午后的阳光正好，笔尖的墨还温着。'

const stats: ArtistStats = {
  pendingCount: 1, activeCount: 2, monthRevenue: 600, monthRevenueCents: 60000,
  totalCompleted: 42, todayNewOrderCents: 32000, todayNewOrderCount: 3,
  todayRevenueCents: 60000, todayRevenueCount: 5, todayTodoCount: 2
}

function mountNote(greetStyle?: GreetStyle) {
  const props: { stats: ArtistStats; greetStyle?: GreetStyle } = { stats }
  if (greetStyle !== undefined) props.greetStyle = greetStyle
  return mount(GreetingNote, { props })
}

async function settledNote(greetStyle?: GreetStyle) {
  const wrapper = mountNote(greetStyle)
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  h.getGreeting.mockReset()
  h.getGreeting.mockResolvedValue({ text: GREET_TEXT, slot: 'noon' })
})

describe('GreetingNote 四款式内容完整性（只换框不换内容）', () => {
  const styles: GreetStyle[] = ['plain', 'seal', 'ribbon', 'rule']
  for (const style of styles) {
    it(`${style} 款渲染完整问候内容：长句+日期+统计+落款`, async () => {
      const wrapper = await settledNote(style)
      const text = wrapper.text()
      // 长句问候（逐字 span 拼接回完整文案）
      expect(text).toContain(GREET_TEXT)
      // 日期行（noon 时段词条键）
      expect(text).toContain('dashboard.slotNoon')
      // 今日统计行（两条标签）
      expect(text).toContain('dashboard.todayNewOrders')
      expect(text).toContain('dashboard.todayRevenue')
      // 落款
      expect(text).toContain('dashboard.greetSign')
    })
  }
})

describe('GreetingNote 默认款不带额外框类名', () => {
  it('未传 greetStyle → 默认 plain，根节点无任何 g-* 框类名', async () => {
    const wrapper = await settledNote()
    const root = wrapper.find('.greeting-note')
    expect(root.exists()).toBe(true)
    for (const c of ['g-seal', 'g-ribbon', 'g-rule', 'g-plain']) {
      expect(root.classes()).not.toContain(c)
    }
  })

  it('显式 plain → 同样不带框类名，且不渲染朱印/墨线装饰', async () => {
    const wrapper = await settledNote('plain')
    const root = wrapper.find('.greeting-note')
    expect(root.classes()).not.toContain('g-seal')
    expect(root.classes()).not.toContain('g-ribbon')
    expect(root.classes()).not.toContain('g-rule')
    expect(wrapper.find('.gs-stamp').exists()).toBe(false)
    expect(wrapper.find('.g-rule-line').exists()).toBe(false)
  })
})

describe('GreetingNote 逐字洇墨入场（822 回归：.g-text 必须挂 playing 类）', () => {
  // 历史 bug：CSS 选择器 .g-text.playing .ch.on，但 playing 只挂在 .ch 上、
  // 漏挂外层 .g-text，逐字动画从未生效；本用例钉死选择器可匹配。
  it('当日未演 → 演绎态：950ms 后 .g-text 带 playing 且每个 .ch 带 on；总时长后落 settled', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(safeGetItem).mockReturnValue(null)
      const wrapper = mountNote()
      await flushPromises()
      // 入场：950ms 后 playing=true
      vi.advanceTimersByTime(950)
      await wrapper.vm.$nextTick()
      const gText = wrapper.find('.g-text')
      expect(gText.classes()).toContain('playing')
      const chs = wrapper.findAll('.ch')
      expect(chs.length).toBeGreaterThan(0)
      for (const ch of chs) expect(ch.classes()).toContain('on')
      // 演绎总时长（字数×55+750）后落定：settled 上、playing 退
      vi.advanceTimersByTime(chs.length * 55 + 750)
      await wrapper.vm.$nextTick()
      const settledText = wrapper.find('.g-text')
      expect(settledText.classes()).toContain('settled')
      expect(settledText.classes()).not.toContain('playing')
    } finally {
      vi.useRealTimers()
      vi.mocked(safeGetItem).mockReturnValue(new Date().toDateString())
    }
  })
})

describe('GreetingNote 款式装饰落位', () => {
  it('seal 款带 g-seal 类且渲染右上朱印', async () => {
    const wrapper = await settledNote('seal')
    expect(wrapper.find('.greeting-note').classes()).toContain('g-seal')
    const stamp = wrapper.find('.gs-stamp')
    expect(stamp.exists()).toBe(true)
    expect(stamp.text()).toContain('dashboard.greetStamp')
  })

  it('ribbon 款带 g-ribbon 类且无朱印/墨线', async () => {
    const wrapper = await settledNote('ribbon')
    expect(wrapper.find('.greeting-note').classes()).toContain('g-ribbon')
    expect(wrapper.find('.gs-stamp').exists()).toBe(false)
    expect(wrapper.find('.g-rule-line').exists()).toBe(false)
  })

  it('rule 款带 g-rule 类且渲染墨线分隔', async () => {
    const wrapper = await settledNote('rule')
    expect(wrapper.find('.greeting-note').classes()).toContain('g-rule')
    expect(wrapper.find('.g-rule-line').exists()).toBe(true)
    expect(wrapper.find('.gs-stamp').exists()).toBe(false)
  })
})
