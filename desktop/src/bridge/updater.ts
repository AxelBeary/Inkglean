// 桌面端更新通道桥（tauri-plugin-updater 收口，825 更新通道施工批）
// 防投毒口径（REQ-014 安全口径三）：验签失败＝拒装——插件内部以公钥验签，签名不合直接抛错，
// 绝不落到 install；公钥内置于 tauri.conf.json，endpoint 经 DESKTOP_UPDATE_ENDPOINT 构建期注入。
// 逃生门纪律：纯浏览器环境抛 BridgeUnavailableError；网络失败/端点未配置由调用方静默吞掉不打扰。
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'
import type { Update } from '@tauri-apps/plugin-updater'

/** 已下载待安装的更新实例（用户同意后走 installPendingUpdate 重启生效） */
let pending: Update | null = null

/**
 * 静默检查 + 下载：有新版本则后台下载（含验签），返回 'downloaded'；
 * 已是最新返回 'up-to-date'。任何异常向上抛，调用方负责静默降级。
 */
export async function checkAndDownloadUpdate(): Promise<'downloaded' | 'up-to-date'> {
  if (!isDesktop()) throw new BridgeUnavailableError('updater')
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) return 'up-to-date'
  await update.download() // 验签失败在此抛错（拒装口径），不进入安装环节
  pending = update
  return 'downloaded'
}

/** 重启生效（退出并安装）；仅在用户同意后调用。无待装更新时静默返回。 */
export async function installPendingUpdate(): Promise<void> {
  if (!pending) return
  await pending.install()
}
