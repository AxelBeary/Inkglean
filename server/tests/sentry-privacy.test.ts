// ============================================
// M-5 / F0179 / XVB-2：Sentry beforeSend 脱敏防回退回归
// 直接调用 app.ts 再导出的 beforeSend，钉死「令牌不进上报 event」。
//
// 事件形状按 @sentry/node 10.78.0 **默认集成真实会产出**的段构造（不是杜撰）：
// - request 段 ← requestDataIntegration（headers 全量写入）
// - console 面包屑 ← consoleIntegration（data.arguments = 原始 console 参数）
// - http 面包屑 ← httpIntegration（data.url 带查询串）
// - exception.values[].stacktrace.frames[].vars ← localVariablesIntegration（局部变量快照）
// 口径：白名单重建（只留定位必需字段），未知字段与自由容器一律不带走。
// ============================================
import { describe, it, expect } from 'vitest'
import type { ErrorEvent as SentryEvent } from '@sentry/node'
import { sentryBeforeSend } from '../src/app.js'

const ORDER_TOKEN = 'ord_9f3c2e7b1a4d6f80' // 模拟 x-order-token（一次性客户令牌）

/** 构造一个「六面 + 白名单诱饵」都带令牌的 event */
function eventWithToken(): SentryEvent {
  return {
    type: undefined,
    event_id: 'e1f2a3b4c5d6',
    level: 'error',
    platform: 'node',
    release: '1.1.0',
    environment: 'production',
    transaction: '/api/orders/:orderNo',
    server_name: 'inkglen-1',
    fingerprint: ['order-create'],
    sdk: { name: 'sentry.javascript.node', version: '10.78.0' },
    message: 'simulated 5xx on https://inkglen.example/api/orders?token=msg_token_value',
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
      data: '{"orderToken":"body_secret_value"}',
      env: { SESSION_SECRET: 'env_secret_value' }
    },
    exception: {
      values: [
        {
          type: 'AppError',
          value: 'order create failed: GET https://inkglen.example/api/x?access_token=exc_token_value',
          stacktrace: {
            frames: [
              {
                filename: '/app/server/src/features/order/order-client.routes.ts',
                function: 'createOrder',
                lineno: 154,
                colno: 7,
                in_app: true,
                vars: { token: 'local_var_token', body: { token: 'body_local_token' } },
                context_line: 'const token = request.headers["x-order-token"]'
              }
            ]
          }
        }
      ]
    },
    breadcrumbs: [
      {
        category: 'console',
        level: 'warning',
        timestamp: 1_700_000_000,
        // consoleIntegration: message = util.format(args)，data.arguments = 原始参数
        message: 'console warn: token=jwt_cookie_value 已失效',
        data: { arguments: [{ token: ORDER_TOKEN }, 'x-anon-token=anon_secret_value'] }
      },
      {
        category: 'http',
        level: 'info',
        timestamp: 1_700_000_001,
        message: 'http request',
        data: {
          'http.request.header.x-order-token': ORDER_TOKEN,
          'http.request.header.authorization': 'Bearer jwt_secret_value',
          url: 'https://inkglen.example/api/client/order/track?token=legacy-query-token',
          method: 'GET',
          status_code: 500
        }
      }
    ],
    // 下面全是「自由容器 + 白名单诱饵」：本仓无人写入，白名单必须整段丢弃
    extra: { orderToken: ORDER_TOKEN, note: 'extra_secret_value' },
    tags: { authorization: 'Bearer tag_secret_value' },
    contexts: { trace: { data: 'ctx_secret_value' } },
    user: { id: 'u-1', ip_address: '203.0.113.9' },
    modules: { compromised: 'mod_secret_value' },
    future_sdk_field: 'future_secret_value'
  } as unknown as SentryEvent
}

