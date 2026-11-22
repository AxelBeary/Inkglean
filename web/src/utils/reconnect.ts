/**
 * 断网重连恢复（R-16）
 *
 * 全仓此前无 online/visibilitychange 恢复钩子：断网重连后页面停留在脏数据。
 * 本模块提供订阅函数（不自造全局刷新），由关键数据页按需订阅并复用既有刷新函数：
 *   OrderDetail（loadOrder + loadPayments）、Dashboard、QueueBoard（refreshAll）。
 * 最小面设计：只接上述三页，不做全局路由级刷新（防过度设计）；
 * 后续页面接入 = import subscribeReconnect 并在 onMounted/onUnmounted 成对订阅/退订。
 * reduced-motion 与本机制无关（数据刷新不是动效），不涉及。
 */

const subscribers = new Set<() => void>()

function emitReconnect(): void {
  for (const cb of subscribers) {
    try { cb() } catch { /* 单个订阅者异常不影响其他订阅者 */ }
  }
}

// F0275: 一次网络恢复常同时触发 online 与 visibilitychange，合并同一微任务内的重复信号，
// 避免一次恢复对每个订阅者重复拉取（连续 dispatch 只发一次，下一个微任务才解锁）
let resumeScheduled = false
function onResume(): void {
  if (resumeScheduled) return
  resumeScheduled = true
  emitReconnect()
  const unlock = () => { resumeScheduled = false }
  if (typeof queueMicrotask === 'function') queueMicrotask(unlock)
  else Promise.resolve().then(unlock)
}

function onWindowOnline(): void {
  onResume()
}

function onVisibilityChange(): void {
  // 切回前台才触发（隐藏期间可能已在线，回到可见时补一次拉取）
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') onResume()
}

// F0276: 模块顶层不再直接访问 window/document 注册监听（非 DOM 环境 import 即抛错）；
// 改为首个订阅者出现时惰性注册，SSR/Node 环境 import 本模块不再抛错
let listenersAttached = false
function ensureListeners(): void {
  if (listenersAttached) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.addEventListener('online', onWindowOnline)
  document.addEventListener('visibilitychange', onVisibilityChange)
  listenersAttached = true
}

/**
 * 订阅重连信号（online / 回前台）。返回退订函数，组件 onUnmounted 时必须成对调用。
 */
export function subscribeReconnect(cb: () => void): () => void {
  if (typeof cb !== 'function') return () => {}
  ensureListeners()
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}
