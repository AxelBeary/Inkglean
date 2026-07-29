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
 * - onUnmounted 自动清理定时器
 */
import { onUnmounted } from 'vue'
import { artistApi } from '../api/index.js'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000 // 10 分钟（签名 TTL 15 分钟，留 5 分钟余量）

export function useSignatureRefresh({ collect, apply, intervalMs = DEFAULT_INTERVAL_MS }) {
  let refreshing = false

  async function refreshNow() {
    if (refreshing) return
    const paths = collect()
    if (!paths.length) return
    refreshing = true
    try {
      const { urls } = await artistApi.refreshSignatures(paths)
      apply(urls)
    } catch {
      // 静默失败：刷新不成功不应打断用户操作，下次定时器会重试
    } finally {
      refreshing = false
    }
  }

  const timer = setInterval(refreshNow, intervalMs)
  onUnmounted(() => clearInterval(timer))

  return { refreshNow }
}
