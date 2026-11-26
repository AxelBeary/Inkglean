/**
 * useSignatureRefresh — 签名 URL 定时刷新（R33）
 *
 * 签名 URL 有效期 5 分钟（事实源 server/src/shared/file-sign.ts 的 FILE_TTL_MS，
 * 260830 审计 H-4 已从 15 分钟缩短），长停留页面图片会 403。
 * 本 composable 每 intervalMs（默认 3 分钟）收集当前页面所有裸路径，
 * 调换签端点（默认 POST /api/artist/refresh-signatures）批量换新，静默写回响应式数据。
 * G1 裁决（2026-09-27）：取候选 (a)+(c)——旧值（10 分钟间隔 / 8 分钟补刷阈）按 15 分钟 TTL
 * 设计，均已超过现行 5 分钟 TTL，页面停 5~10 分钟必裂图（仅靠 @error 兜底）；
 * 压间隔安全性已核（交接档 G1：限流 20 次/5min，双实例同开仅约 2.5 次→3 分钟间隔亦在限内）。
 *
 * 用法：
 *   const { refreshNow } = useSignatureRefresh({
 *     collect: () => order.value?.references?.map(r => r.file_path) || [],
 *     apply: (urlMap) => { ... 把新 URL 写回 order ... },
 *   })
 *   // el-image @error="() => refreshNow(path)" 作为兜底（加载失败立即刷新该图）
 *
 * 客户查单页（TrackOrder）复用同一套定时/回前台/防重入逻辑，只把换签端点换成客户侧
 * POST /api/orders/track/:orderNo/refresh-signatures（身份是订单令牌，画师端点用不了），
 * 故 request 可注入；默认仍是画师端点，既有调用方零变化。
 *
 * BUG-5 修复（按图刷新，治本）：
 * - refreshNow(path) 接受出错图片的 path，只刷新该图——其他图 src 不变，
 *   消除"一张图 error → 全量刷新 → 所有图 src 变化 → 循环闪烁"的根因
 * - errorRetries 改为 Map<path, count>，按图独立计数，单张坏图不耗尽全局重试预算
 * - 非字符串入参（如 el-image 透传的 event 对象，OrderDetail 旧用法）视为无参，
 *   回退全量刷新——向后兼容，未改造的消费者行为不变
 *
 * 硬规则：
 * - 失败只暴露不中断（issue #52-5：refreshError 可见，不再静默吞掉整批失败）；
 *   #62 尾巴清收：失败连发开始时另弹一次用户可见提示（连续失败不刷屏，恢复后重置）
 * - 防重入（多张图同时 error 合并为一次批量刷新）
 * - @error 触发的刷新加 300ms 防抖 + 每图最大重试 2 次
 * - 定时刷新不受重试上限限制（定期兜底不应被阻断）
 * - onUnmounted 自动清理定时器和防抖计时器
 */
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { artistApi } from '../api/index'

// G1：后端签名 TTL 已缩至 5 分钟（file-sign.ts FILE_TTL_MS），间隔/阈值同步压缩并 export 做口径哨兵。
export const SIGNATURE_TTL_MS = 5 * 60 * 1000 // 后端口径镜像（事实源在 server，此处仅供哨兵断言）
export const DEFAULT_INTERVAL_MS = 3 * 60 * 1000 // 3 分钟（TTL 5 分钟，留 2 分钟余量）
const MAX_ERROR_RETRIES = 2 // @error 触发刷新的每图最大重试次数
// R-15: 后台标签回可见的补刷阈值（Chrome 节流 setInterval 后，切后台签名会过期；
// 回可见时距上次刷新超过该阈值立即补一次。G1：旧值 8 分钟 > TTL 5 分钟已失效，压至 2 分钟）
export const VISIBLE_REFRESH_THRESHOLD_MS = 2 * 60 * 1000
// #52-5：服务端 refresh-signatures 的 paths 上限是 maxItems:50（server/src/features/order/order-list.routes.ts），
// 整批超限会被 400 拒掉——长列表一次收集上百张图时全量刷新会整体失效，故按上限分片。
export const SIGNATURE_REFRESH_BATCH_SIZE = 50

