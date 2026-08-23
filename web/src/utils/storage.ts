/**
 * localStorage 安全封装（P3-10）
 *
 * 隐私模式/存储被禁用时，localStorage 读写会抛 SecurityError/QuotaExceededError；
 * 裸读若发生在 Pinia state 工厂或组件初始化处，会让整个应用白屏。
 * 统一静默降级：读取失败返回 null（调用方按 null 走默认值），写入/删除失败忽略。
 */
function getStorage(): Storage {
  // 属性访问本身也可能抛错（部分浏览器存储禁用），故整段放在 try 内由调用方捕获
  return window.localStorage
}

function getSessionStorage(): Storage {
  // 同 getStorage：sessionStorage 同样可能在隐私模式/存储禁用时抛 SecurityError
  return window.sessionStorage
}

/** 安全读取：失败返回 null，不向上抛 */
export function safeGetItem(key: string): string | null {
  try {
    return getStorage().getItem(key)
  } catch {
    return null
  }
}

/** 安全写入：失败静默忽略，不打断业务 */
export function safeSetItem(key: string, value: string): void {
  try {
    getStorage().setItem(key, value)
  } catch {
    // 隐私模式/配额不足等场景静默失败
  }
}

/** 安全删除：失败静默忽略 */
export function safeRemoveItem(key: string): void {
  try {
    getStorage().removeItem(key)
  } catch {
    // 同 safeSetItem：存储不可用时静默失败
  }
}

// ─── sessionStorage 安全三件套（824：401 绑定失效提示旗标 + 入驻首绑防刷新） ───
// 与 localStorage 版同纪律：读失败返回 null，写/删失败静默，永不向业务抛错。
// 选 sessionStorage 的原因：两类标记都是「当前标签页会话内」语义，关页即清，不留跨会话残留。

/** 安全读取（sessionStorage）：失败返回 null，不向上抛 */
export function safeSessionGetItem(key: string): string | null {
  try {
    return getSessionStorage().getItem(key)
  } catch {
    return null
  }
}

/** 安全写入（sessionStorage）：失败静默忽略，不打断业务 */
export function safeSessionSetItem(key: string, value: string): void {
  try {
    getSessionStorage().setItem(key, value)
  } catch {
    // 隐私模式/配额不足等场景静默失败（降级=对应功能不可用，不阻断主流程）
  }
}

/** 安全删除（sessionStorage）：失败静默忽略 */
export function safeSessionRemoveItem(key: string): void {
  try {
    getSessionStorage().removeItem(key)
  } catch {
    // 同 safeSessionSetItem：存储不可用时静默失败
  }
}
