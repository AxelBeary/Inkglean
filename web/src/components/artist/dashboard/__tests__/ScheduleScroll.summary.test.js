// ScheduleScroll E1：纸签交互深化
// 覆盖：悬停 title 含阶段名；点击弹订单摘要浮层（内容来自接口数据、缺字段项省略）；
// Esc / 点外部 / 关闭按钮关闭；键盘 Enter 打开；关闭后焦点回退；浮层内进详情保持跳转语义。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getDashboardSchedule: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: { getDashboardSchedule: h.getDashboardSchedule }
}))

vi.mock('../../../../utils/datetime.js', () => ({
  formatDateTime: (s) => s || ''
}))

import ScheduleScroll from '../ScheduleScroll.vue'

/** 相对今天偏移 days 天的本地日历日字符串（start_date 存储口径，保证落在 7 日窗口内） */
function localDateStr(days) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const barFull = {
  id: 11, orderNo: 'SCH-101', clientName: '客户甲', status: 'wip',
  startDate: localDateStr(0), deadline: '2026-08-16 12:00:00', stageName: '线稿'
}
const barBare = {
  id: 12, orderNo: 'SCH-102', clientName: null, status: 'pending',
  startDate: localDateStr(1), deadline: null, stageName: null
}

let wrapper = null

async function mountScroll(bars) {
  h.getDashboardSchedule.mockResolvedValue({ bars })
  wrapper = mount(ScheduleScroll, { attachTo: document.body })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

afterEach(() => {
  if (wrapper) { wrapper.unmount(); wrapper = null }
})

beforeEach(() => {
  h.getDashboardSchedule.mockReset()
  h.push.mockReset()
})

describe('ScheduleScroll 纸签悬停与摘要浮层（E1）', () => {
  it('纸签 title 属性含阶段名（悬停可见，克制不弹窗）', async () => {
    await mountScroll([barFull])

    const bar = wrapper.find('.tl-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('title')).toContain('线稿')
    expect(bar.attributes('title')).toContain('SCH-101')
  })

  it('点击纸签弹出摘要浮层：内容来自接口数据', async () => {
    await mountScroll([barFull])

    await wrapper.find('.tl-bar').trigger('click')
    await wrapper.vm.$nextTick()

    const pop = wrapper.find('.tl-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.attributes('role')).toBe('dialog')
    const text = pop.text()
    expect(text).toContain('SCH-101')
    expect(text).toContain('客户甲')           // 客户名
    expect(text).toContain('线稿')             // 当前节点
    expect(text).toContain(localDateStr(0))    // 开工日
    expect(text).toContain('2026-08-16 12:00:00') // 截稿日（formatDateTime mock 透传）
    expect(text).toContain('common.orderStatus.wip') // 状态
  })

  it('接口缺字段时浮层省略该项（stageName/deadline 为空不渲染该行）', async () => {
    await mountScroll([barBare])

    await wrapper.find('.tl-bar').trigger('click')
    await wrapper.vm.$nextTick()

    const pop = wrapper.find('.tl-pop')
    expect(pop.exists()).toBe(true)
    expect(pop.text()).not.toContain('dashboard.scheduleSummaryStage')
    expect(pop.text()).not.toContain('dashboard.scheduleSummaryDeadline')
    // 客户名为空时回退订单号
    expect(pop.text()).toContain('SCH-102')
  })

  it('键盘 Enter 打开浮层（键盘可达）', async () => {
    await mountScroll([barFull])

    await wrapper.find('.tl-bar').trigger('keydown.enter')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tl-pop').exists()).toBe(true)
  })

  it('Esc 关闭浮层且焦点回退到触发纸签', async () => {
    await mountScroll([barFull])
    const bar = wrapper.find('.tl-bar')
    await bar.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tl-pop').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tl-pop').exists()).toBe(false)
    expect(document.activeElement).toBe(bar.element)
  })

  it('点击外部（遮罩）关闭浮层', async () => {
    await mountScroll([barFull])
    await wrapper.find('.tl-bar').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.tl-pop-backdrop').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tl-pop').exists()).toBe(false)
  })

  it('关闭按钮关闭浮层', async () => {
    await mountScroll([barFull])
    await wrapper.find('.tl-bar').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.tl-pop-close').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tl-pop').exists()).toBe(false)
  })

  it('浮层内「进订单详情」承接原点击跳转语义', async () => {
    await mountScroll([barFull])
    await wrapper.find('.tl-bar').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.tl-pop-detail').trigger('click')
    await wrapper.vm.$nextTick()

    expect(h.push).toHaveBeenCalledWith('/orders/11?from=dashboard')
    expect(wrapper.find('.tl-pop').exists()).toBe(false)
  })
})
