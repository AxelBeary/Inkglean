// GuestbookReviewCard 三态渲染 + 操作测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

if (!window.matchMedia) {
  window.matchMedia = (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}

const h = vi.hoisted(() => ({
  getMessages: vi.fn(),
  approveMessage: vi.fn(),
  rejectMessage: vi.fn(),
  replyMessage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    getMessages: h.getMessages,
    approveMessage: h.approveMessage,
    rejectMessage: h.rejectMessage,
    replyMessage: h.replyMessage
  }
}))

vi.mock('../../../../utils/datetime.js', () => ({
  formatDateTime: (s: string) => s || ''
}))

import GuestbookReviewCard from '../GuestbookReviewCard.vue'

function mountCard() {
  const stubs: Record<string, { template: string }> = {}
  stubs['el-button'] = { template: '<button class="el-btn-stub" @click="$emit(\'click\')"><slot /></button>' }
  stubs['el-input'] = { template: '<textarea />' }
  stubs['el-avatar'] = { template: '<div />' }
  stubs.StatusChip = { template: '<span class="chip-stub"><slot /></span>' }
  stubs.InkEmpty = { template: '<div class="ink-empty-stub">{{ $attrs.title }}</div>' }

  return mount(GuestbookReviewCard, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs
    }
  })
}

beforeEach(() => {
  h.getMessages.mockReset()
  h.approveMessage.mockReset()
  h.rejectMessage.mockReset()
  h.replyMessage.mockReset()
})

describe('GuestbookReviewCard 三态', () => {
  it('loading 态显示骨架条', () => {
    h.getMessages.mockReturnValue(new Promise(() => {}))
    const wrapper = mountCard()
    expect(wrapper.find('.gb-skeleton').exists()).toBe(true)
    expect(wrapper.findAll('.gb-skeleton-row').length).toBe(3)
  })

  it('成功加载后显示留言列表', async () => {
    h.getMessages.mockResolvedValue({
      items: [
        { id: 1, nickname: 'Alice', content: 'Hello', status: 'pending', created_at: '2026-08-01T10:00:00' },
        { id: 2, nickname: 'Bob', content: 'Nice work!', status: 'approved', created_at: '2026-08-01T11:00:00', artist_reply: 'Thanks!' }
      ]
    })
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.gb-mod-list').exists()).toBe(true)
    expect(wrapper.findAll('.gb-mod-item').length).toBe(2)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
  })

  it('空列表显示 InkEmpty', async () => {
    h.getMessages.mockResolvedValue({ items: [] })
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ink-empty-stub').exists()).toBe(true)
  })

  it('加载失败显示错误态+重试按钮', async () => {
    h.getMessages.mockRejectedValue(new Error('Network error'))
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.module-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('dashboard.guestbookError')
    expect(wrapper.text()).toContain('dashboard.retry')
  })

  it('重试按钮点击后重新加载', async () => {
    h.getMessages
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ items: [{ id: 1, nickname: 'Retry', content: 'After retry', status: 'approved', created_at: '2026-08-01T12:00:00' }] })
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.module-error').exists()).toBe(true)

    // Click retry button via component method
    await (wrapper.vm as unknown as { load(): Promise<unknown> }).load()
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.gb-mod-list').exists()).toBe(true)
    expect(wrapper.text()).toContain('Retry')
  })
})

describe('GuestbookReviewCard 操作', () => {
  it('approve 点击调 API 并更新条目状态', async () => {
    const msg = { id: 1, nickname: 'Alice', content: 'Hi', status: 'pending', created_at: '2026-08-01T10:00:00' }
    h.getMessages.mockResolvedValue({ items: [msg] })
    h.approveMessage.mockResolvedValue({ ...msg, status: 'approved' })

    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const approveBtn = wrapper.findAll('.el-btn-stub').at(0)
    await approveBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(h.approveMessage).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('dashboard.guestbookApproved')
  })

  it('reject 点击调 API 并更新状态为 rejected', async () => {
    const msg = { id: 2, nickname: 'Bob', content: 'Test', status: 'pending', created_at: '2026-08-01T10:00:00' }
    h.getMessages.mockResolvedValue({ items: [msg] })
    h.rejectMessage.mockResolvedValue({})

    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const rejectBtn = wrapper.findAll('.el-btn-stub').at(1)
    await rejectBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(h.rejectMessage).toHaveBeenCalledWith(2)
    expect(wrapper.text()).toContain('dashboard.guestbookRejected')
  })
})