// 可选第 6 件（#62 尾巴清收·跨实例补丁）：OrderDetail 主页与其内嵌 PreviewPanel 同屏各持一个
// 实例，同一次网络故障两实例几乎同时各弹一条相同文案的 warning。模块级标志挡掉第二条；
// 任一实例刷新成功即复位——单实例「失败连发只弹一次、恢复重置」语义不变
//（单实例视角下，标志的置位/复位窗口与自身 refreshError 非空窗口逐点重合）。
// WEB-01（debug-swarm 11-24）：标志原本只随「有实例成功」复位、随页面卸载不清，生命周期是
// 整个 JS 模块而非「同屏实例组」——A 页离线失败置位后保持离线、路由到 B 页新实例首次失败
// 被吞。补活跃实例计数：归零（旧页面全部卸载、同屏实例组解体）即清标志，B 页首败照常提示。
let crossInstanceWarned = false
let activeInstances = 0

/** 仅供测试：复位跨实例去重标志与活跃实例计数（模块级状态会跨用例泄漏，warning 断言用例的 beforeEach 须复位） */
export function __resetCrossInstanceWarnForTest(): void {
  crossInstanceWarned = false
  activeInstances = 0
}

/**
 * 从签名 URL 取出存储路径（/uploads/<path>?sig=... → <path>）；非上传 URL 返回 null。
 *
 * 续签链路两端都要它：收集时把已渲染的 img src 反解成裸路径，写回时再按同一路径换上新 URL。
 * 依赖 signedUrl() 不对路径做 URL 编码（server/src/shared/file-sign.ts 直接拼 /uploads/<filePath>?sig=）——
 * 若将来那边改成 encodeURI，这里会静默失配（续签恒 400，表现为「图还是裂」），需同步改。
 */
