// 系统通知桥（壳层商业化批）：REQ-014 首发拍板件。
// 逃生门变体纪律（与窗口/保险箱桥不同，刻意不抛异常）：通知属非关键路径，
// 纯浏览器环境 / 权限被拒 / 发送失败一律静默降级——绝不因通知打扰或阻塞业务。
import { isDesktop } from './env'

/** 发一条系统通知；任何环节失败都静默（权限首请由插件按系统口径弹窗） */
export async function notify(title: string, body?: string): Promise<void> {
  if (!isDesktop()) return
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    )
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    if (!granted) return
    sendNotification({ title, body })
  } catch {
    // 通知非关键路径：失败静默降级
  }
}
