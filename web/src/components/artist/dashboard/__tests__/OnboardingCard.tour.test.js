// 818-E: OnboardingCard 导览入口卡测试——主按钮重启 tour / 首次进入自动启动 / 隐藏判定
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getOnboarding: vi.fn(),
  dismissOnboarding: vi.fn(),
  track: vi.fn(),
  start: vi.fn(),
  hasSeen: vi.fn(),
  active: { value: false }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOnboarding: h.getOnboarding,
    dismissOnboarding: h.dismissOnboarding
  }
}))

vi.mock('../../../utils/track.js', () => ({
  trackEvent: h.track
}))

vi.mock('../../../composables/useTour', () => ({
  useTour: () => ({
    start: h.start,
    hasSeen: h.hasSeen,
    active: h.active
  })
}))

import OnboardingCard from '../OnboardingCard.vue'

function mountCard() {
  return shallowMount(OnboardingCard, {
    global: {
      mocks: { $t: (key) => key, $tm: () => [] },
      stubs: {
        'el-card': { template: '<section><slot name="header" /><slot /></section>' },
        'el-button': {
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
          inheritAttrs: false
        }
      }
    }
  })
}

const OPEN_STATE = {
  dismissed: false,
  tasks: [
    { key: 'artwork', done: false },
    { key: 'tier', done: false },
    { key: 'share', done: false }
  ]
}

describe('OnboardingCard 导览入口（818-E）', () => {
  beforeEach(() => {
    h.getOnboarding.mockReset()
    h.dismissOnboarding.mockReset()
    h.track.mockClear()
    h.start.mockClear()
    h.hasSeen.mockReset()
    h.hasSeen.mockReturnValue(true)
    h.active.value = false
  })

  it('卡片可见时渲染主按钮，点击即重启 tour（重置入口）', async () => {
    h.getOnboarding.mockResolvedValue(OPEN_STATE)
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.find('.ob-tour-btn').exists()).toBe(true)
    expect(wrapper.find('.ob-tour-btn').text()).toContain('onboarding.tourBtn')

    await wrapper.find('.ob-tour-btn').trigger('click')
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith('tour_start')
  })

  it('首次进入且卡片可见 → 自动启动一次；已看过不重复弹', async () => {
    h.hasSeen.mockReturnValue(false)
    h.getOnboarding.mockResolvedValue(OPEN_STATE)
    mountCard()
    await flushPromises()
    expect(h.start).toHaveBeenCalledTimes(1)

    h.start.mockClear()
    h.hasSeen.mockReturnValue(true)
    const wrapperSeen = mountCard()
    await flushPromises()
    expect(wrapperSeen.find('.ob-tour-btn').exists()).toBe(true)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('后端标记 dismissed / 必做项完成 → 卡片隐藏，不自动启动', async () => {
    h.hasSeen.mockReturnValue(false)
    h.getOnboarding.mockResolvedValue({
      dismissed: true,
      tasks: [{ key: 'artwork', done: false }, { key: 'tier', done: false }]
    })
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.find('.ob-tour-btn').exists()).toBe(false)
    expect(h.start).not.toHaveBeenCalled()

    h.getOnboarding.mockResolvedValue({
      dismissed: false,
      tasks: [{ key: 'artwork', done: true }, { key: 'tier', done: true }]
    })
    const wrapperDone = mountCard()
    await flushPromises()
    expect(wrapperDone.find('.ob-tour-btn').exists()).toBe(false)
    expect(h.start).not.toHaveBeenCalled()
  })
})
