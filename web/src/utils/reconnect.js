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

const subscribers = new Set()

function emitReconnect() {
  for (const cb of subscribers) {
    try { cb() } catch { /* 单个订阅者异常不影响其他订阅者 */ }
  }
}

function onWindowOnline() {
  emitReconnect()
}

function onVisibilityChange() {
  // 切回前台才触发（隐藏期间可能已在线，回到可见时补一次拉取）
  if (document.visibilityState === 'visible') emitReconnect()
}

window.addEventListener('online', onWindowOnline)
document.addEventListener('visibilitychange', onVisibilityChange)

/**
 * 订阅重连信号（online / 回前台）。返回退订函数，组件 onUnmounted 时必须成对调用。
 */
export function subscribeReconnect(cb) {
  if (typeof cb !== 'function') return () => {}
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}
