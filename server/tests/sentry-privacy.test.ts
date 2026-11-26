// ============================================
// M-5（F0179 订单令牌进 header，Sentry 不清 header）防回退回归
// 直接调用 app.ts 导出的 beforeSend，钉死「令牌不进上报 event」。
// ============================================
import { describe, it, expect } from 'vitest'
import type { ErrorEvent as SentryEvent } from '@sentry/node'
import { sentryBeforeSend } from '../src/app.js'

const ORDER_TOKEN = 'ord_9f3c2e7b1a4d6f80' // 模拟 x-order-token（一次性客户令牌）

function eventWithToken(): SentryEvent {
  return {
    type: undefined,
    level: 'error',
    message: 'simulated 5xx',
    request: {
      url: 'https://inkglen.example/api/client/order/track?token=legacy-query-token&foo=bar',
      method: 'POST',
      query_string: 'token=legacy-query-token&foo=bar',
      headers: {
        'x-order-token': ORDER_TOKEN,
        'x-anon-token': 'anon_secret_value',
        authorization: 'Bearer jwt_secret_value',
        'idempotency-key': 'idem-1234',
        cookie: 'artist_token=jwt_cookie_value',
        'user-agent': 'e2e-probe'
      },
      cookies: { artist_token: 'jwt_cookie_value' },
      data: '{"orderToken":"body_secret_value"}'
    },
    breadcrumbs: [
      {
        category: 'http',
        message: 'http request',
        data: {
          'http.request.header.x-order-token': ORDER_TOKEN,
          'http.request.header.authorization': 'Bearer jwt_secret_value',
          'http.request.header.user-agent': 'e2e-probe',
          url: 'https://inkglen.example/api/client/order/track'
        }
      }
    ]
  } as SentryEvent
}

describe('Sentry beforeSend 脱敏 (M-5)', () => {
  it('TC-SENTRY-01: x-order-token 不进 event（header 整段删除）', () => {
    const out = sentryBeforeSend(eventWithToken())
    expect(out.request).toBeDefined()
    expect(out.request!.headers).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain(ORDER_TOKEN)
    expect(JSON.stringify(out)).not.toContain('jwt_secret_value')
    expect(JSON.stringify(out)).not.toContain('idem-1234')
    expect(JSON.stringify(out)).not.toContain('jwt_cookie_value')
    expect(JSON.stringify(out)).not.toContain('body_secret_value')
    expect(JSON.stringify(out)).not.toContain('legacy-query-token')
  })

  it('TC-SENTRY-02: 保留安全字段（url 已脱敏 + method）', () => {
    const out = sentryBeforeSend(eventWithToken())
    expect(out.request!.method).toBe('POST')
    expect(out.request!.url).toBe('https://inkglen.example/api/client/order/track')
    expect(out.message).toBe('simulated 5xx')
  })

  it('TC-SENTRY-03: breadcrumb 里的 header 旁路同样被清', () => {
    const out = sentryBeforeSend(eventWithToken())
    const data = out.breadcrumbs?.[0]?.data ?? {}
    expect(data['http.request.header.x-order-token']).toBeUndefined()
    expect(data['http.request.header.authorization']).toBeUndefined()
    // 非 header 的普通字段保留，不误伤排障信息
    expect(data.url).toBe('https://inkglen.example/api/client/order/track')
    expect(data['http.request.header.user-agent']).toBeUndefined() // user-agent 归 headers 一并清
  })

  it('TC-SENTRY-04: 无 request 的 event 不报错（回归原有行为）', () => {
    const out = sentryBeforeSend({ type: undefined, message: 'no-request event' } as SentryEvent)
    expect(out.message).toBe('no-request event')
  })
})
