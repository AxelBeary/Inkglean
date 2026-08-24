// desktop-bridge 环境探测：判断当前是否运行在 Tauri 壳内。
// Tauri 2 注入 __TAURI_INTERNALS__ 作为运行时标记；纯浏览器（vite dev 直开）无此对象。
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
