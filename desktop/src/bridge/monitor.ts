// F8 二期监听桥（本地核心环波8）：前台窗口标题 + 键鼠输入空闲。
// 逃生门同既有桥：纯浏览器/非 Windows 抛 BridgeUnavailableError（轮询方降级为纯手动）。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

/** 前台窗口标题（在画/摸鱼分类的采样源）；无前台窗口壳层返空串 */
export async function foregroundTitle(): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('foregroundTitle')
  return await invoke<string>('desktop_foreground_title')
}

/** 键鼠输入空闲秒数（AFK 判据；阈值由轮询方掌握，默认 5 分钟） */
export async function inputIdleSecs(): Promise<number> {
  if (!isDesktop()) throw new BridgeUnavailableError('inputIdleSecs')
  return await invoke<number>('desktop_input_idle_secs')
}
