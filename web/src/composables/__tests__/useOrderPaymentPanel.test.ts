// useOrderPaymentPanel 节点快捷收款校验测试（审计 🔴-3，红线 4：前端不得比后端收紧）
// 覆盖：超额不再前端拦截（与后端 addPayment 对齐，允许多收压尾款）；<= 0 仍拦截
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { ref } from 'vue'
import type { OrderInstallment } from '../../api/types'

// ─── Spies（vi.mock 自动提升，经 vi.hoisted 暴露） ───
const h = vi.hoisted(() => ({
  addPayment: vi.fn(() => Promise.resolve({})),
  loadPayments: vi.fn(() => Promise.resolve()),
  warn: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: h.warn, success: h.success, error: h.error },
  ElMessageBox: { confirm: () => Promise.resolve() }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../useOrderPayments.js', () => ({
  useOrderPayments: () => ({
    payments: ref([]),
    loading: ref(false),
    submitting: ref(false),
    loadPayments: h.loadPayments,
    addPayment: h.addPayment,
    revokePayment: vi.fn(() => Promise.resolve())
  })
}))

import { useOrderPaymentPanel } from '../useOrderPaymentPanel'

function setup(overrides: Record<string, unknown> = {}) {
  const order = ref({
    paidTotalCents: 50000,
    finalPriceCents: 100000,
    remainingCents: 50000,
    installments: [
      { id: 7, name: '线稿', amountCents: 40000, paidCents: 30000, remainingCents: 10000, status: 'partial' }
    ],
    ...overrides
  })
  const onRefresh = vi.fn(() => Promise.resolve())
  type PanelOpts = Parameters<typeof useOrderPaymentPanel>[0]
  const ctx = useOrderPaymentPanel({
    order: order as unknown as PanelOpts['order'],
    routeId: '806' as unknown as PanelOpts['routeId'],
    onRefresh
  })
  return { order, onRefresh, ...ctx }
}

describe('节点快捷收款校验（审计 🔴-3）', () => {
  beforeEach(() => {
    h.addPayment.mockClear()
    h.loadPayments.mockClear()
    h.warn.mockClear()
    h.success.mockClear()
    h.error.mockClear()
  })

  it('TC-NP-01: 超额输入不再被前端拦截（与后端 addPayment 对齐）', async () => {
    const panel = setup()
    // 节点剩余 10000 分，输入 150 元 = 15000 分（超额）
    panel.openNodePayDialog({ id: 7, name: '线稿', remainingCents: 10000 } as unknown as OrderInstallment)
    panel.nodePayForm.value.amountYuan = 150
    await panel.submitNodePayment()

    expect(h.warn).not.toHaveBeenCalled()
    expect(h.addPayment).toHaveBeenCalledTimes(1)
    const [routeId, payload] = (h.addPayment as unknown as Mock).mock.calls[0]
    expect(routeId).toBe('806')
    expect(payload.amountCents).toBe(15000) // 超额照传，后端决定（多收压尾款）
    expect(payload.installmentId).toBe(7)
  })

  it('TC-NP-02: <= 0 仍被前端拦截（保留与后端一致的合法性子集）', async () => {
    const panel = setup()
    panel.openNodePayDialog({ id: 7, name: '线稿', remainingCents: 10000 } as unknown as OrderInstallment)
    panel.nodePayForm.value.amountYuan = 0
    await panel.submitNodePayment()

    expect(h.warn).toHaveBeenCalledTimes(1)
    expect(h.addPayment).not.toHaveBeenCalled()
  })

  it('TC-NP-03: 未打开弹窗时提交直接返回（防御）', async () => {
    const panel = setup()
    panel.nodePayForm.value.amountYuan = 100
    await panel.submitNodePayment()
    expect(h.addPayment).not.toHaveBeenCalled()
  })
})
