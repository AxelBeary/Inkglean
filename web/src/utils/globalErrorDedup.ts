/**
 * P3-9: 全局错误提示去重（兑现 main.js errorHandler 注释「5秒内只弹一次」语义）
 *
 * 组件连续抛同源错误时只对用户弹一次；console/Sentry 上报不受影响。
 * 实现：消息 → 最近展示时间戳的 Map，窗口内命中返回 false；顺带清理过期键防无限增长。
 *
 * @param {number} intervalMs 去重窗口（默认 5 秒）
 * @param {() => number} now 时间源（测试可注入）
 */
export function createGlobalErrorDedup(intervalMs = 5000, now: () => number = () => Date.now()): (message: string) => boolean {
  const lastShownAt = new Map<string, number>()

  return function shouldShowGlobalError(message: string): boolean {
    const t = now()
    const last = lastShownAt.get(message)
    // 从未展示过（last 为 undefined）→ 首次必定放行；仅当窗口内展示过才拦截
    if (last != null && t - last < intervalMs) return false

    lastShownAt.set(message, t)
    // 顺带清理过期键（Map 遍历中删除安全），避免长期运行内存增长
    for (const [key, ts] of lastShownAt) {
      if (t - ts >= intervalMs) lastShownAt.delete(key)
    }
    return true
  }
}
