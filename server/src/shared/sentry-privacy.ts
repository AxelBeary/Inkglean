// M-5 / F0179：Sentry 上报脱敏——从 app.ts 拆出，保持行为与导出不变。
import type * as Sentry from '@sentry/node'

/** 凭证既可能在路径白名单里，也可能藏在任意查询参数中（日历订阅、安装向导、签名文件等）。 */
const CREDENTIAL_PARAM_RE = /[?&](?:token|sig|code|key|password|secret)=/i

export function hasPrivateQuery(url: string): boolean {
  if (CREDENTIAL_PARAM_RE.test(url ?? '')) return true
  const path = url?.split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/i, '') ?? ''
  return path.startsWith('/uploads/') || path.startsWith('/setup') ||
    /^\/artist\/[^/]+\/(?:track|delivery\/[^/]+)\/?$/i.test(path)
}

/** 文件签名和客户访问令牌都在查询参数中，访问日志只记录这些入口的路径。 */
export function requestLogUrl(url: string): string {
  return hasPrivateQuery(url) ? url.split('?', 1)[0] : url
}

/**
 * M-5 / F0179：Sentry beforeSend 统一脱敏（可导出供回归测试直接钉死）。
 *
 * 核对结论（@sentry/node 10.78.0，node_modules/@sentry/core/.../integrations/requestdata.js）：
 * - RequestData 集成默认 `include.headers = dataCollection.httpHeaders.request !== false`，
 *   即把 normalizedRequest.headers **全量**写入 `event.request.headers`；
 * - `sendDefaultPii:false` 只把 `httpHeaders.request` 映射成
 *   `{ deny: ['forwarded','-ip','remote-','via','-user'] }`，而该 deny 表只用于
 *   `httpHeadersToSpanAttributes` 过滤 span 属性，**并不过滤 event.request.headers**。
 * - F0179 后订单令牌走 `x-order-token` header（query.token 仅兼容回退），故 5xx 上报会把
 *   令牌随 header 送第三方 DSN。服务端 `beforeSend` 必须自己清。
 *
 * 口径：按白名单只保留 url + method，其余 request 载荷（headers/cookies/data/query_string）
 * 一律删除；url 继续走既有 hasPrivateQuery 脱敏。breadcrumb 里 http.*.header.* 一并清，防旁路。
 */
export function sentryBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const request = event.request
  if (request) {
    if (request.url && hasPrivateQuery(request.url)) request.url = requestLogUrl(request.url)
    // x-order-token / x-anon-token / authorization / idempotency-key / cookie 全部不出网
    delete request.headers
    delete request.cookies
    delete request.data
    delete request.query_string
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (!crumb.data) continue
      for (const key of Object.keys(crumb.data)) {
        if (/^(?:http\.)?(?:request|response)\.header\./i.test(key) || /headers?$/i.test(key)) {
          delete crumb.data[key]
        }
      }
    }
  }
  return event
}
