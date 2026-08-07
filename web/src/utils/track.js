/**
 * 轻量业务埋点（2026-08-06 用户拍板 OD-01；2026-08-07 前端批接入远程端点）
 * 规格：REQ-033 §2.2（匿名凭证 + 批量上报 + 白名单）；施工图《01-to-02-埋点前端批》
 * 行为：
 *  - 首次上报前 POST /api/anon-token 取匿名凭证，存 localStorage（30 天滚动续期由后端处理）
 *  - 攒批：每 5 秒或攒满 10 条发一次；页面关闭/跳转 sendBeacon 带走剩余
 *  - 失败策略：网络错误回队下次重试；400 INVALID_ANON_TOKEN 静默重取后重试一次；
 *    其余 4xx（白名单外/限流）丢弃该批——埋点永不打断用户、不影响业务
 *  - 与 Sentry 分工：Sentry=错误监控，本文件=业务埋点，不混用
 */
const EVENT_VERSION = 'natural-v2' // 当前五色值版本：neon-v1 旧 / natural-v2 换色后
const ANON_TOKEN_KEY = 'huiyue_anon_token'
const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_MAX = 10
const SEND_BATCH_MAX = 50

let queue = []
let flushTimer = null
let flushBusy = false
let anonToken = localStorage.getItem(ANON_TOKEN_KEY) || null

async function ensureAnonToken() {
  if (anonToken) return anonToken
  try {
    const res = await fetch('/api/anon-token', { method: 'POST' })
    if (!res.ok) return null
    const data = await res.json()
    anonToken = data.token
    try { localStorage.setItem(ANON_TOKEN_KEY, anonToken) } catch { /* 隐私模式禁存：静默 */ }
  } catch { /* 网络失败：静默，不打断用户 */ }
  return anonToken
}

export function trackEvent(name, payload = {}) {
  queue.push({ name, ts: Date.now(), version: EVENT_VERSION, ...payload })
  if (queue.length >= FLUSH_BATCH_MAX) flush()
  else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
  return queue[queue.length - 1]
}

/** 立即发送剩余队列（SPA 路由离开等需要即时上报的场景） */
export function flushNow() {
  flush()
}

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (flushBusy || !queue.length) return
  flushBusy = true
  try {
    const events = queue.splice(0, SEND_BATCH_MAX)
    const token = await ensureAnonToken()
    if (!token) {
      // 拿不到凭证（网络失败/后端异常）：丢弃本批，不阻塞用户（REQ-033 §2.2 兜底）
      return
    }
    let res
    try {
      res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, events })
      })
    } catch {
      queue.unshift(...events) // 网络错误：回队，等下次 flush
      return
    }
    if (!res.ok && res.status === 400) {
      try {
        const body = await res.json()
        if (body?.code === 'INVALID_ANON_TOKEN') {
          // 凭证无效/过期：静默重取一次并重试（REQ-033 §2.2）
          anonToken = null
          try { localStorage.removeItem(ANON_TOKEN_KEY) } catch { /* 静默 */ }
          const newToken = await ensureAnonToken()
          if (newToken) {
            await fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: newToken, events })
            })
          }
        }
      } catch { /* 静默 */ }
    }
    // 其余失败（白名单外/限流等 4xx）：丢弃该批，避免重试死循环
  } finally {
    flushBusy = false
    if (queue.length && !flushTimer) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
  }
}

// 页面关闭/跳转：sendBeacon 带走剩余（beforeunload 无法发普通 fetch）
window.addEventListener('pagehide', () => {
  if (!queue.length) return
  if (!anonToken) return // 无凭证（首次即关页/禁存）：丢弃，不阻塞关闭
  try {
    const body = JSON.stringify({ token: anonToken, events: queue.splice(0, SEND_BATCH_MAX) })
    // Blob 指定 application/json：sendBeacon 默认 text/plain 后端不会按 JSON 解析
    navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))
  } catch { /* 静默 */ }
})