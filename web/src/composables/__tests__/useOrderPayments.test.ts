// useOrderPayments submitting 状态测试（R-4 撤销防连击依托）+ D-2 幂等键（R-9）
// 覆盖：收款/撤销请求在途时 submitting=true、try/finally 结束后恢复 false（含失败路径）；
//       每次提交意图带 idempotency-key header，同一次提交重试复用同 key，成功后换新 key
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PaymentRow } from '../../api/types'

const h = vi.hoisted(() => ({
  addPayment: vi.fn(),
  getPayments: vi.fn(() => Promise.resolve({ payments: [] }))
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    getPayments: (...args: unknown[]) => h.getPayments(...(args as [])),
    addPayment: (...args: unknown[]) => h.addPayment(...args)
  }
}))

import { useOrderPayments } from '../useOrderPayments'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T = unknown>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined
  let reject: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve: resolve!, reject: reject! }
}

describe('useOrderPayments submitting（R-4）', () => {
  beforeEach(() => {
    h.addPayment.mockReset()
    h.getPayments.mockReset()
    h.getPayments.mockResolvedValue({ payments: [] })
  })

  it('addPayment 在途 submitting=true，完成后恢复 false', async () => {
    const d = deferred()
    h.addPayment.mockReturnValueOnce(d.promise)
    const payments = useOrderPayments()

    const req = payments.addPayment('806' as unknown as number, { amountCents: 1000, note: '定金', installmentId: null })
    expect(payments.submitting.value).toBe(true)

    d.resolve({})
    await req
    expect(payments.submitting.value).toBe(false)
  })

  it('revokePayment 在途 submitting=true，失败后 finally 也恢复 false', async () => {
    const d = deferred()
    h.addPayment.mockReturnValueOnce(d.promise)
    const payments = useOrderPayments()

    const req = payments.revokePayment('806' as unknown as number, { id: 7, amount_cents: 1000 } as unknown as PaymentRow)
    expect(payments.submitting.value).toBe(true)

    d.reject(new Error('boom'))
    await expect(req).rejects.toThrow('boom')
    expect(payments.submitting.value).toBe(false)
  })

  it('addPayment 每次提交带 idempotency-key header（UUID 格式）', async () => {
    h.addPayment.mockResolvedValue({})
    const payments = useOrderPayments()
    await payments.addPayment('806' as unknown as number, { amountCents: 1000, note: '定金', installmentId: null })
    const options = h.addPayment.mock.calls[0][2]
    expect(options.headers['idempotency-key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('同一提交失败后重试复用同 key（错误响应不换 key）', async () => {
    h.addPayment.mockRejectedValueOnce(new Error('boom'))
    h.addPayment.mockResolvedValueOnce({})
    const payments = useOrderPayments()
    await expect(payments.addPayment('806' as unknown as number, { amountCents: 1000, note: '定金', installmentId: null }))
      .rejects.toThrow('boom')
    await payments.addPayment('806' as unknown as number, { amountCents: 1000, note: '定金', installmentId: null })
    const key1 = h.addPayment.mock.calls[0][2].headers['idempotency-key']
    const key2 = h.addPayment.mock.calls[1][2].headers['idempotency-key']
    expect(key1).toBe(key2)
  })

  it('提交成功后下一次提交换新 key', async () => {
    h.addPayment.mockResolvedValue({})
    const payments = useOrderPayments()
    await payments.addPayment('806' as unknown as number, { amountCents: 1000, note: '定金', installmentId: null })
    await payments.addPayment('806' as unknown as number, { amountCents: 2000, note: '尾款', installmentId: null })
    const key1 = h.addPayment.mock.calls[0][2].headers['idempotency-key']
    const key2 = h.addPayment.mock.calls[1][2].headers['idempotency-key']
    expect(key1).not.toBe(key2)
  })

  it('revokePayment 同样带 idempotency-key header', async () => {
    h.addPayment.mockResolvedValue({})
    const payments = useOrderPayments()
    await payments.revokePayment('806' as unknown as number, { id: 7, amount_cents: 1000 } as unknown as PaymentRow)
    const options = h.addPayment.mock.calls[0][2]
    expect(options.headers['idempotency-key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
