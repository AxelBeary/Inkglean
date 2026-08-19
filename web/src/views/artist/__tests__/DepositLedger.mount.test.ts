// 定金台账挂载测试（812 工具波 B ⑥）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DepositLedger from '../DepositLedger.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn(() => Promise.resolve('confirm'))
  }
}))

beforeEach(() => {
  localStorage.clear()
})

interface LedgerRow {
  amountCents: number
  status: string
  name: string
}

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface DepositLedgerVM {
  form: {
    name: string
    amountYuan: number
    status: string
    date: string
  }
  submitting: boolean
  submit: () => void
}

function mountDeposit() {
  const wrapper = mount(DepositLedger, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $tm: () => []
      }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as DepositLedgerVM }
}

describe('DepositLedger 定金台账', () => {
  it('挂载后为空台账，顶部两数均为 ¥0.00', () => {
    const { wrapper } = mountDeposit()
    expect(wrapper.find('.dp-empty').exists()).toBe(true)
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥0.00')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥0.00')
  })

  it('记一笔后按分口径入账并写入 localStorage', async () => {
    const { wrapper, vm } = mountDeposit()
    vm.form.name = '小林'
    vm.form.amountYuan = 128.5
    vm.form.status = 'pending'
    vm.form.date = '2026-08-12'
    vm.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.dp-row')).toHaveLength(1)
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥128.50')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥0.00')

    const saved = JSON.parse(localStorage.getItem('huiyue_deposit_ledger')!) as LedgerRow[]
    expect(saved[0].amountCents).toBe(12850)
    expect(saved[0].status).toBe('pending')
    expect(saved[0].name).toBe('小林')
  })

  it('状态切换后顶部两数重算并持久化', async () => {
    const { wrapper, vm } = mountDeposit()
    vm.form.name = '小林'
    vm.form.amountYuan = 100
    vm.form.status = 'pending'
    vm.submit()
    await wrapper.vm.$nextTick()

    await wrapper.find('.dp-row .dp-switch').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥0.00')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥100.00')

    const saved = JSON.parse(localStorage.getItem('huiyue_deposit_ledger')!) as LedgerRow[]
    expect(saved[0].status).toBe('received')
  })

  it('删除记录后恢复空台账', async () => {
    const { wrapper, vm } = mountDeposit()
    vm.form.name = '阿明'
    vm.form.amountYuan = 50
    vm.submit()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-row')).toHaveLength(1)

    await wrapper.find('.dp-mini-btn').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-row')).toHaveLength(0)
    expect(wrapper.find('.dp-empty').exists()).toBe(true)
  })

  it('a1-17: submitting 在途时二次 submit 被拦截，且按钮禁用', async () => {
    const { wrapper, vm } = mountDeposit()
    vm.form.name = '小林'
    vm.form.amountYuan = 100

    // 模拟在途（第一次提交尚未结束）
    vm.submitting = true
    vm.submit()
    expect(wrapper.findAll('.dp-row')).toHaveLength(0)
    await wrapper.vm.$nextTick()
    // b1-C12 CSS 收敛后主按钮类名 btn-primary dp-btn（原 dp-btn--primary 已并入公共类）
    expect(wrapper.find('button.dp-btn').attributes('disabled')).toBeDefined()

    // 提交期结束可正常记账
    vm.submitting = false
    vm.submit()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-row')).toHaveLength(1)
  })
})
