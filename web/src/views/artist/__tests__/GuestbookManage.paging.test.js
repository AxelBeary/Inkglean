// GuestbookManage 分页消费测试（G-8 / F-2 前端适配）
// 覆盖：按 { items, total, page, pageSize } 消费；多页循环拉取（pageSize=100 上限）；
//       本地筛选/翻页行为不变；筛选切换重置页码
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getMessages: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.msgError, warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getMessages: h.getMessages,
    approveMessage: () => Promise.resolve({ status: 'approved' }),
    rejectMessage: () => Promise.resolve({ success: true }),
    replyMessage: () => Promise.resolve({ artist_reply: 'ok' })
  }
}))

vi.mock('../../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

vi.mock('../../../components/ArtistLayout.vue', () => ({
  default: { name: 'ArtistLayout', template: '<div><slot /></div>' }
}))

import GuestbookManage from '../GuestbookManage.vue'

function buildMessages(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    nickname: `n${i + 1}`,
    content: `msg-${i + 1}`,
    status: i % 3 === 0 ? 'pending' : 'approved',
    language: i % 2 === 0 ? 'zh-CN' : 'en',
    created_at: `2026-08-${String((i % 28) + 1).padStart(2, '0')} 10:00`,
    artist_reply: null
  }))
}

function mountPage() {
  return mount(GuestbookManage, {
    global: {
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: {
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio-button': { template: '<label @click="$emit(\'change\')"><slot /></label>' },
        'el-select': { template: '<div><slot /></div>' },
        'el-option': { template: '<div />' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-empty': { template: '<div class="empty-stub" />' },
        'el-pagination': { template: '<div class="pagination-stub" />' },
        'el-badge': { template: '<span><slot /></span>' },
        'el-popconfirm': { template: '<span><slot /></span>' },
        'el-input': { template: '<textarea />' }
      }
    }
  })
}

beforeEach(() => {
  h.getMessages.mockReset()
  h.msgError.mockClear()
})

describe('GuestbookManage 分页消费（G-8）', () => {
  it('按 { items } 消费并循环拉取全部分页（pageSize=100）', async () => {
    const all = buildMessages(120)
    h.getMessages.mockImplementation(({ page }) => {
      const start = (page - 1) * 100
      return Promise.resolve({
        items: all.slice(start, start + 100),
        total: 120,
        page,
        pageSize: 100
      })
    })

    const wrapper = mountPage()
    await flushPromises()

    expect(h.getMessages).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
    expect(h.getMessages).toHaveBeenCalledWith({ page: 2, pageSize: 100 })
    expect(wrapper.vm.messages).toHaveLength(120)
    expect(wrapper.vm.filteredMessages).toHaveLength(120)
    expect(wrapper.vm.pagedMessages).toHaveLength(20) // 本地分页默认 20/页
  })

  it('状态筛选：按当前页内数据过滤，筛选切换重置页码', async () => {
    const all = buildMessages(45)
    h.getMessages.mockReturnValue(Promise.resolve({ items: all, total: 45, page: 1, pageSize: 100 }))

    const wrapper = mountPage()
    await flushPromises()
    wrapper.vm.page = 2
    await flushPromises()
    expect(wrapper.vm.page).toBe(2)

    // 切筛选 → page 重置 1，列表按状态过滤（模板 @change 绑 onFilterChange，此处直接驱动）
    wrapper.vm.statusFilter = 'pending'
    wrapper.vm.onFilterChange()
    await flushPromises()

    expect(wrapper.vm.page).toBe(1)
    expect(wrapper.vm.filteredMessages.every(m => m.status === 'pending')).toBe(true)
    // 45 条中 pending 约 15 条 → 不足一页仍展示
    expect(wrapper.vm.filteredMessages.length).toBeGreaterThan(0)
  })

  it('翻页：pagedMessages 按页码切片', async () => {
    const all = buildMessages(45)
    h.getMessages.mockReturnValue(Promise.resolve({ items: all, total: 45, page: 1, pageSize: 100 }))

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.vm.pagedMessages.map(m => m.id)).toEqual(all.slice(0, 20).map(m => m.id))

    wrapper.vm.page = 3
    await flushPromises()
    expect(wrapper.vm.pagedMessages.map(m => m.id)).toEqual(all.slice(40, 45).map(m => m.id))
  })

  it('加载失败提示错误且 loading 复位', async () => {
    h.getMessages.mockRejectedValue(new Error('network'))
    const wrapper = mountPage()
    await flushPromises()
    expect(h.msgError).toHaveBeenCalledWith('network')
    expect(wrapper.vm.loading).toBe(false)
  })
})
