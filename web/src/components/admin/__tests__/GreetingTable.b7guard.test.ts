// B7-F0185/F0187：GreetingTable 异步门闩与在途守卫
// 覆盖：artistId 快切时旧画师的慢响应不得覆盖当前列表；添加在途时连续回车/点击只发一次 create
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GreetingTable from '../GreetingTable.vue'

const h = vi.hoisted(() => ({
  getGreetings: vi.fn(),
  getArtistGreetings: vi.fn(),
  createGreeting: vi.fn(),
  createArtistGreeting: vi.fn(),
  updateGreeting: vi.fn(),
  updateArtistGreeting: vi.fn(),
  deleteGreeting: vi.fn(),
  deleteArtistGreeting: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getGreetings: h.getGreetings,
    getArtistGreetings: h.getArtistGreetings,
    createGreeting: h.createGreeting,
    createArtistGreeting: h.createArtistGreeting,
    updateGreeting: h.updateGreeting,
    updateArtistGreeting: h.updateArtistGreeting,
    deleteGreeting: h.deleteGreeting,
    deleteArtistGreeting: h.deleteArtistGreeting
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

function mountTable(artistId: number | null) {
  const wrapper = mount(GreetingTable, {
    props: { artistId },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('B7 GreetingTable 异步门闩与在途守卫', () => {
  it('F0185: 快切画师时旧画师的慢响应不得覆盖当前画师列表', async () => {
    let resolveA!: (v: unknown[]) => void
    const slowA = new Promise<unknown[]>(r => { resolveA = r })
    h.getArtistGreetings.mockImplementation((artistId: number) =>
      artistId === 1
        ? slowA
        : Promise.resolve([{ id: 20, text: 'B画师专属', time_slot: 'evening', is_enabled: 1, special_day_id: null }])
    )

    const wrapper = mountTable(1)
    // A 的请求在途（慢）；不等它返回就切到画师 B
    await wrapper.setProps({ artistId: 2 })
    await flushPromises()

    // B 的快响应先落地 → 当前显示 B 的列表
    expect(wrapper.text()).toContain('B画师专属')

    // A 的慢响应迟到 → 必须被门闩拦下，不得覆盖 B 的列表
    resolveA([{ id: 10, text: 'A画师专属', time_slot: 'morning', is_enabled: 1, special_day_id: null }])
    await flushPromises()
    expect(wrapper.text()).toContain('B画师专属')
    expect(wrapper.text()).not.toContain('A画师专属')
  })

  it('F0187: 添加在途时连续点击/回车只发一次 create；完成后守卫释放', async () => {
    h.getGreetings.mockResolvedValue([])
    let resolveCreate!: () => void
    h.createGreeting.mockReturnValue(new Promise<void>(r => { resolveCreate = r }))

    const wrapper = mountTable(null)
    await flushPromises()

    await wrapper.get('.greeting-text-input').setValue('新问候语')
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('common.add'))!
    await addBtn.trigger('click')
    await addBtn.trigger('click') // keyup.enter 双触发等价：在途期间再次进入
    await flushPromises()

    expect(h.createGreeting).toHaveBeenCalledTimes(1)

    resolveCreate()
    await flushPromises()
    // 完成后守卫释放：重新输入可再次提交
    h.createGreeting.mockResolvedValue({ id: 9, text: '再来一条', time_slot: 'any', is_enabled: 1, special_day_id: null })
    await wrapper.get('.greeting-text-input').setValue('再来一条')
    await addBtn.trigger('click')
    await flushPromises()
    expect(h.createGreeting).toHaveBeenCalledTimes(2)
  })
})
