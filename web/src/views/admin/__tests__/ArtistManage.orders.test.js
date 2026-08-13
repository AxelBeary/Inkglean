// P1-B（813-hunt）：ArtistManage 订单弹窗加载三态 + 张冠李戴防护
// 覆盖：打开即清空旧订单；失败 → 错误横幅（不显示空态）；重试成功恢复；
//       请求序号门闩——先发慢响应不覆盖后发结果
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtistManage from '../ArtistManage.vue'

const h = vi.hoisted(() => ({
  getArtists: vi.fn(),
  getArtistOrders: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: h.getArtists,
    getArtistOrders: h.getArtistOrders
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
  ElMessage: {
    success: h.msgSuccess,
    error: h.msgError,
    warning: h.msgWarning
  },
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../ArtistDetailDrawer.vue', () => ({
  default: { name: 'ArtistDetailDrawer', template: '<div />' }
}))

vi.mock('../../../components/artist/visual/CardHead.vue', () => ({
  default: { name: 'CardHead', template: '<div />' }
}))

vi.mock('../../../components/admin/StepUpDialog.vue', () => ({
  default: { name: 'StepUpDialog', template: '<div />' }
}))

const EP_STUBS = {
  'el-button': {
    inheritAttrs: false,
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': {
    template: '<div class="col-stub"><slot :row="{ id: 1, name: \'Alice\', subdomain: \'alice\' }" /></div>'
  },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-input-number': { template: '<div />' },
  'el-dialog': {
    name: 'ElDialog',
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-empty': { name: 'ElEmpty', template: '<div class="empty-stub" />' },
  'el-icon': { template: '<i><slot /></i>' }
}

const mountedWrappers = []

function mountPage() {
  const wrapper = mount(ArtistManage, {
    global: {
      mocks: { $t: (key) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function orderRow(id, artistId) {
  return { id, order_no: `NO-${id}`, artist_id: artistId, status: 'wip' }
}

beforeEach(() => {
  h.getArtists.mockReset().mockResolvedValue([
    { id: 1, name: 'Alice', subdomain: 'alice', qq_number: '10001', isAdmin: true, status: 'open', totp_verified: true },
    { id: 2, name: 'Bob', subdomain: 'bob', qq_number: '10002', isAdmin: false, status: 'open', totp_verified: false }
  ])
  h.getArtistOrders.mockReset().mockResolvedValue({ items: [] })
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
  h.confirm.mockReset().mockResolvedValue('confirm')
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 订单弹窗三态（P1-B）', () => {
  it('打开即清空旧订单并请求；成功渲染数据', async () => {
    const wrapper = mountPage()
    await flushPromises()
    h.getArtistOrders.mockResolvedValueOnce({ items: [orderRow(11, 1)] })

    wrapper.vm.viewOrders({ id: 1, name: 'Alice' })
    expect(wrapper.vm.orders).toEqual([])
    await flushPromises()

    expect(h.getArtistOrders).toHaveBeenCalledWith(1)
    expect(wrapper.vm.orders).toEqual([orderRow(11, 1)])
    expect(wrapper.find('.dialog-stub .table-stub').exists()).toBe(true)
  })

  it('加载失败 → 错误横幅 + 重试按钮；不显示空态与表格', async () => {
    const wrapper = mountPage()
    await flushPromises()
    h.getArtistOrders.mockRejectedValueOnce(new Error('orders boom'))

    wrapper.vm.viewOrders({ id: 1, name: 'Alice' })
    await flushPromises()

    expect(wrapper.find('.dialog-stub .load-error-banner').exists()).toBe(true)
    expect(wrapper.find('.dialog-stub .table-stub').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ElEmpty' }).exists()).toBe(false)
  })

  it('点击重试 → 重新请求；成功后错误态消失', async () => {
    const wrapper = mountPage()
    await flushPromises()
    h.getArtistOrders
      .mockRejectedValueOnce(new Error('orders boom'))
      .mockResolvedValueOnce({ items: [orderRow(22, 1)] })

    wrapper.vm.viewOrders({ id: 1, name: 'Alice' })
    await flushPromises()
    expect(wrapper.find('.dialog-stub .load-error-banner').exists()).toBe(true)

    await wrapper.find('.dialog-stub .load-error-banner button').trigger('click')
    await flushPromises()

    expect(h.getArtistOrders).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.dialog-stub .load-error-banner').exists()).toBe(false)
    expect(wrapper.vm.orders).toEqual([orderRow(22, 1)])
  })

  it('请求序号门闩：先发慢响应不覆盖后发结果（张冠李戴防护）', async () => {
    let resolveSlow
    h.getArtistOrders.mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve }))
    h.getArtistOrders.mockResolvedValueOnce({ items: [orderRow(2, 2)] })
    const wrapper = mountPage()
    await flushPromises()

    wrapper.vm.viewOrders({ id: 1, name: 'Alice' }) // 慢请求（画师1）
    wrapper.vm.viewOrders({ id: 2, name: 'Bob' })   // 快请求（画师2）
    await flushPromises()
    expect(wrapper.vm.orders).toEqual([orderRow(2, 2)])

    resolveSlow({ items: [orderRow(1, 1)] }) // 画师1 的过期响应晚到
    await flushPromises()
    expect(wrapper.vm.orders).toEqual([orderRow(2, 2)])
    expect(wrapper.find('.dialog-stub .load-error-banner').exists()).toBe(false)
  })
})
