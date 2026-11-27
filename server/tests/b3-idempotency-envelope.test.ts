// B3/S1：幂等响应信封加密——明文令牌不落库、命中回原文、解密失败 409 且不重执行
import { describe, it, expect } from 'vitest'
import { db, cleanDb } from './setup.js'
import { withIdempotency, unsealIdempotencyResponse } from '../src/shared/idempotency.js'

describe('F0134 幂等响应信封加密（B3/S1）', () => {
  const scope = 'b3:envelope'
  const key = 'b3-key'
  const body = { customerToken: 'b3-secret-token', trackUrl: 'https://x/track?no=N1&token=b3-secret-token' }
  const cached = (): string => (db.prepare(
    'SELECT response_json FROM idempotency_keys WHERE scope = ? AND key = ?'
  ).get(scope, key) as { response_json: string }).response_json

  it('B3-01: 落库 enc:v1 无明文、命中回原文、解封失败 409 不重执行（重跑会多一单）', () => {
    cleanDb()
    expect(withIdempotency(scope, key, () => ({ statusCode: 200, body }))).toEqual({ statusCode: 200, body })
    expect(cached()).toMatch(/^enc:v1:/)
    expect(cached()).not.toContain(body.customerToken)
    expect(JSON.parse(unsealIdempotencyResponse(cached(), scope, key))).toEqual(body)
    expect(withIdempotency(scope, key, () => { throw new Error('不应重执行') })).toEqual({ statusCode: 200, body })
    const sealed = cached()
    const original = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'b3-rotated-secret-for-vitest-32chars'
    let err: unknown
    try {
      withIdempotency(scope, key, () => { throw new Error('不应重执行') })
    } catch (e) {
      err = e
    }
    process.env.SESSION_SECRET = original
    // TASK2-01：解密失败用独立错误码，前端据此保留原 key（复用载荷冲突码会导致重复下单）
    expect(err).toMatchObject({ code: 'IDEMPOTENCY_ENVELOPE_INVALID', statusCode: 409 })
    expect(cached()).toBe(sealed)
  })
})
