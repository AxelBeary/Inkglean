// 定金台账挂载测试（812 工具波 B ⑥）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DepositLedger from '../DepositLedger.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
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

function mountDeposit() {
  return mount(DepositLedger, {
    global: {
      mocks: {
        $t: (key) => key,
        $tm: () => []
      }
    }
  })
}

describe('DepositLedger 定金台账', () => {
  it('挂载后为空台账，顶部两数均为 ¥0.00', () => {
    const wrapper = mountDeposit()
    expect(wrapper.find('.dp-empty').exists()).toBe(true)
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥0.00')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥0.00')
  })

  it('记一笔后按分口径入账并写入 localStorage', async () => {
    const wrapper = mountDeposit()
    wrapper.vm.form.name = '小林'
    wrapper.vm.form.amountYuan = 128.5
    wrapper.vm.form.status = 'pending'
    wrapper.vm.form.date = '2026-08-12'
    wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.dp-row')).toHaveLength(1)
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥128.50')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥0.00')

    const saved = JSON.parse(localStorage.getItem('huiyue_deposit_ledger'))
    expect(saved[0].amountCents).toBe(12850)
    expect(saved[0].status).toBe('pending')
    expect(saved[0].name).toBe('小林')
  })

  it('状态切换后顶部两数重算并持久化', async () => {
    const wrapper = mountDeposit()
    wrapper.vm.form.name = '小林'
    wrapper.vm.form.amountYuan = 100
    wrapper.vm.form.status = 'pending'
    wrapper.vm.submit()
    await wrapper.vm.$nextTick()

    await wrapper.find('.dp-row .dp-switch').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-stat-value')[0].text()).toBe('¥0.00')
    expect(wrapper.findAll('.dp-stat-value')[1].text()).toBe('¥100.00')

    const saved = JSON.parse(localStorage.getItem('huiyue_deposit_ledger'))
    expect(saved[0].status).toBe('received')
  })

  it('删除记录后恢复空台账', async () => {
    const wrapper = mountDeposit()
    wrapper.vm.form.name = '阿明'
    wrapper.vm.form.amountYuan = 50
    wrapper.vm.submit()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-row')).toHaveLength(1)

    await wrapper.find('.dp-mini-btn').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.dp-row')).toHaveLength(0)
    expect(wrapper.find('.dp-empty').exists()).toBe(true)
  })
})
