// useOrderPayments submitting 状态测试（R-4 撤销防连击依托）
// 覆盖：收款/撤销请求在途时 submitting=true、try/finally 结束后恢复 false（含失败路径）
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  addPayment: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    getPayments: vi.fn(() => Promise.resolve({ payments: [] })),
    addPayment: (...args) => h.addPayment(...args)
  }
}))

import { useOrderPayments } from '../useOrderPayments.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useOrderPayments submitting（R-4）', () => {
  beforeEach(() => {
    h.addPayment.mockReset()
  })

  it('addPayment 在途 submitting=true，完成后恢复 false', async () => {
    const d = deferred()
    h.addPayment.mockReturnValueOnce(d.promise)
    const payments = useOrderPayments()

    const req = payments.addPayment('806', { amountCents: 1000, note: '定金', installmentId: null })
    expect(payments.submitting.value).toBe(true)

    d.resolve({})
    await req
    expect(payments.submitting.value).toBe(false)
  })

  it('revokePayment 在途 submitting=true，失败后 finally 也恢复 false', async () => {
    const d = deferred()
    h.addPayment.mockReturnValueOnce(d.promise)
    const payments = useOrderPayments()

    const req = payments.revokePayment('806', { id: 7, amount_cents: 1000 })
    expect(payments.submitting.value).toBe(true)

    d.reject(new Error('boom'))
    await expect(req).rejects.toThrow('boom')
    expect(payments.submitting.value).toBe(false)
  })
})
