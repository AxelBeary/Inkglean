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
    // WEB-03：load 已改 Promise.all 并发——首轮「列表请求」失败即进错误态（计数请求同时发出）；
    // 之后的请求按参数分叉返回，不能再用「一次一份」的顺序 mock（并发下两份会被首轮一起消耗）。
    h.getMessages
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation((params: { status?: string }) => Promise.resolve(
        params.status === 'pending'
          ? { items: [], total: 0, page: 1, pageSize: 1 }
          : { items: [{ id: 1, nickname: 'Retry', content: 'After retry', status: 'approved', created_at: '2026-08-01T12:00:00' }] }
      ))
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
  // WEB-03（debug-swarm 11-24）：列表与计数两请求无依赖，必须并发发起。
  // 修复前串行 await：列表未 resolve 前第二个请求根本没发出，角标白等一个 RTT。
  it('WEB-03: 列表与计数请求并发发起（列表未 resolve 时计数已发出）', async () => {
    let resolveList!: (v: unknown) => void
    let resolveCount!: (v: unknown) => void
    h.getMessages
      .mockImplementationOnce(() => new Promise(r => { resolveList = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveCount = r }))

    const wrapper = mountCard()
    await flushPromises()
    // 两个请求都已发出，尽管列表 Promise 仍未 resolve
    expect(h.getMessages).toHaveBeenCalledTimes(2)
    expect(h.getMessages.mock.calls[0][0]).toEqual({ page: 1, pageSize: 20 })
    expect(h.getMessages.mock.calls[1][0]).toEqual({ page: 1, pageSize: 1, status: 'pending' })

    resolveList({ items: [{ id: 1, nickname: '甲', content: 'hi', status: 'pending', created_at: '2026-08-01T10:00:00' }] })
    resolveCount({ items: [], total: 4, page: 1, pageSize: 1 })
    await flushPromises()
    expect((wrapper.vm as unknown as { pendingCount: number }).pendingCount).toBe(4)
  })

  it('F0205 返工: 待审计数走服务端 status 过滤单请求，本地审核即时递减', async () => {
    // 尾巴批 pr-review-20261123：显示列表（无 status 参数）与计数请求（status=pending）分叉返回
    h.getMessages.mockImplementation((params: { status?: string }) => Promise.resolve(
      params.status === 'pending'
        ? { items: [{ id: 9, nickname: '丙', content: '深页待审', status: 'pending', created_at: '2026-08-01T08:00:00' }], total: 3, page: 1, pageSize: 1 }
        : {
            items: [
              { id: 1, nickname: '甲', content: '待审', status: 'pending', created_at: '2026-08-01T10:00:00' },
              { id: 2, nickname: '乙', content: '已过', status: 'approved', created_at: '2026-08-01T09:00:00' }
            ],
            total: 5, page: 1, pageSize: 20
          }
    ))
    const msg = { id: 1, nickname: '甲', content: '待审', status: 'pending', created_at: '2026-08-01T10:00:00' }
    h.approveMessage.mockResolvedValue({ ...msg, status: 'approved' })

    const wrapper = mountCard()
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 计数请求带 status 过滤参数，角标读 total 而非列表推导（旧全量翻页已废）
    expect(h.getMessages).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(h.getMessages).toHaveBeenCalledWith({ page: 1, pageSize: 1, status: 'pending' })
    expect((wrapper.vm as unknown as { pendingCount: number }).pendingCount).toBe(3)

    const approveBtn = wrapper.findAll('.el-btn-stub').at(0)
    await approveBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 本地过审即时递减，不依赖下一轮重拉
    expect((wrapper.vm as unknown as { pendingCount: number }).pendingCount).toBe(2)
  })

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
