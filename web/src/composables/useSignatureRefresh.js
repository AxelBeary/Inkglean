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
 *   // el-image @error="refreshNow" 作为兜底（加载失败立即刷新）
 *
 * 硬规则：
 * - 静默失败（catch 吞掉，不打扰用户）
 * - 防重入（多张图同时 error 只触发一次刷新）
 * - BUG-1 修复：@error 触发的 refreshNow 加 300ms 防抖 + 最大重试 2 次
 * - onUnmounted 自动清理定时器和防抖计时器
 */
import { onUnmounted } from 'vue'
import { artistApi } from '../api/index.js'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000 // 10 分钟（签名 TTL 15 分钟，留 5 分钟余量）
const MAX_ERROR_RETRIES = 2 // @error 触发刷新的最大重试次数

export function useSignatureRefresh({ collect, apply, intervalMs = DEFAULT_INTERVAL_MS }) {
  let refreshing = false
  let debounceTimer = null
  let errorRetries = 0

  async function doRefresh() {
    if (refreshing) return
    const paths = collect()
    if (!paths.length) return
    refreshing = true
    try {
      const { urls } = await artistApi.refreshSignatures(paths)
      apply(urls)
      errorRetries = 0 // 成功后重置重试计数
    } catch {
      errorRetries++
      // 静默失败：刷新不成功不应打断用户操作
      // 超过 MAX_ERROR_RETRIES 后 @error 不再触发刷新，定时刷新仍会尝试
    } finally {
      refreshing = false
    }
  }

  /**
   * @error 兜底入口：防抖 300ms（多图同时 error 合并为一次）+ 重试上限
   * 定时刷新走 doRefresh 直调，不受重试上限限制（定期兜底不应被阻断）
   */
  function refreshNow() {
    if (errorRetries >= MAX_ERROR_RETRIES) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(doRefresh, 300)
  }

  const timer = setInterval(doRefresh, intervalMs)
  onUnmounted(() => {
    clearInterval(timer)
    clearTimeout(debounceTimer)
  })

  return { refreshNow }
}
