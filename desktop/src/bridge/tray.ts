// 托盘桥（本地核心环波15）：托盘快照——动态更新托盘 tooltip（今日状态概要）。
// 非关键路径：纯浏览器/失败一律静默（与通知桥同款逃生门变体，不抛不吵）。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'

/** 更新托盘 tooltip（快照文案由 tools/traySnapshot 组装）；失败静默 */
export async function setTrayTooltip(text: string): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('desktop_tray_set_tooltip', { text })
  } catch {
    // 快照非关键路径：静默
  }
}
