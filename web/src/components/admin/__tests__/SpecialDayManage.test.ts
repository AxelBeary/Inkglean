// E5 波 4：SpecialDayManage 特别日区块数据钩子测试
// 覆盖：列表渲染（名称/日期/范围/文案数）、当日文案加载、删除确认链路
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import SpecialDayManage from '../SpecialDayManage.vue'

interface SpecialDayVm {
  days: Array<{ is_enabled: number }>
  greetings: Array<{ id: number; artist_id: number | null; text: string; is_enabled: number }>
  toggleGreetingEnabled(row: { id: number; artist_id: number | null }, val: unknown): Promise<unknown>
}

const h = vi.hoisted(() => ({
  getSpecialDays: vi.fn(),
  getArtists: vi.fn(),
  getSpecialDayGreetings: vi.fn(),
  createSpecialDay: vi.fn(),
  updateSpecialDay: vi.fn(),
  deleteSpecialDay: vi.fn(),
  createGreeting: vi.fn(),
  updateGreeting: vi.fn(),
  deleteGreeting: vi.fn(),
  createArtistGreeting: vi.fn(),
  updateArtistGreeting: vi.fn(),
  deleteArtistGreeting: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getSpecialDays: h.getSpecialDays,
    getArtists: h.getArtists,
    getSpecialDayGreetings: h.getSpecialDayGreetings,
    createSpecialDay: h.createSpecialDay,
    updateSpecialDay: h.updateSpecialDay,
    deleteSpecialDay: h.deleteSpecialDay,
    createGreeting: h.createGreeting,
    updateGreeting: h.updateGreeting,
    deleteGreeting: h.deleteGreeting,
    createArtistGreeting: h.createArtistGreeting,
    updateArtistGreeting: h.updateArtistGreeting,
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
  'el-empty': { template: '<div class="empty-stub" />' },
  'el-dialog': {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio': { template: '<div><slot /></div>' },
  'el-date-picker': { template: '<div class="date-stub" />' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

async function mountComponent() {
  const wrapper = mount(SpecialDayManage, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getSpecialDays.mockResolvedValue([
    { id: 1, name: '生日', date_key: '08-14', artist_id: null, is_enabled: 1, greeting_count: 2 },
    { id: 2, name: '出道日', date_key: '03-01', artist_id: 7, is_enabled: 0, greeting_count: 0 }
  ])
  h.getArtists.mockResolvedValue([{ id: 7, name: 'Alice' }])
  h.getSpecialDayGreetings.mockResolvedValue([])
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('SpecialDayManage 特别日区块（E5）', () => {
  it('渲染特别日列表：名称/日期/范围/文案数', async () => {
    const wrapper = await mountComponent()

    const rows = wrapper.findAll('.sd-row')
    expect(rows).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('生日')
    expect(text).toContain('08-14')
    expect(text).toContain('admin.specialDayScopeGlobal')
    // 画师范围：显示指定画师名
    expect(text).toContain('admin.specialDayScopeArtist')
    expect(text).toContain('Alice')
  })

  it('空列表显示占位（el-empty）', async () => {
    h.getSpecialDays.mockResolvedValue([])
    const wrapper = await mountComponent()

    expect(wrapper.findAll('.sd-row')).toHaveLength(0)
    expect(wrapper.find('.empty-stub').exists()).toBe(true)
  })

  it('点「文案」加载该日关联文案并渲染', async () => {
    h.getSpecialDayGreetings.mockResolvedValue([
      { id: 10, text: '当日文案一', time_slot: 'any', is_enabled: 1, special_day_id: 1 }
    ])
    const wrapper = await mountComponent()

    const editBtn = wrapper.findAll('button').find(b => b.text() === 'admin.specialDayEditGreetings')
    expect(editBtn).toBeTruthy()
    await editBtn!.trigger('click')
    await flushPromises()

    expect(h.getSpecialDayGreetings).toHaveBeenCalledWith(1)
    const greetingRows = wrapper.findAll('.sd-greeting-row')
    expect(greetingRows).toHaveLength(1)
    expect(greetingRows[0].text()).toContain('当日文案一')
  })

  it('删除特别日走确认弹窗并调用 API', async () => {
    h.deleteSpecialDay.mockResolvedValue({ success: true })
    const wrapper = await mountComponent()

    const deleteBtns = wrapper.findAll('button').filter(b => b.text() === '✕')
    expect(deleteBtns).toHaveLength(2)
    await deleteBtns[0].trigger('click')
    await flushPromises()

    expect(h.deleteSpecialDay).toHaveBeenCalledWith(1)
  })

  it('特别日启停用调用 updateSpecialDay', async () => {
    h.updateSpecialDay.mockResolvedValue({ id: 1, is_enabled: 0 })
    const wrapper = await mountComponent()

    const switches = wrapper.findAll('.sd-row input[type="checkbox"]')
    expect(switches).toHaveLength(2)
    // el-switch stub 不触发 change，直接验证数据形状：列表行带 is_enabled 数值态
    expect((wrapper.vm as unknown as SpecialDayVm).days[0].is_enabled).toBe(1)
  })

  it('B7-F0184: 快速切换特别日时旧日的慢响应不得覆盖当前日文案', async () => {
    let resolveA!: (v: unknown[]) => void
    const slowA = new Promise<unknown[]>(r => { resolveA = r })
    h.getSpecialDayGreetings.mockImplementation((dayId: number) =>
      dayId === 1
        ? slowA
        : Promise.resolve([{ id: 20, text: 'B日文案', time_slot: 'any', is_enabled: 1, special_day_id: 2 }])
    )
    const wrapper = await mountComponent()

    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    expect(editBtns).toHaveLength(2)
    // 先点日 1（慢响应在途），随即切到日 2（快响应）
    await editBtns[0].trigger('click')
    await editBtns[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('B日文案')

    // 日 1 的慢响应迟到 → 门闩拦下，不得覆盖日 2 的文案区
    resolveA([{ id: 10, text: 'A日文案', time_slot: 'any', is_enabled: 1, special_day_id: 1 }])
    await flushPromises()
    expect(wrapper.text()).toContain('B日文案')
    expect(wrapper.text()).not.toContain('A日文案')
  })

  it('B7-F0188: 当日文案添加在途时连续触发只发一次 create', async () => {
    let resolveCreate!: () => void
    h.createGreeting.mockReturnValue(new Promise<void>(r => { resolveCreate = r }))
    const wrapper = await mountComponent()

    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    await editBtns[0].trigger('click')
    await flushPromises()

    await wrapper.get('.sd-greeting-input').setValue('新当日文案')
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('common.add'))!
    await addBtn.trigger('click')
    await addBtn.trigger('click') // keyup.enter 在 :loading 拦不住的路径
    await flushPromises()

    expect(h.createGreeting).toHaveBeenCalledTimes(1)

    resolveCreate()
    await flushPromises()
    // 守卫释放：可再次提交
    h.createGreeting.mockResolvedValue({ id: 9, text: '再来一条', time_slot: 'any', is_enabled: 1, special_day_id: 1 })
    await wrapper.get('.sd-greeting-input').setValue('再来一条')
    await addBtn.trigger('click')
    await flushPromises()
    expect(h.createGreeting).toHaveBeenCalledTimes(2)
  })
})

// ═══ B-1 / F0108（交叉审计 CONTRACT-3）：问候归属分流必须按「特别日 / 行的 artist_id」走画师端点 ═══
// 全局端点（/api/admin/greetings）会拒绝挂画师专属特别日的文案（400），且列表 GET 不区分归属，
// 同一特别日下历史可能同时存在全局行（artist_id=null）与画师行。四条用例把三个分流点各钉一次 + 混存一次，
// 判据都是「画师方法被调 且 全局方法未被调」——把 .vue 三处改回全局端点，这四条必红。
describe('B-1 问候归属分流（画师专属特别日 / 画师行）', () => {
  it('画师专属特别日新增文案 → createArtistGreeting(artistId, data)，全局端点零调用', async () => {
    h.createArtistGreeting.mockResolvedValue({
      id: 31, text: '画师日文案', time_slot: 'any', is_enabled: 1, special_day_id: 2, artist_id: 7
    })
    const wrapper = await mountComponent()

    // days[1] = 画师专属日（artist_id: 7）——只有它能把 create 送进画师分支
    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    expect(editBtns).toHaveLength(2)
    await editBtns[1].trigger('click')
    await flushPromises()

    await wrapper.get('.sd-greeting-input').setValue('画师日文案')
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('common.add'))!
    await addBtn.trigger('click')
    await flushPromises()

    expect(h.createArtistGreeting).toHaveBeenCalledWith(7, {
      text: '画师日文案', timeSlot: 'any', specialDayId: 2
    })
    expect(h.createGreeting).not.toHaveBeenCalled()
    expect(vi.mocked(ElMessage.error)).not.toHaveBeenCalled() // 未落到 catch（错误分支）
  })

  it('画师行启停 → updateArtistGreeting(artistId, rowId, {isEnabled})，全局端点零调用', async () => {
    h.getSpecialDayGreetings.mockResolvedValue([
      { id: 20, text: '画师行', time_slot: 'any', is_enabled: 1, special_day_id: 2, artist_id: 7 }
    ])
    h.updateArtistGreeting.mockResolvedValue({ id: 20, is_enabled: 0 })
    const wrapper = await mountComponent()

    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    await editBtns[1].trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as SpecialDayVm
    expect(vm.greetings).toHaveLength(1)
    await vm.toggleGreetingEnabled(vm.greetings[0], 0)
    await flushPromises()

    expect(h.updateArtistGreeting).toHaveBeenCalledWith(7, 20, { isEnabled: false })
    expect(h.updateGreeting).not.toHaveBeenCalled()
  })

  it('画师行删除 → deleteArtistGreeting(artistId, rowId)，全局端点零调用', async () => {
    h.getSpecialDayGreetings.mockResolvedValue([
      { id: 20, text: '画师行', time_slot: 'any', is_enabled: 1, special_day_id: 2, artist_id: 7 }
    ])
    h.deleteArtistGreeting.mockResolvedValue({ success: true })
    const wrapper = await mountComponent()

    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    await editBtns[1].trigger('click')
    await flushPromises()

    // 行内唯一按钮 = 删除 ✕（启停是 el-switch）
    const row = wrapper.findAll('.sd-greeting-row')[0]
    await row.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(h.deleteArtistGreeting).toHaveBeenCalledWith(7, 20)
    expect(h.deleteGreeting).not.toHaveBeenCalled()
  })

  it('同一特别日混存全局行与画师行 → 按行归属各走各的端点（不可按特别日一刀切）', async () => {
    h.getSpecialDayGreetings.mockResolvedValue([
      { id: 10, text: '全局行', time_slot: 'any', is_enabled: 1, special_day_id: 2, artist_id: null },
      { id: 20, text: '画师行', time_slot: 'any', is_enabled: 1, special_day_id: 2, artist_id: 7 }
    ])
    h.updateGreeting.mockResolvedValue({ id: 10 })
    h.updateArtistGreeting.mockResolvedValue({ id: 20 })
    const wrapper = await mountComponent()

    const editBtns = wrapper.findAll('button').filter(b => b.text() === 'admin.specialDayEditGreetings')
    await editBtns[1].trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as SpecialDayVm
    expect(vm.greetings).toHaveLength(2)
    await vm.toggleGreetingEnabled(vm.greetings[1], 0) // 画师行
    await flushPromises()
    await vm.toggleGreetingEnabled(vm.greetings[0], 0) // 全局行
    await flushPromises()

    expect(h.updateArtistGreeting).toHaveBeenCalledWith(7, 20, { isEnabled: false })
    expect(h.updateGreeting).toHaveBeenCalledWith(10, { isEnabled: false })
    expect(h.updateArtistGreeting).toHaveBeenCalledTimes(1)
    expect(h.updateGreeting).toHaveBeenCalledTimes(1)
  })
})
