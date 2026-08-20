// 排期公示页日期渲染回归：{{ todayStr }} 漏调用括号曾把函数源码当文本渲染
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getQueue: vi.fn(),
  getUpcomingDeadlines: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: h.getProfile,
    getQueue: h.getQueue,
    getUpcomingDeadlines: h.getUpcomingDeadlines
  }
}))

import ScheduleSharePage from '../ScheduleSharePage.vue'

// happy-dom 无 canvas 2d：统一 stub（与小票打印机挂载测试同口径）
function canvasContextStub() {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'canvas') return { width: 0, height: 0 }
      return () => undefined
    },
    set() {
      return true
    }
  })
}

beforeEach(() => {
  h.getProfile.mockReset()
  h.getQueue.mockReset()
  h.getUpcomingDeadlines.mockReset()
  h.getProfile.mockResolvedValue({ name: '测试画师' })
  h.getQueue.mockResolvedValue([])
  h.getUpcomingDeadlines.mockResolvedValue([])
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

async function mountPage() {
  const wrapper = mount(ScheduleSharePage, {
    global: {
      mocks: { $t: (key: string) => key }
    }
  })
  await flushPromises()
  return wrapper
}

describe('ScheduleSharePage 排期公示', () => {
  it('卡片日期渲染 YYYY-MM-DD 字符串，不得渲染函数源码', async () => {
    const wrapper = await mountPage()
    const dateText = wrapper.find('.schedule-card-date').text()
    expect(dateText).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(wrapper.text()).not.toContain('function')
    expect(wrapper.find('.schedule-card-artist').text()).toBe('测试画师')
  })
})
