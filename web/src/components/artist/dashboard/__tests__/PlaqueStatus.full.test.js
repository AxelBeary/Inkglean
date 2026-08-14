// PlaqueStatus 满态测试（E2：名额满时开稿面显「满」，翻面交互不受影响）
// 覆盖：未满不显满字 / 满态开稿面渲染变体 / 满态下翻牌开关照常 / 休息面不带满字 / 名额接口失败静默降级
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

// happy-dom 缺 matchMedia 时兜底（与 GuestbookReviewCard 测试同款）
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
}
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  window.cancelAnimationFrame = (id) => clearTimeout(id)
}

const h = vi.hoisted(() => ({
  profile: null,
  getQueue: vi.fn(),
  updateProfile: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../../stores/artist.js', () => ({
  useArtistStore: () => ({ profile: h.profile })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    getQueue: h.getQueue,
    updateProfile: h.updateProfile
  }
}))

import PlaqueStatus from '../PlaqueStatus.vue'

function mountPlaque() {
  return mount(PlaqueStatus, {
    global: { mocks: { $t: (key) => key } }
  })
}

let wrapper = null
afterEach(() => {
  wrapper?.unmount() // 卸载以取消翻牌 rAF 绳同步循环
  wrapper = null
})

beforeEach(() => {
  h.getQueue.mockReset()
  h.updateProfile.mockReset()
  h.push.mockReset()
  h.updateProfile.mockResolvedValue({})
  // 默认：名额 2+1，status open（reactive 以模拟 Pinia store 响应式）
  h.profile = reactive({ status: 'open', batch_limit: 2, buffer_limit: 1, monthly_quota: null, slotDisplay: null })
})

describe('PlaqueStatus 满态渲染（E2）', () => {
  it('名额未满：开稿面显示「可约稿」，无满态变体', async () => {
    h.getQueue.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]) // 正式 1 + 候补 0 < 3
    wrapper = mountPlaque()
    await flushPromises()

    const faceOpen = wrapper.find('.face-open')
    expect(faceOpen.text()).toContain('dashboard.statusOpen')
    expect(faceOpen.text()).not.toContain('dashboard.plaqueFullChar')
    expect(faceOpen.classes()).not.toContain('face-full')
  })

  it('名额已满：开稿面改显「满」字样（满态为开稿面显示变体，非第三面牌）', async () => {
    h.getQueue.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce([{ id: 3 }]) // 2+1 >= 2+1
    wrapper = mountPlaque()
    await flushPromises()

    const faceOpen = wrapper.find('.face-open')
    expect(faceOpen.classes()).toContain('face-full')
    expect(faceOpen.text()).toContain('dashboard.plaqueFullChar')
    expect(faceOpen.text()).not.toContain('dashboard.statusOpen')
    // 仍是正反两面结构：休息面存在且文案不变
    expect(wrapper.find('.face-closed').text()).toContain('dashboard.statusBreak')
    expect(wrapper.findAll('.plaque-face').length).toBe(2)
  })

  it('休息中（翻面后）：休息面不带满字，满态仅属开稿面', async () => {
    h.profile.status = 'break'
    h.getQueue.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]).mockResolvedValueOnce([{ id: 3 }])
    wrapper = mountPlaque()
    await flushPromises()

    expect(wrapper.find('.plaque').classes()).toContain('flipped')
    expect(wrapper.find('.face-closed').text()).not.toContain('dashboard.plaqueFullChar')
    // 开稿面（此时为背面）保留满态变体数据
    expect(wrapper.find('.face-open').classes()).toContain('face-full')
  })
})

describe('PlaqueStatus 满态下翻面交互不受影响（E2）', () => {
  it('满态点击翻休息、再点翻回，updateProfile 照常调用', async () => {
    h.getQueue.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
    wrapper = mountPlaque()
    await flushPromises()
    expect(wrapper.find('.face-open').classes()).toContain('face-full')

    await wrapper.find('.plaque').trigger('click')
    await flushPromises()
    expect(h.updateProfile).toHaveBeenCalledWith({ status: 'break' })
    expect(wrapper.find('.plaque').classes()).toContain('flipped')

    await wrapper.find('.plaque').trigger('click')
    await flushPromises()
    expect(h.updateProfile).toHaveBeenCalledWith({ status: 'open' })
    expect(wrapper.find('.plaque').classes()).not.toContain('flipped')
    // 翻回后满态变体仍在（名额未变）
    expect(wrapper.find('.face-open').classes()).toContain('face-full')
  })

  it('名额接口失败：静默降级不显满、不阻塞挂牌', async () => {
    h.getQueue.mockRejectedValue(new Error('network'))
    wrapper = mountPlaque()
    await flushPromises()

    const faceOpen = wrapper.find('.face-open')
    expect(faceOpen.text()).toContain('dashboard.statusOpen')
    expect(faceOpen.classes()).not.toContain('face-full')
  })
})
