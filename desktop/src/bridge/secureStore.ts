// 凭证保险箱桥（825 波0 地基批）：收口 Rust 侧 DPAPI 命令，登录凭证/设备标识一律经此进出。
// 逃生门纪律：纯浏览器环境抛 BridgeUnavailableError（开发请用 `npm run tauri dev` 起桌面壳）。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

function requireDesktop(): void {
  if (!isDesktop()) throw new BridgeUnavailableError('secureStore')
}

/** 加密存入（覆盖同 key 旧值） */
export async function saveSecret(key: string, value: string): Promise<void> {
  requireDesktop()
  await invoke('secure_save', { key, value })
}

/** 读取解密；不存在或密文损坏返回 null */
export async function loadSecret(key: string): Promise<string | null> {
  requireDesktop()
  return (await invoke<string | null>('secure_load', { key })) ?? null
}

/** 删除（登出/换号） */
export async function deleteSecret(key: string): Promise<void> {
  requireDesktop()
  await invoke('secure_delete', { key })
}
