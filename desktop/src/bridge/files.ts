// 文件保存桥（工具箱波2）：导出物落盘。逃生门同既有桥。
// 路径一律来自系统保存对话框（前端先调 dialog.save 再交本函数），绝不业务自拼。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

/** Uint8Array → base64（分块，防大文件 fromCharCode 栈溢出） */
function uint8ToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/** 保存二进制到用户选定路径；纯浏览器环境抛 BridgeUnavailableError */
export async function saveFile(path: string, data: Uint8Array): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('saveFile')
  await invoke('desktop_save_file', { path, dataB64: uint8ToBase64(data) })
}

/** 批量校验文件是否存在（F1 丢失提醒）；入参顺序与返回一致；空入参不走桥 */
export async function checkFiles(paths: string[]): Promise<boolean[]> {
  if (paths.length === 0) return []
  if (!isDesktop()) throw new BridgeUnavailableError('checkFiles')
  return await invoke<boolean[]>('desktop_check_files', { paths })
}

/** 读文件转 base64（F6 头像自含存储，Rust 侧限 5MB） */
export async function readFileB64(path: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('readFileB64')
  return await invoke<string>('desktop_read_file_b64', { path })
}
