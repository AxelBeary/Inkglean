// useActivityFeed — 事件流水幕布的轮询 / 筛选 / 暂停状态机
//
// 为什么是轮询（SPEC §2.2 三选一对比的拍板结论）：
//   全仓零 SSE/WS 先例，引入等于同时开「部署 + 反代 + 断线重连 + step-up 重验」四块新面，
//   收益只是 5 秒 → 亚秒；轮询复用现有 cookie 鉴权与 registerAdminStepUpHooks 守卫，零新概念。
//
// 断线/失败策略（任务书硬要求「明确状态而非静默空白」）：
//   - 首次失败 → status='error'，幕布显示错误横幅 + 重试按钮（data-testid 由组件挂）；
//   - 已加载过数据后某次轮询失败 → status='stale'，保留最后一份数据 + 顶部明示"连接中断，
//     数据可能过期 + 最后成功时间"（不静默沿用旧数据假装实时）；
//   - 恢复成功 → 回 'live'。
//   绝不把失败当成"没有事件"（空态 ≠ 错误态，两者视觉与语义分开）。
//
// 定时器纪律（照 ArtistLayout.vue:429-443 先例 + split test 断言范式）：
//   - 单定时器，setInterval 只存一份句柄；
//   - 组件卸载 stop() 清零，零残留；
//   - document.hidden 时暂停（省电/省请求），回到前台立即刷新并恢复；
//   - 轮询请求带 in-flight 保护，避免慢响应堆叠（每次 tick 只允许一个请求在飞）。
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { activityApi } from '../../api/index'
import type { ActivityActorKind, ActivityEventItem } from '../../api/types'

/** 轮询间隔：5 秒（SPEC §2.2 建议值；后端限流 120 次/分钟，单页 5 秒 = 12 次/分钟，余量充足） */
export const ACTIVITY_POLL_MS = 5000

/** 幕布连接状态：live 实时 / paused 用户暂停 / stale 轮询失败但保留旧数据 / error 首次即失败 */
export type FeedStatus = 'live' | 'paused' | 'stale' | 'error'

export interface ActivityFeedFilters {
  action: string
  actorKind: ActivityActorKind | ''
}

export function useActivityFeed(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? ACTIVITY_POLL_MS

  const rows = ref<ActivityEventItem[]>([])
  const loading = ref(false)
  const status = ref<FeedStatus>('live')
  /** 用户显式暂停（与「页面隐藏自动暂停」区分：那是省电，这是用户意图） */
  const paused = ref(false)
  const lastSuccessAt = ref<number | null>(null)
  const hasMore = ref(false)
  const nextBeforeId = ref<number | null>(null)
  const filters = ref<ActivityFeedFilters>({ action: '', actorKind: '' })

  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  /** 当前是否真的在轮询（暂停/隐藏/出错时停） */
  const polling = computed(() => !paused.value && status.value !== 'error')

  function buildQuery() {
    return {
      ...(filters.value.action ? { action: filters.value.action } : {}),
      ...(filters.value.actorKind ? { actorKind: filters.value.actorKind } : {}),
      limit: 100
    }
  }

  /**
   * 拉一页。mode='replace' 整屏替换（首屏/轮询/筛选变更）；mode='append' 加载更早（翻页按钮）。
   */
  async function fetchPage(mode: 'replace' | 'append' = 'replace'): Promise<void> {
    // in-flight 保护：慢响应时不叠加请求（否则内网抖动会堆出一片并发）
    if (inFlight) return
    inFlight = true
    if (mode === 'replace') loading.value = rows.value.length === 0
    try {
      const params = mode === 'append' && nextBeforeId.value != null
        ? { ...buildQuery(), beforeId: nextBeforeId.value }
        : buildQuery()
      const res = await activityApi.getActivityEvents(params)
      rows.value = mode === 'append' ? [...rows.value, ...res.rows] : res.rows
      hasMore.value = res.hasMore
      nextBeforeId.value = res.nextBeforeId
      lastSuccessAt.value = Date.now()
      // 用户暂停时保持 paused；否则回 live
      status.value = paused.value ? 'paused' : 'live'
    } catch {
      // 有旧数据 → stale（明示过期）；一无所有 → error（全屏错误态）
      status.value = rows.value.length > 0 ? 'stale' : 'error'
    } finally {
      inFlight = false
      loading.value = false
    }
  }

  /** 加载更早一页（幕布底部"加载更早"按钮） */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || inFlight) return
    await fetchPage('append')
  }

  /** 切换筛选：清空游标重拉（防旧游标跨筛选串数据） */
  async function applyFilters(next: Partial<ActivityFeedFilters>): Promise<void> {
    filters.value = { ...filters.value, ...next }
    nextBeforeId.value = null
    hasMore.value = false
    await fetchPage('replace')
  }

  function startTimer(): void {
    stopTimer()
    if (!polling.value) return
    timer = setInterval(() => {
      // 页面隐藏时不发请求（visibilitychange 已停表，此处再兜一层防漏）
      if (typeof document !== 'undefined' && document.hidden) return
      void fetchPage('replace')
    }, pollMs)
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  /** 用户暂停/恢复 */
  async function togglePause(): Promise<void> {
    paused.value = !paused.value
    if (paused.value) {
      stopTimer()
      status.value = 'paused'
    } else {
      await fetchPage('replace')
      startTimer()
    }
  }

  /** 手动重试（错误态横幅的按钮）：重置状态后立刻拉一次并恢复轮询 */
  async function retry(): Promise<void> {
    status.value = 'live'
    await fetchPage('replace')
    startTimer()
  }

  function onVisibilityChange(): void {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopTimer()
    } else if (!paused.value && status.value !== 'error') {
      void fetchPage('replace')
      startTimer()
    }
  }

  onMounted(async () => {
    await fetchPage('replace')
    startTimer()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stopTimer()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {
    rows, loading, status, paused, polling, lastSuccessAt, hasMore, nextBeforeId, filters,
    fetchPage, loadMore, applyFilters, togglePause, retry,
    // 测试用：暴露定时器是否还活着（断言"零残留"）
    __hasTimer: () => timer !== null
  }
}
