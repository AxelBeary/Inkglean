// desktop-bridge 统一收口层：所有原生系统调用一律经此层进出，禁止业务代码直接 import Tauri API。
// 逃生门纪律：纯浏览器环境下调用原生能力抛 BridgeUnavailableError，调用前先 isDesktop() 或 catch 降级。
// 能力按需增量扩充（F8 窗口枚举/输入空闲等自定义 Rust 命令后续在此接线）。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

export { isDesktop } from './env'
export { BridgeUnavailableError } from './errors'
export { checkAndDownloadUpdate, installPendingUpdate } from './updater'
export { saveSecret, loadSecret, deleteSecret } from './secureStore'

function requireDesktop(capability: string): void {
  if (!isDesktop()) throw new BridgeUnavailableError(capability)
}

/** 前后端通路健康检查：调 Rust 侧 bridge_ping，返回应用版本号 */
export async function ping(): Promise<string> {
  requireDesktop('ping')
  return await invoke<string>('bridge_ping')
}

/** 用系统关联程序打开文件或文件夹（如调起 CSP/PS 打开工程文件） */
export async function openWithSystem(target: string): Promise<void> {
  requireDesktop('openWithSystem')
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(target)
}

/** 弹系统目录选择框（如画师自选委托归档目录）；用户取消返回 null */
export async function pickDirectory(title?: string): Promise<string | null> {
  requireDesktop('pickDirectory')
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, multiple: false, title })
  return typeof picked === 'string' ? picked : null
}
