// P1-B（813-hunt）：GreetingTable ≤600px 单列布局的数据钩子
// 覆盖：行单元格带 data-label（移动端卡片用 CSS ::before 展示列名）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GreetingTable from '../GreetingTable.vue'

const h = vi.hoisted(() => ({
  getGreetings: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: { getGreetings: h.getGreetings }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
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
  'el-tag': { template: '<span><slot /></span>' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-empty': { template: '<div class="empty-stub" />' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  h.getGreetings.mockReset().mockResolvedValue([
    { id: 1, text: '早上好 {name}', time_slot: 'morning', is_enabled: 1 }
  ])
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('GreetingTable 响应式数据钩子（P1-B）', () => {
  it('行单元格带 data-label（移动端 CSS ::before 列名来源）', async () => {
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

    const row = wrapper.find('.greeting-row')
    expect(row.find('.g-col--text').attributes('data-label')).toBe('admin.greetingColText')
    expect(row.find('.g-col--slot').attributes('data-label')).toBe('admin.greetingColSlot')
    expect(row.find('.g-col--enabled').attributes('data-label')).toBe('admin.greetingColEnabled')
  })
})
