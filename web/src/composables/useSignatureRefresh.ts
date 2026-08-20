/**
 * useSignatureRefresh — 签名 URL 定时刷新（R33）
 *
 * 签名 URL 有效期 15 分钟，长停留页面图片会 403。
 * 本 composable 每 intervalMs（默认 10 分钟）收集当前页面所有裸路径，
 * 调 POST /api/artist/refresh-signatures 批量换新，静默写回响应式数据。
 *
 * 用法：
 *   const { refreshNow } = useSignatureRefresh({
 *     collect: () => order.value?.references?.map(r => r.file_path) || [],
 *     apply: (urlMap) => { ... 把新 URL 写回 order ... },
 *   })
 *   // el-image @error="() => refreshNow(path)" 作为兜底（加载失败立即刷新该图）
 *
 * BUG-5 修复（按图刷新，治本）：
 * - refreshNow(path) 接受出错图片的 path，只刷新该图——其他图 src 不变，
 *   消除"一张图 error → 全量刷新 → 所有图 src 变化 → 循环闪烁"的根因
 * - errorRetries 改为 Map<path, count>，按图独立计数，单张坏图不耗尽全局重试预算
 * - 非字符串入参（如 el-image 透传的 event 对象，OrderDetail 旧用法）视为无参，
 *   回退全量刷新——向后兼容，未改造的消费者行为不变
 *
 * 硬规则：
 * - 静默失败（catch 吞掉，不打扰用户）
 * - 防重入（多张图同时 error 合并为一次批量刷新）
 * - @error 触发的刷新加 300ms 防抖 + 每图最大重试 2 次
 * - 定时刷新不受重试上限限制（定期兜底不应被阻断）
 * - onUnmounted 自动清理定时器和防抖计时器
 */
import { onUnmounted } from 'vue'
import { artistApi } from '../api/index'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000 // 10 分钟（签名 TTL 15 分钟，留 5 分钟余量）
const MAX_ERROR_RETRIES = 2 // @error 触发刷新的每图最大重试次数
// R-15: 后台标签回可见的补刷阈值（Chrome 节流 setInterval 后，切后台 >15min 签名会过期；
// 回可见时距上次刷新超过该阈值立即补一次，比 TTL 余量再多留 2 分钟）
const VISIBLE_REFRESH_THRESHOLD_MS = 8 * 60 * 1000

export function useSignatureRefresh({ collect, apply, intervalMs = DEFAULT_INTERVAL_MS }: {
  collect: () => string[]
  apply: (urls: Record<string, string>) => void
  intervalMs?: number
}) {
  let refreshing = false
  let debounceTimer: number | null = null
  let lastRefreshAt = Date.now()
  const pendingPaths = new Set<string>() // 等待刷新的出错图片 path（BUG-5：Set 去重）
  const errorRetries = new Map<string, number>() // path → 重试次数（BUG-5：按图独立计数）

  /** R-15: 页面回可见时补刷（防后台定时器节流导致的签名过期） */
  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastRefreshAt >= VISIBLE_REFRESH_THRESHOLD_MS) refreshNow()
  }

  /**
   * @param paths 仅刷新指定路径；省略时走 collect() 全量（定时器 / 旧无参调用）
   * @param fromError 是否由 @error 触发（仅 error 触发的失败计入重试次数）
   */
  async function doRefresh(paths?: string[] | null, fromError = false) {
    if (refreshing) return
    const targets = paths?.length ? paths : collect()
    if (!targets.length) return
    refreshing = true
    try {
      const { urls } = await artistApi.refreshSignatures(targets)
      apply(urls)
      lastRefreshAt = Date.now() // 只按成功刷新计时（失败不推迟补刷）
      for (const p of targets) errorRetries.delete(p) // 刷新成功 → 清除该图计数
    } catch {
      if (fromError) {
        // BUG-5：按图累加，超限后仅该图不再重试，其他图不受影响
        for (const p of targets) errorRetries.set(p, (errorRetries.get(p) || 0) + 1)
      }
      // 静默失败：刷新不成功不应打断用户操作，定时刷新仍会兜底
    } finally {
      refreshing = false
    }
  }

  /** 冲刷待发集合；若恰有刷新在途则 300ms 后重试（不丢失出错路径） */
  function flushPending() {
    if (refreshing) {
      debounceTimer = setTimeout(flushPending, 300)
      return
    }
    const targets = pendingPaths.size ? [...pendingPaths] : null
    pendingPaths.clear()
    doRefresh(targets, targets != null)
  }

  /**
   * @error 兜底入口：
   * - 传入字符串 path（BUG-5，QueueBoard）：只收集该图，300ms 防抖后刷新
   * - 无参或非字符串入参（向后兼容，OrderDetail 透传 event）：全量刷新
   * - 超过 MAX_ERROR_RETRIES 的图按图忽略，其他图不受影响
   */
  function refreshNow(path?: unknown) {
    if (typeof path === 'string' && path) {
      if ((errorRetries.get(path) || 0) >= MAX_ERROR_RETRIES) return
      pendingPaths.add(path)
    }
    if (debounceTimer != null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(flushPending, 300)
  }

  const timer = setInterval(() => doRefresh(), intervalMs)
  document.addEventListener('visibilitychange', onVisibilityChange)
  onUnmounted(() => {
    clearInterval(timer)
    if (debounceTimer != null) clearTimeout(debounceTimer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { refreshNow }
}
