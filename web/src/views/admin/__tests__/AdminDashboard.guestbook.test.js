// P1-B（813-hunt）：AdminDashboard 留言加载三态
// 覆盖：失败 → 错误横幅 + 不显示「暂无留言」空态；重试成功恢复；
//       成功空态正常显示；筛选失败清旧数据；行单元格带移动端 data-label
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminDashboard from '../AdminDashboard.vue'

const h = vi.hoisted(() => ({
  getStats: vi.fn(),
  getArtists: vi.fn(),
  getMessages: vi.fn(),
  deleteMessage: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getStats: h.getStats,
    getArtists: h.getArtists,
    getMessages: h.getMessages,
    deleteMessage: h.deleteMessage
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key) => key } },
  setLocale: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: vi.fn() },
  ElMessageBox: { confirm: h.confirm }
}))

const EP_STUBS = {
  'el-card': { template: '<div class="card-stub"><slot /><slot name="header" /></div>' },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-button': {
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': { name: 'ElEmpty', template: '<div class="empty-stub" />' },
  'el-select': {
    name: 'ElSelect',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template: '<div class="select-stub"><slot /></div>'
  },
  'el-option': { template: '<div />' }
}

const mountedWrappers = []

function mountPage() {
  const wrapper = mount(AdminDashboard, {
    global: {
      mocks: { $t: (key) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function messageRow(overrides = {}) {
  return {
    id: 1,
    artist_id: 1,
    artist_name: 'Alice',
    nickname: '访客',
    content: '你好',
    status: 'pending',
    created_at: '2026-08-01 10:00',
    ...overrides
  }
}

beforeEach(() => {
  h.getStats.mockReset().mockResolvedValue({ artistCount: 1, orderCount: 0, activeOrders: 0 })
  h.getArtists.mockReset().mockResolvedValue([{ id: 1, name: 'Alice', subdomain: 'alice' }])
  h.getMessages.mockReset().mockResolvedValue([messageRow()])
  h.deleteMessage.mockReset().mockResolvedValue({})
  h.confirm.mockReset().mockResolvedValue('confirm')
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('AdminDashboard 留言加载三态（P1-B）', () => {
  it('加载失败 → 错误横幅 + 重试按钮，不显示「暂无留言」空态', async () => {
    h.getMessages.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPage()
    await flushPromises()

    expect(h.getMessages).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.load-error-banner').exists()).toBe(true)
    expect(wrapper.find('.load-error-banner').text()).toContain('common.networkError')
    expect(wrapper.find('.gb-table-wrap').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ElEmpty' }).exists()).toBe(false)
  })

  it('点击重试 → 重新请求；成功后横幅消失并渲染行 + data-label', async () => {
    h.getMessages
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([messageRow()])
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.load-error-banner').exists()).toBe(true)

    await wrapper.find('.load-error-banner button').trigger('click')
    await flushPromises()

    expect(h.getMessages).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.load-error-banner').exists()).toBe(false)
    const rows = wrapper.findAll('.gb-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('.gb-col--artist').attributes('data-label')).toBe('admin.guestbook.colArtist')
    expect(rows[0].find('.gb-col--content').attributes('data-label')).toBe('admin.guestbook.colContent')
  })

  it('成功且为空 → 显示「暂无留言」空态（非失败态）', async () => {
    h.getMessages.mockResolvedValueOnce([])
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.load-error-banner').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ElEmpty' }).exists()).toBe(true)
  })

  it('筛选失败 → 清旧数据（不保留上一筛选结果）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.gb-row')).toHaveLength(1)

    h.getMessages.mockRejectedValueOnce(new Error('filter boom'))
    await wrapper.getComponent({ name: 'ElSelect' }).vm.$emit('change')
    await flushPromises()

    expect(wrapper.find('.load-error-banner').exists()).toBe(true)
    expect(wrapper.findAll('.gb-row')).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'ElEmpty' }).exists()).toBe(false)
  })
})
