/**
 * 轻量业务埋点（2026-08-06 用户拍板 OD-01；2026-08-07 前端批接入远程端点）
 * 规格：REQ-033 §2.2（匿名凭证 + 批量上报 + 白名单）；施工图《01-to-02-埋点前端批》
 * 行为：
 *  - 首次上报前 POST /api/anon-token 取匿名凭证，存 localStorage（30 天滚动续期由后端处理）
 *  - 攒批：每 5 秒或攒满 10 条发一次；页面关闭/跳转 sendBeacon 带走剩余
 *  - 失败策略：网络错误回队下次重试；400 INVALID_ANON_TOKEN 静默重取后重试一次；
 *    其余 4xx（白名单外/限流）丢弃该批——埋点永不打断用户、不影响业务
 *  - 与 Sentry 分工：Sentry=错误监控，本文件=业务埋点，不混用
 *  - G-7（P2-13 前端侧）: 匿名凭证同时供参考图上传/下单归属校验使用（getAnonToken）
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage.js'

const EVENT_VERSION = 'natural-v2' // 当前五色值版本：neon-v1 旧 / natural-v2 换色后
const ANON_TOKEN_KEY = 'huiyue_anon_token'
const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_MAX = 10
const SEND_BATCH_MAX = 50
// a3: 队列上限——离线持续重试时事件对象不无限堆积（超限丢最旧批次）
const MAX_QUEUE_SIZE = 200
/** 匿名凭证获取失败标记：5xx/断网可重试；4xx 属后端明确拒绝 */
const TOKEN_NETWORK_FAIL = Symbol('anon-token-network-fail')

let queue = []
let flushTimer = null
let flushBusy = false
// G-5: 裸读换 safeGetItem（存储禁用时按无凭证降级，不抛错）
let anonToken = safeGetItem(ANON_TOKEN_KEY) || null

async function ensureAnonToken() {
  if (anonToken) return anonToken
  try {
    const res = await fetch('/api/anon-token', { method: 'POST' })
    if (!res.ok) {
      // 4xx = 后端明确拒绝（白名单外/端点停用）：按无凭证处理，不回队
      if (res.status >= 400 && res.status < 500) return null
      return TOKEN_NETWORK_FAIL
    }
    const data = await res.json()
    anonToken = data.token
    safeSetItem(ANON_TOKEN_KEY, anonToken)
  } catch { /* 网络失败：静默，不打断用户 */ return TOKEN_NETWORK_FAIL }
  return anonToken
}

/** 获取当前匿名凭证（无则签发一次；网络/服务端失败返回 null）。G-7: 参考图上传/下单归属校验复用此链路 */
export async function getAnonToken() {
  const token = await ensureAnonToken()
  return token === TOKEN_NETWORK_FAIL ? null : token
}

export function trackEvent(name, payload = {}) {
  queue.push({ name, ts: Date.now(), version: EVENT_VERSION, ...payload })
  if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE)
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
    if (token == null) {
      // 后端明确拒绝（4xx）：丢弃本批（REQ-033 §2.2 兜底）
      return
    }
    if (token === TOKEN_NETWORK_FAIL) {
      // 网络失败/5xx：拿不到凭证 → 回队下次重试（对齐文件头「网络错误回队」承诺）
      queue.unshift(...events)
      if (queue.length > MAX_QUEUE_SIZE) queue.splice(MAX_QUEUE_SIZE)
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
          safeRemoveItem(ANON_TOKEN_KEY)
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
