// 首次启动引导标记（本地核心环波12）：REQ-014「桌面体验设置」——首启走向导，
// 覆盖模式选择 + 开机自启/关闭行为偏好，全部可跳过、后续菜单里可改。
// 读失败口径：当作已引导（宁可错过一次引导，不把用户困在引导里）。
// storage 可注入（默认 localStorage）：单测不依赖 jsdom/happy-dom 的打桩细节。
const KEY = 'shihui-onboarded-v1'

export function isOnboarded(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markOnboarded(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, '1')
  } catch {
    /* 标记失败：下次启动再走一遍引导，非致命 */
  }
}
