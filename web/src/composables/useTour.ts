/**
 * 818-E: 后台分步高亮导览（tour）控制器
 *
 * 设计约定：
 * - 模块级单例：Dashboard/OnboardingCard（触发方）与 TourOverlay（渲染方）共享同一份状态，
 *   跨嵌套路由切换（ArtistLayoutRoute 常驻）不丢进度。
 * - 稳健优先：目标元素找不到时轮询等待（懒加载路由/组件晚挂载都兜住），超时自动跳过该步；
 *   路由跳转失败或导览被停止时立即收尾，不留半截浮层。
 * - 持久化：首次进入自动启动的标记走 localStorage（safe 封装，键带 inkglean 前缀）；
 *   start() 不做 seen 检查——OnboardingCard 主按钮即「重置/再看一遍」入口。
 */
import { computed, reactive } from 'vue'
import router from '../router/index'
import { safeGetItem, safeSetItem } from '../utils/storage'

export const TOUR_SEEN_KEY = 'inkglean_tour_seen_v1'

export interface TourStep {
  /** 本步所在路由；与当前路由不一致时才跳转 */
  route: string
  /** 高亮目标 CSS 选择器 */
  target: string
  /** 选择器命中多个元素时取第几个（默认 0） */
  targetIndex?: number
  /** 气泡文案 i18n 键（tour.*） */
  textKey: string
}

export interface TourRect {
  top: number
  left: number
  width: number
  height: number
}

/** 目标查找轮询间隔 / 单步超时（毫秒） */
export const TARGET_POLL_MS = 50
export const TARGET_WAIT_MS = 3000
/** 轮询上限（与超时同量级；用次数而非 Date.now，测试推进定时器即可确定收敛） */
export const TARGET_MAX_POLLS = Math.ceil(TARGET_WAIT_MS / TARGET_POLL_MS)

/**
 * 默认 12 步：问候/待办（仪表盘）→ 排期看板 → 手动录单 → 订单列表 →
 * 价格管理 → 增项库 → 工具区（入口 + 水印 + 算价器）→ 偏好设置入口 → 设置页。
 * 文案键成对维护在 locales（tour.*），此处只放结构与选择器。
 */
export const DEFAULT_TOUR_STEPS: readonly TourStep[] = [
  { route: '/dashboard', target: '.greeting-note', textKey: 'tour.welcome' },
  { route: '/dashboard', target: '.ledger-card', textKey: 'tour.todo' },
  { route: '/queue', target: '.view-switch', textKey: 'tour.queue' },
  { route: '/orders/new', target: '.mo-toolbar', textKey: 'tour.manual' },
  { route: '/orders', target: '.search-bar', textKey: 'tour.orders' },
  { route: '/tiers', target: '.tier-page-title', textKey: 'tour.pricing' },
  // 增项库是价格管理第 4 个页签（画风与价格/流程与比例/折扣码/增项库），只指不点
  { route: '/tiers', target: '.el-tabs__item', targetIndex: 3, textKey: 'tour.addons' },
  { route: '/tools', target: 'a.nav-item[href="/tools"]', textKey: 'tour.toolbox' },
  { route: '/tools/watermark', target: '.wm-grid > .wm-panel:first-child', textKey: 'tour.watermark' },
  { route: '/tools/price-calc', target: '.price-calc-page .od-page-title', textKey: 'tour.priceCalc' },
  // 偏好设置入口：指侧边栏导航项（页面本身下批再挂「再看一遍」按钮，本批不碰 Preferences.vue）
  { route: '/preferences', target: 'a.nav-item[href="/preferences"]', textKey: 'tour.preferences' },
  { route: '/settings', target: '.main-content-inner > h2', textKey: 'tour.settings' }
]

interface TourState {
  active: boolean
  steps: TourStep[]
  index: number
  /** 当前步目标已解析、可渲染高亮与气泡 */
  ready: boolean
  targetEl: Element | null
  rect: TourRect | null
}

const state = reactive<TourState>({
  active: false,
  steps: [],
  index: 0,
  ready: false,
  targetEl: null,
  rect: null
})

let targetTimer: ReturnType<typeof setTimeout> | null = null
let rafId = 0
/** 步进竞态序号：快速连点/超时兜底时，旧 goTo 的后续写入一律作废 */
let goSeq = 0

