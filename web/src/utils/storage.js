/**
 * localStorage 安全封装（P3-10）
 *
 * 隐私模式/存储被禁用时，localStorage 读写会抛 SecurityError/QuotaExceededError；
 * 裸读若发生在 Pinia state 工厂或组件初始化处，会让整个应用白屏。
 * 统一静默降级：读取失败返回 null（调用方按 null 走默认值），写入/删除失败忽略。
 */
function getStorage() {
  // 属性访问本身也可能抛错（部分浏览器存储禁用），故整段放在 try 内由调用方捕获
  return window.localStorage
}

/** 安全读取：失败返回 null，不向上抛 */
export function safeGetItem(key) {
  try {
    return getStorage().getItem(key)
  } catch {
    return null
  }
}

/** 安全写入：失败静默忽略，不打断业务 */
export function safeSetItem(key, value) {
  try {
    getStorage().setItem(key, value)
  } catch {
    // 隐私模式/配额不足等场景静默失败
  }
}

/** 安全删除：失败静默忽略 */
export function safeRemoveItem(key) {
  try {
    getStorage().removeItem(key)
  } catch {
    // 同 safeSetItem：存储不可用时静默失败
  }
}