export function uploadedPathFromUrl(url: string): string | null {
  const matched = /^\/uploads\/([^?#]+)/.exec(url)
  return matched ? matched[1] : null
}

export function useSignatureRefresh({ collect, apply, onSkipped, intervalMs = DEFAULT_INTERVAL_MS, request = (paths) => artistApi.refreshSignatures(paths) }: {
  collect: () => string[]
  apply: (urls: Record<string, string>) => void
  /** 本次未获授权的路径（客户侧续签专有）：页面据此摘掉已失效的图，不再留一张裂图 */
  onSkipped?: (paths: string[]) => void
  intervalMs?: number
  /** 换签请求（默认画师端 refresh-signatures；客户查单页注入 track 版端点，响应同形 { urls, skipped? }） */
  request?: (paths: string[]) => Promise<{ urls: Record<string, string>; skipped?: string[] }>
}) {
  activeInstances++ // WEB-01：记录同屏活跃实例组规模；归零时清跨实例去重标志（见 onUnmounted）
  // TASK2-05：实例级卸载闸门。在途 doRefresh 的 await 恢复后必须止步，否则卸载页的过期失败
  // 会重新置位 crossInstanceWarned 并弹 toast，吞掉新页面实例的首次失败警告（反噬 WEB-01）。
  let unmounted = false
  let refreshing = false
  let debounceTimer: number | null = null
  let lastRefreshAt = Date.now()
  const pendingPaths = new Set<string>() // 等待刷新的出错图片 path（BUG-5：Set 去重）
  const errorRetries = new Map<string, number>() // path → 重试次数（BUG-5：按图独立计数）
  // #52-5: 最近一次失败原因（成功即清空）；调用方/测试可据此感知，不再静默
  const refreshError = ref<unknown>(null)

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
    // 已成功换签的路径数：分片失败时只对未换签的路径累加重试计数
    let done = 0
    try {
      // #52-5: 按服务端上限分片、串行提交（并发会撞 refresh-sig 限流 20 次/5min）
      for (let i = 0; i < targets.length; i += SIGNATURE_REFRESH_BATCH_SIZE) {
        const chunk = targets.slice(i, i + SIGNATURE_REFRESH_BATCH_SIZE)
        const res = await request(chunk)
        // TASK2-05：await 恢复后先确认本实例仍挂载——卸载后不写响应式数据、不回调页面
        if (unmounted) return
        apply(res.urls)
        // 失效路径（画师关开关/删图）：交给页面摘掉对应图，避免留一张 403 裂图
        if (res.skipped && res.skipped.length > 0) onSkipped?.(res.skipped)
        done = i + chunk.length
      }
      if (unmounted) return // 卸载后的成功回执不得复位跨实例标志（新页可能已置位）
      lastRefreshAt = Date.now() // 只按成功刷新计时（失败不推迟补刷）
      refreshError.value = null
      // 可选第 6 件：跨实例去重标志随「有实例恢复成功」复位（单实例等价于原「恢复重置」语义）；
      // 另一复位入口在 onUnmounted——活跃实例归零（离开页面）时清标志，见 WEB-01
      crossInstanceWarned = false
      for (const p of targets) errorRetries.delete(p) // 刷新成功 → 清除该图计数
    } catch (err) {
      // TASK2-05：卸载后的在途失败一律止步——不置模块标志、不弹过期 toast、不动重试计数；
      // 由 finally 收回 refreshing 即可，跨页首败警告的槽位留给新实例。
      if (unmounted) return
      // #52-5: 失败即停止后续分片，但把失败暴露出去（原实现整段静默）
      // #62 尾巴清收：refreshError 只是「暴露」，全仓无页面消费它仍不可见——分片失败整批停后，
      // 用户只看到裂图毫无解释。失败连发开始时弹一次可见提示：3 分钟定时仍在重试，
      // 连续失败不重复刷屏；恢复成功（refreshError 清空）后下轮失败才会再提示。
      // i18n 动态引用不 await：首次加载 locale 模块是真实 IO，await 会让 refreshing 守卫
      // 卡在模块加载上、阻塞后续 @error 补刷；挂到 .then 链上失败回落原始文案（同 http.ts 口径）。
      const becameFailure = refreshError.value === null
      refreshError.value = err
      // 可选第 6 件（跨实例去重）：本实例是「失败连发开始」，但同屏另一实例已弹过相同文案 → 不再弹；
      // 标志照常置位（顺带吞掉第三实例的同步首败），直到任一实例恢复成功才复位
      const shouldWarn = becameFailure && !crossInstanceWarned
      if (becameFailure) crossInstanceWarned = true
      if (shouldWarn) {
        void import('../i18n/index')
          .then(({ i18n }) => {
            // TASK2-05：i18n 动态 import 是真实 IO，若加载期间页面已卸载，不再弹过期 toast
            if (unmounted) return
            ElMessage.warning(i18n.global.t('common.networkError'))
          })
          .catch(() => {
            if (unmounted) return // TASK2-05：兜底文案同样不给已卸载页面弹
            // i18n 加载失败时的兜底（http.ts:154 同款回落）——i18n 不可用便无法 t()，
            // 只能给原始文案；走变量赋值而非 ElMessage 直参字面量，同 http.ts 不入 check-i18n 的 message-en 规则
            const fallback = 'Network error, please try again later'
            ElMessage.warning(fallback)
          })
      }
      if (fromError) {
        // BUG-5：按图累加，超限后仅该图不再重试，其他图不受影响
        for (const p of targets.slice(done)) errorRetries.set(p, (errorRetries.get(p) || 0) + 1)
      }
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
    unmounted = true // TASK2-05：先关闸门，再清定时器/计数；在途 doRefresh 恢复后据此止步
    clearInterval(timer)
    if (debounceTimer != null) clearTimeout(debounceTimer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    // WEB-01：实例组解体（最后一个活跃实例卸载）→ 清跨页面去重标志。
    // 这样 A 页离线失败置位后，路由到 B 页（A 已卸载）新实例的首次失败仍能弹出可见警告。
    activeInstances = Math.max(0, activeInstances - 1)
    if (activeInstances === 0) crossInstanceWarned = false
  })

  return { refreshNow, refreshError }
}
