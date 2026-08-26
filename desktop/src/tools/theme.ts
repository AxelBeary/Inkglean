// 主题解析（本地核心环波13）：偏好 × 系统深色 → 实际主题。
// auto=跟随系统；施加于 html[data-desktop-theme]（paper-ink.css 暗色作用域吃此属性）。
export function resolveTheme(pref: string | undefined | null, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

/** 施加主题到文档根（各窗口独立 JS 上下文，各自施加，天然同步） */
export function applyThemeToDom(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-desktop-theme', theme)
}