function clearTimers(): void {
  if (targetTimer) {
    clearTimeout(targetTimer)
    targetTimer = null
  }
  if (rafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

export function hasSeen(): boolean {
  return safeGetItem(TOUR_SEEN_KEY) === '1'
}

export function markSeen(): void {
  safeSetItem(TOUR_SEEN_KEY, '1')
}

/** 目标解析：隐藏元素（display:none / 无绘制盒）不当作命中，交给轮询继续等 */
function resolveTarget(step: TourStep): Element | null {
  if (typeof document === 'undefined') return null
  const nodes = document.querySelectorAll(step.target)
  const el = nodes[step.targetIndex ?? 0]
  if (!el) return null
  if (el.getClientRects().length === 0) return null
  return el
}

function waitForTarget(step: TourStep): Promise<Element | null> {
  let polls = 0
  return new Promise((resolve) => {
    const poll = () => {
      if (!state.active) {
        resolve(null)
        return
      }
      const el = resolveTarget(step)
      if (el) {
        resolve(el)
        return
      }
      if (polls >= TARGET_MAX_POLLS) {
        resolve(null)
        return
      }
      polls += 1
      targetTimer = setTimeout(poll, TARGET_POLL_MS)
    }
    poll()
  })
}

function updateRect(): void {
  if (!state.active || !state.ready || !state.targetEl) return
  const r = state.targetEl.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return
  state.rect = { top: r.top, left: r.left, width: r.width, height: r.height }
}

function startTracking(): void {
  clearTimers()
  const loop = () => {
    updateRect()
    rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(loop) : 0
  }
  rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(loop) : 0
}

function scrollTargetIntoView(el: Element): void {
  // 目标不可见（如移动端抽屉外的侧边栏）由 resolveTarget 过滤；
  // 这里只负责把可见但滚出视口的目标带回可视区
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
}

async function goTo(index: number): Promise<void> {
  const mySeq = ++goSeq
  const steps = state.steps
  if (!state.active || steps.length === 0) return
  if (index < 0 || index >= steps.length) {
    finish()
    return
  }

  state.index = index
  state.ready = false
  state.targetEl = null
  state.rect = null
  clearTimers()

  const step = steps[index]
  try {
    if (step.route && router.currentRoute.value.path !== step.route) {
      await router.push(step.route)
    }
  } catch {
    // 跳转失败（如会话失效被守卫弹回登录）：结束导览，不留半截浮层
    finish()
    return
  }
  if (!state.active || mySeq !== goSeq) return

  const el = await waitForTarget(step)
  if (!state.active || mySeq !== goSeq) return
  if (!el) {
    // 稳健优先：目标找不到就跳过该步不崩；最后一步也找不到则直接收尾
    if (index >= steps.length - 1) {
      finish()
      return
    }
    void goTo(index + 1)
    return
  }

  state.targetEl = el
  state.ready = true
  scrollTargetIntoView(el)
  updateRect()
  startTracking()
}

export function start(steps: TourStep[] = [...DEFAULT_TOUR_STEPS]): void {
  if (steps.length === 0) {
    markSeen()
    return
  }
  clearTimers()
  goSeq++
  state.steps = steps
  state.index = 0
  state.active = true
  state.ready = false
  state.targetEl = null
  state.rect = null
  // 启动即记 seen：中途刷新不会再次自动弹（按钮「再看一遍」不受影响）
  markSeen()
  void goTo(0)
}

export function stop(): void {
  goSeq++
  clearTimers()
  state.active = false
  state.ready = false
  state.targetEl = null
  state.rect = null
}

export function finish(): void {
  markSeen()
  stop()
}

export function skip(): void {
  finish()
}

export function next(): void {
  if (!state.active) return
  if (state.index >= state.steps.length - 1) {
    finish()
    return
  }
  void goTo(state.index + 1)
}

export function prev(): void {
  if (!state.active || state.index <= 0) return
  void goTo(state.index - 1)
}

/** 单例访问入口：触发方（OnboardingCard）与渲染方（TourOverlay）共用同一份状态 */
export function useTour() {
  return {
    start,
    stop,
    next,
    prev,
    skip,
    hasSeen,
    markSeen,
    active: computed(() => state.active),
    index: computed(() => state.index),
    steps: computed(() => state.steps),
    ready: computed(() => state.ready),
    rect: computed(() => state.rect),
    defaultSteps: [...DEFAULT_TOUR_STEPS]
  }
}
