// TASK2-01 前端幂等键生命周期契约：只有载荷冲突才允许换新 key
import { describe, it, expect } from 'vitest'
import { shouldRotateIdempotencyKey, IDEMPOTENCY_ENVELOPE_INVALID } from '../idempotency'

describe('shouldRotateIdempotencyKey（TASK2-01）', () => {
  it('载荷冲突 IDEMPOTENCY_CONFLICT → 换新 key（新提交意图）', () => {
    expect(shouldRotateIdempotencyKey('IDEMPOTENCY_CONFLICT')).toBe(true)
  })

  it('信封解密失败 → 保留原 key（清 key 会重复下单/重复扣款）', () => {
    expect(shouldRotateIdempotencyKey(IDEMPOTENCY_ENVELOPE_INVALID)).toBe(false)
    expect(shouldRotateIdempotencyKey('IDEMPOTENCY_ENVELOPE_INVALID')).toBe(false)
  })

  it('其它错误码/空值 → 保留原 key（同一次意图重试复用）', () => {
    expect(shouldRotateIdempotencyKey('VALIDATION')).toBe(false)
    expect(shouldRotateIdempotencyKey(undefined)).toBe(false)
    expect(shouldRotateIdempotencyKey(null)).toBe(false)
  })
})