describe('Sentry beforeSend 脱敏 (M-5 / XVB-2)', () => {
  it('TC-SENTRY-01: 整 event 序列化后不含任何形态令牌（六面全覆盖）', () => {
    const out = sentryBeforeSend(eventWithToken())
    const serialized = JSON.stringify(out)
    for (const secret of [
      ORDER_TOKEN, 'anon_secret_value', 'jwt_secret_value', 'idem-1234', 'jwt_cookie_value',
      'body_secret_value', 'env_secret_value', 'msg_token_value', 'exc_token_value',
      'local_var_token', 'body_local_token', 'legacy-query-token',
      'extra_secret_value', 'tag_secret_value', 'ctx_secret_value', 'mod_secret_value',
      'future_secret_value', '203.0.113.9'
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('TC-SENTRY-02: request 白名单——只留 method + 掩码后的 url，其余字段整段不重建', () => {
    const out = sentryBeforeSend(eventWithToken())
    expect(out.request).toEqual({
      method: 'POST',
      url: 'https://inkglen.example/api/client/order/track'
    })
  })

  it('TC-SENTRY-03: 面包屑白名单——data 整段重建（arguments/url/header 全不走），仅留 http 的 method/status_code', () => {
    const out = sentryBeforeSend(eventWithToken())
    const [consoleCrumb, httpCrumb] = out.breadcrumbs ?? []
    // console 面包屑：原始参数载体 data 全丢，消息保留但脱敏
    expect(consoleCrumb.data).toBeUndefined()
    expect(consoleCrumb.message).toBe('console warn: token=*** 已失效')
    expect(consoleCrumb.category).toBe('console')
    expect(consoleCrumb.level).toBe('warning')
    // http 面包屑：带查询串的 url 与 header 键不进 data，只留定位用的 method/status_code
    expect(httpCrumb.data).toEqual({ method: 'GET', status_code: 500 })
    expect(httpCrumb.timestamp).toBe(1_700_000_001)
  })

  it('TC-SENTRY-04: 异常栈帧白名单——vars（局部变量快照）与源码行丢弃，保留定位到行的字段', () => {
    const out = sentryBeforeSend(eventWithToken())
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0]
    expect(frame).toEqual({
      filename: '/app/server/src/features/order/order-client.routes.ts',
      function: 'createOrder',
      lineno: 154,
      colno: 7,
      in_app: true
    })
  })

  it('TC-SENTRY-05: 异常值保留但脱敏（丢弃整段会失去 5xx 排障主信号）', () => {
    const out = sentryBeforeSend(eventWithToken())
    const value = out.exception?.values?.[0]?.value ?? ''
    expect(value).toContain('order create failed')
    expect(value).toContain('access_token=***')
    expect(value).not.toContain('exc_token_value')
  })

  it('TC-SENTRY-06: 自由容器与用户载荷整段丢弃（extra/tags/contexts/user/modules/未知字段）', () => {
    const out = sentryBeforeSend(eventWithToken())
    expect(out).not.toHaveProperty('extra')
    expect(out).not.toHaveProperty('tags')
    expect(out).not.toHaveProperty('contexts')
    expect(out).not.toHaveProperty('user')
    expect(out).not.toHaveProperty('modules')
    expect(out).not.toHaveProperty('future_sdk_field')
  })

  it('TC-SENTRY-07: 定位必需字段保留（release/environment/transaction/fingerprint/event_id/level/sdk）', () => {
    const out = sentryBeforeSend(eventWithToken())
    expect(out.event_id).toBe('e1f2a3b4c5d6')
    expect(out.level).toBe('error')
    expect(out.release).toBe('1.1.0')
    expect(out.environment).toBe('production')
    expect(out.transaction).toBe('/api/orders/:orderNo')
    expect(out.fingerprint).toEqual(['order-create'])
    expect(out.server_name).toBe('inkglen-1')
    expect(out.sdk?.version).toBe('10.78.0')
    expect(out.message).toBe('simulated 5xx on https://inkglen.example/api/orders?token=***')
  })

  it('TC-SENTRY-08: 无 request / 无 exception 的 event 不报错（回归原有行为）', () => {
    const out = sentryBeforeSend({ type: undefined, message: 'no-request event' } as SentryEvent)
    expect(out.message).toBe('no-request event')
    expect(out.request).toBeUndefined()
    expect(out.exception).toBeUndefined()
  })
})
