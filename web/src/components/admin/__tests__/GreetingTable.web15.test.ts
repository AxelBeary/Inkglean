// WEB-15: GreetingTable artistId prop 变化时重新加载测试
// 覆盖：父组件切换画师时 load() 被重新调用，不再显示上一个画师的问候语
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GreetingTable from '../GreetingTable.vue'

const h = vi.hoisted(() => ({
  getGreetings: vi.fn(),
  getArtistGreetings: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getGreetings: h.getGreetings,
    getArtistGreetings: h.getArtistGreetings,
    createGreeting: vi.fn(),
    createArtistGreeting: vi.fn(),
    updateGreeting: vi.fn(),
    updateArtistGreeting: vi.fn(),
    deleteGreeting: vi.fn(),
    deleteArtistGreeting: vi.fn()
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

const EP_STUBS = {
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-button': {
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-tag': { template: '<span class="tag-stub"><slot /></span>' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-empty': { template: '<div class="empty-stub" />' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  h.getGreetings.mockReset()
  h.getArtistGreetings.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('GreetingTable WEB-15 artistId watch', () => {
  it('artistId 从 null 切换到数字时重新加载（调用 getArtistGreetings）', async () => {
    h.getGreetings.mockResolvedValue([
      { id: 1, text: '通用问候', time_slot: 'any', is_enabled: 1, special_day_id: null }
    ])
    h.getArtistGreetings.mockResolvedValue([
      { id: 10, text: '画师A专属', time_slot: 'morning', is_enabled: 1, special_day_id: null }
    ])

    const wrapper = mount(GreetingTable, {
      props: { artistId: null },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    // 初始加载：通用库
    expect(h.getGreetings).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('通用问候')

    // 切换 artistId → 触发 watch → 重新加载画师专属库
    await wrapper.setProps({ artistId: 42 })
    await flushPromises()

    expect(h.getArtistGreetings).toHaveBeenCalledWith(42)
    expect(wrapper.text()).toContain('画师A专属')
    expect(wrapper.text()).not.toContain('通用问候')
  })

  it('artistId 从数字 A 切换到数字 B 时重新加载', async () => {
    h.getArtistGreetings
      .mockResolvedValueOnce([
        { id: 10, text: '画师A专属', time_slot: 'morning', is_enabled: 1, special_day_id: null }
      ])
      .mockResolvedValueOnce([
        { id: 20, text: '画师B专属', time_slot: 'evening', is_enabled: 1, special_day_id: null }
      ])

    const wrapper = mount(GreetingTable, {
      props: { artistId: 1 },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    expect(h.getArtistGreetings).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('画师A专属')

    // 切换到画师 B
    await wrapper.setProps({ artistId: 2 })
    await flushPromises()

    expect(h.getArtistGreetings).toHaveBeenCalledWith(2)
    expect(wrapper.text()).toContain('画师B专属')
    expect(wrapper.text()).not.toContain('画师A专属')
  })

  it('artistId 从数字切换回 null 时重新加载通用库', async () => {
    h.getArtistGreetings.mockResolvedValue([
      { id: 10, text: '画师A专属', time_slot: 'morning', is_enabled: 1, special_day_id: null }
    ])
    h.getGreetings.mockResolvedValue([
      { id: 1, text: '通用问候', time_slot: 'any', is_enabled: 1, special_day_id: null }
    ])

    const wrapper = mount(GreetingTable, {
      props: { artistId: 1 },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('画师A专属')

    // 切换回通用库
    await wrapper.setProps({ artistId: null })
    await flushPromises()

    expect(h.getGreetings).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('通用问候')
  })
})
