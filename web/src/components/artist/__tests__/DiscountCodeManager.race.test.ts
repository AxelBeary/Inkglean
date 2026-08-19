// DiscountCodeManager 启停连点乱序 PUT 测试（G-2 / R-22）
// 覆盖：在途时开关 disabled（不重复发送）；乱序响应以最后一次点击为准（请求序号守卫）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElSwitch, ElMessage } from 'element-plus'

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

interface DiscountVm {
  enabled: boolean
  toggling: boolean
  codeTogglingIds: Set<number>
}

const h = vi.hoisted(() => ({
  getDiscountCodes: vi.fn(),
  toggleDiscount: vi.fn(),
  updateDiscountCode: vi.fn(),
  deleteDiscountCode: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getDiscountCodes: h.getDiscountCodes,
    toggleDiscount: h.toggleDiscount,
    updateDiscountCode: h.updateDiscountCode,
    deleteDiscountCode: h.deleteDiscountCode
  }
}))

import DiscountCodeManager from '../DiscountCodeManager.vue'

// 真实 ElMessage 会被组件调用，spy 接管避免真实 DOM 消息副作用
const msgSuccess = vi.spyOn(ElMessage, 'success').mockImplementation((() => {}) as unknown as typeof ElMessage.success)
const msgError = vi.spyOn(ElMessage, 'error').mockImplementation((() => {}) as unknown as typeof ElMessage.error)

function mountManager() {
  return mount(DiscountCodeManager, {
    global: {
      plugins: [ElementPlus],
      mocks: {
        $t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: {
        'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
        'el-tooltip': { template: '<span><slot /></span>' },
        'el-popconfirm': { template: '<span><slot /></span>' },
        'el-date-picker': { template: '<div />' },
        'el-empty': { template: '<div />' }
      }
    }
  })
}

beforeEach(() => {
  h.getDiscountCodes.mockReset().mockResolvedValue({ enabled: false, codes: [] })
  h.toggleDiscount.mockReset()
  h.updateDiscountCode.mockReset().mockResolvedValue({})
  h.deleteDiscountCode.mockReset().mockResolvedValue({})
  vi.clearAllMocks()
  msgSuccess.mockClear()
  msgError.mockClear()
})

describe('DiscountCodeManager 启停竞态（G-2）', () => {
  it('在途时开关 disabled；绕过 UI 连点不重复发送且末态以最后一次为准', async () => {
    const pending: Array<(value: boolean) => void> = []
    h.toggleDiscount.mockImplementation(() => new Promise(resolve => { pending.push(resolve) }))

    const wrapper = mountManager()
    await flushPromises()
    const sw = wrapper.findComponent(ElSwitch)

    // 第一次切换（enable=true）→ 在途
    sw.vm.$emit('update:modelValue', true)
    await sw.vm.$emit('change', true)
    await flushPromises()

    // 在途：开关 disabled（UI 层拦截重复点击）
    expect(sw.props('disabled')).toBe(true)

    // 绕过 disabled 模拟连点第二次（enable=true）→ 序号守卫保证末态 = 最后一次
    await sw.vm.$emit('change', true)
    await flushPromises()
    expect(h.toggleDiscount).toHaveBeenCalledTimes(2)

    // 新请求先返回，旧请求后返回（乱序）
    pending[1](true)
    await flushPromises()
    pending[0](false)
    await flushPromises()

    // 末态以最后一次点击为准：enabled=true，且旧响应不弹成功/不覆盖
    const vm = wrapper.vm as unknown as DiscountVm
    expect(vm.enabled).toBe(true)
    expect(msgSuccess).toHaveBeenCalledTimes(1)
    expect(vm.toggling).toBe(false)
  })

  it('切换失败：最新请求报错并回滚开关', async () => {
    h.toggleDiscount.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountManager()
    await flushPromises()
    const sw = wrapper.findComponent(ElSwitch)

    sw.vm.$emit('update:modelValue', true)
    await sw.vm.$emit('change', true)
    await flushPromises()

    expect(msgError).toHaveBeenCalledWith('network')
    const vm = wrapper.vm as unknown as DiscountVm
    expect(vm.enabled).toBe(false)
    expect(vm.toggling).toBe(false)
  })

  it('行级启停：在途按钮 disabled，完成后恢复可点', async () => {
    h.getDiscountCodes.mockResolvedValue({
      enabled: true,
      codes: [{ id: 7, code: 'VIP10', discount_type: 'percent', discount_value: 10, used_count: 0, max_uses: null, expires_at: null, enabled: false }]
    })
    let resolveCode: ((value: unknown) => void) | undefined
    h.updateDiscountCode.mockReturnValueOnce(new Promise(resolve => { resolveCode = resolve }))

    const wrapper = mountManager()
    await flushPromises()

    const enableBtn = wrapper.findAll('button').find(b => b.text().includes('discount.enable'))
    await enableBtn!.trigger('click')
    await flushPromises()

    // 在途：按钮 disabled
    const vm = wrapper.vm as unknown as DiscountVm
    expect(vm.codeTogglingIds.has(7)).toBe(true)

    resolveCode!({})
    await flushPromises()
    expect(vm.codeTogglingIds.has(7)).toBe(false)
    expect(h.updateDiscountCode).toHaveBeenCalledWith(7, { enabled: true })
  })
})
