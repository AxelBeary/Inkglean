// PaymentPanel 撤销按钮防连击测试（R-4）
// 覆盖：撤销在途（revokeSubmitting=true）时按钮 loading+disabled，恢复后重新可点；
//       负数（退款）流水不显示撤销按钮；点击撤销按钮向父级 emit revoke
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import PaymentPanel from '../PaymentPanel.vue'

function makeProps(overrides = {}) {
  return {
    payments: [
      { id: 1, created_at: '2026-08-01 10:00', amount_cents: 5000, note: '定金' },
      { id: 2, created_at: '2026-08-02 10:00', amount_cents: -1000, note: '撤销' }
    ],
    paymentsLoading: false,
    poolPaidCents: 4000,
    poolFinalCents: 10000,
    poolRemainingCents: 6000,
    poolOverpaidCents: 0,
    poolPercent: 40,
    installmentRefs: [],
    isTerminal: false,
    revokeSubmitting: false,
    ...overrides
  }
}

function mountPanel(overrides = {}) {
  return mount(PaymentPanel, {
    props: makeProps(overrides),
    global: {
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key) => [key]
      },
      stubs: {
        'el-card': { template: '<div><slot /><slot name="header" /></div>' },
        'el-button': {
          name: 'ElButtonStub',
          props: ['disabled', 'loading'],
          template: '<button :disabled="disabled" :loading="loading" v-bind="$attrs"><slot /></button>'
        },
        'el-progress': { template: '<div />' },
        'el-tag': { template: '<span><slot /></span>' }
      }
    }
  })
}

describe('PaymentPanel 撤销防连击（R-4）', () => {
  it('撤销按钮默认可点（无 loading/disabled）', () => {
    const wrapper = mountPanel()
    const buttons = wrapper.findAllComponents({ name: 'ElButtonStub' })
    const btn = buttons.find(b => b.text() === 'orderDetail.payRevoke')
    expect(btn.exists()).toBe(true)
    expect(btn.props('disabled')).toBe(false)
    expect(btn.props('loading')).toBe(false)
  })

  it('revokeSubmitting=true → 撤销按钮 loading+disabled', () => {
    const wrapper = mountPanel({ revokeSubmitting: true })
    const btn = wrapper.findAllComponents({ name: 'ElButtonStub' }).find(b => b.text() === 'orderDetail.payRevoke')
    expect(btn.props('disabled')).toBe(true)
    expect(btn.props('loading')).toBe(true)
  })

  it('请求完成后（revokeSubmitting=false）→ 按钮恢复可点', async () => {
    const wrapper = mountPanel({ revokeSubmitting: true })
    await wrapper.setProps({ revokeSubmitting: false })
    const btn = wrapper.findAllComponents({ name: 'ElButtonStub' }).find(b => b.text() === 'orderDetail.payRevoke')
    expect(btn.props('disabled')).toBe(false)
    expect(btn.props('loading')).toBe(false)
  })

  it('负数（退款）流水不显示撤销按钮', () => {
    const wrapper = mountPanel()
    const revokeBtns = wrapper.findAllComponents({ name: 'ElButtonStub' }).filter(b => b.text() === 'orderDetail.payRevoke')
    expect(revokeBtns).toHaveLength(1) // 只有正数 5000 那笔
  })

  it('点击撤销按钮 → 向父级 emit revoke 并携带该笔流水', async () => {
    const wrapper = mountPanel()
    const btn = wrapper.findAllComponents({ name: 'ElButtonStub' }).find(b => b.text() === 'orderDetail.payRevoke')
    await btn.find('button').trigger('click')
    const emitted = wrapper.emitted('revoke')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toMatchObject({ id: 1, amount_cents: 5000 })
  })
})
