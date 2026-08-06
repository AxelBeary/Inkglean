/**
 * 轻量业务埋点（2026-08-06 用户拍板 OD-01）
 * 当前实现：console.debug 输出 + 可选远程端点（后续接入）。
 * 避免依赖 Sentry（错误监控 ≠ 业务分析）。
 */
const EVENT_VERSION = 'natural-v2' // 当前五色值版本：neon-v1 旧 / natural-v2 换色后

export function trackEvent(name, payload = {}) {
  const event = { name, ts: Date.now(), version: EVENT_VERSION, ...payload }
  console.debug('[track]', event)
  // TODO(埋点后端): 接入服务端收集端点后启用 window.fetch('/api/events', ...)
  return event
}
