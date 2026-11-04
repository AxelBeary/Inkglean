// 桌面端系统对话框桥接（基于 @tauri-apps/plugin-dialog）
// 替代原生阻塞式 window.confirm，提供 WebView2 下优雅的异步确认弹窗。
// 逃生门：纯浏览器/非桌面壳环境下降级为 window.confirm，避免 dev 或测试环境报错。
import { isDesktop } from './env'

export interface AskOptions {
  title?: string
  kind?: 'info' | 'warning' | 'error'
  okLabel?: string
  cancelLabel?: string
}

/** 异步确认提示框（替换原生 window.confirm 阻塞弹窗）
 *  桌面壳内调用 @tauri-apps/plugin-dialog 的 ask 接口；浏览器/测试环境下安全降级为 window.confirm */
export async function askConfirm(message: string, options?: string | AskOptions): Promise<boolean> {
  if (isDesktop()) {
    try {
      const { ask } = await import('@tauri-apps/plugin-dialog')
      const opts = typeof options === 'string' ? { title: options } : options
      return await ask(message, {
        title: opts?.title ?? '拾绘',
        kind: opts?.kind ?? 'info',
        okLabel: opts?.okLabel,
        cancelLabel: opts?.cancelLabel
      })
    } catch {
      // 壳内调用失败或权限异常降级
    }
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message)
  }
  return false
}

export const ask = askConfirm
