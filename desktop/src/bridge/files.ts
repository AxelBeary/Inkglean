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

/** 批量读文件字节大小（导出 manifest 用）；不存在返 0；空入参不走桥 */
export async function fileSizes(paths: string[]): Promise<number[]> {
  if (paths.length === 0) return []
  if (!isDesktop()) throw new BridgeUnavailableError('fileSizes')
  return await invoke<number[]>('desktop_file_sizes', { paths })
}

/** 读文件转 base64（F6 头像自含存储，Rust 侧限 5MB） */
export async function readFileB64(path: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('readFileB64')
  return await invoke<string>('desktop_read_file_b64', { path })
}

/** 读备份包转 base64（波10 导入用，Rust 侧限 100MB） */
export async function readBackupB64(path: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('readBackupB64')
  return await invoke<string>('desktop_read_backup_b64', { path })
}

/** 删除缓存文件（波15 图缓存淘汰；Rust 侧自卫：只许 img-cache 目录，幂等） */
export async function deleteCacheFile(path: string): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('deleteCacheFile')
  await invoke('desktop_delete_cache_file', { path })
}

/** 拾绘数据根目录（我的文档\拾绘，顺带建目录）：F1a 模板母版与委托文件夹根 */
export async function shihuiHome(): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('shihuiHome')
  return await invoke<string>('desktop_shihui_home')
}

/** 图缓存目录（app_data_dir/img-cache，F5，顺带建目录） */
export async function cacheDir(): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('cacheDir')
  return await invoke<string>('desktop_cache_dir')
}

/** 复制文件（F1a 母版→复印件）：只复制不搬迁，源文件永不被改动 */
export async function copyFile(src: string, dst: string): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('copyFile')
  await invoke('desktop_copy_file', { src, dst })
}
