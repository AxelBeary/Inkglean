// E5 波 4：GreetingTable 深夜档（latenight）数据钩子
// 覆盖：latenight 行时段标签走 admin.slotLatenight 键
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GreetingTable from '../GreetingTable.vue'

const h = vi.hoisted(() => ({
  getGreetings: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: { getGreetings: h.getGreetings }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
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

const mountedWrappers = []

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('GreetingTable 深夜档（E5）', () => {
  it('latenight 行渲染 slotLatenight 标签', async () => {
    h.getGreetings.mockResolvedValue([
      { id: 1, text: '午夜好 {name}', time_slot: 'latenight', is_enabled: 1, special_day_id: null }
    ])
    const wrapper = mount(GreetingTable, {
      props: { artistId: null },
      global: {
        mocks: { $t: (key) => key },
        stubs: EP_STUBS,
        directives: { loading: {} }
      }
    })
    mountedWrappers.push(wrapper)
    await flushPromises()

    const row = wrapper.find('.greeting-row')
    expect(row.find('.g-col--slot').text()).toBe('admin.slotLatenight')
  })
})
