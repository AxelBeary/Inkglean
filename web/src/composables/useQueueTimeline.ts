/**
 * 排期看板时间条状态机（从 QueueBoardCalendar.vue 拆分，纯搬移零行为变化）
 * 2026-08-10 拆分批：缩放档位/视口自适应/画布范围/Excel 滚动/刻度虚拟化/
 * 画布手势（平移/滚轮缩放/双指 pinch）/横条拖拽改期/撤销 toast
 *
 * 模式对齐 v0.40 OrderDetail 瘦身批（useOrderPaymentPanel 等）：
 * - 共享数据源 calOrders 与日期工具（dateKey/parseDate）由宿主传入（月历视图同源）
 * - tlDragHappened 点击抑制标记由宿主持有（goOrder 消费），经 markDragHappened 回写
 * - 拖拽成功后的队列行内联更新经 findOrder 定位宿主 props 内对象（与原实现一致）
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import { artistApi } from '../api/index'
import type { ApiError } from '../api/index'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { safeGetItem, safeSetItem } from '../utils/storage'
import type { VersionedOptions } from '../api/types'

/** 缩放档位键 */
type TlZoomKey = '2w' | '1m' | '3m' | '6m' | '1y'

/** 时间条订单行形状（calOrders 共享数据源，与月历视图同源） */
interface TlCalOrder {
  id: number
  status: string
  startDate?: string | null
  created_at?: string | null
  confirmed_at?: string | null
  deadline?: string | null
  version?: number | null
}

/** 时间条横条行（tlRows 计算产物） */
interface TlRow {
  order: TlCalOrder
  left: number
  width: number
  startDate: Date
  endDate: Date
  noDeadline: boolean
  startClipped: boolean
  endClipped: boolean
}

/** 拖拽状态（null = 未在拖拽） */
interface TlDragState {
  orderId: number
  edge: 'start' | 'deadline' | 'move'
  startDate: Date
  endDate: Date
  noDeadline: boolean
  oldStartDate: string | null
  oldDeadline: string | null
  startX: number
  dayDelta: number
  pointerX: number
  pointerY: number
}

/** 刻度区平移手势状态 */
interface TlAxisPan {
  startScrollX: number
  startScrollY: number
  startX: number
  startY: number
  moved: boolean
}

/** 撤销快照：拖拽提交成功后记录订单与新值/旧值 */
interface TlUndoState {
  orderId: number
  edge: TlDragState['edge']
  oldStartDate: string | null
  oldDeadline: string | null
  newStart: string
  newEnd: string
  newVersion: number | undefined
}

export function useQueueTimeline({ calOrders, getViewMode, findOrder, onRefreshAll, dateKey, parseDate, markDragHappened }: {
  calOrders: Ref<TlCalOrder[]>
  getViewMode: () => string
  findOrder: (orderId: number) => TlCalOrder | null | undefined
  onRefreshAll: () => Promise<void> | void
  dateKey: (d: Date) => string
  parseDate: (s: string | null | undefined) => Date | null
  markDragHappened: () => void
}) {
  const { t, locale } = useI18n()

// ─── v0.25 D: 时间条视图（SPEC-005 §3，共享 calOrders 数据源） ───
const TL_ZOOM_KEY = 'queue_tl_zoom'
// v0.36 波1: 四档缩放。批F(2026-08-08): 档位只定义 dayWidth——画布恒覆盖订单日期范围，
// 视野宽度由容器决定（不再由 days 裁剪），days 字段删除
// 档位 = 视野宽度（视口内显示的天数），dayWidth 由视口宽÷视野天数自适应（Google Calendar 式）
// oimimo 吸纳批二（2026-08-20）：补「年」全景档（对标其甘特图 year 视图，看全年排期大势）
const TL_ZOOMS: Record<TlZoomKey, { viewDays: number }> = {
  '2w': { viewDays: 14 },
  '1m': { viewDays: 30 },
  '3m': { viewDays: 90 },
  '6m': { viewDays: 180 },
  '1y': { viewDays: 365 }
}
/** 窄屏降级表：视口 <768px 时这些粗档体验过挤（天宽钳到 4px），初始化落 1m */
const TL_NARROW_COARSE: TlZoomKey[] = ['3m', '6m', '1y']
// localStorage 兼容：老版本存的 '2m' 档已删除，落到 '3m'
// G-5: 裸读写换 safe 封装（存储禁用时按默认档降级，不抛错）
const storedTlZoom = safeGetItem(TL_ZOOM_KEY)
let initialTlZoom: TlZoomKey =
  storedTlZoom && TL_ZOOMS[storedTlZoom as TlZoomKey]
    ? storedTlZoom as TlZoomKey
    : (storedTlZoom === '2m' ? '3m' : '2w')
// oimimo 吸纳批二：窄屏默认档降级——手机上看全年/半年档等于看蚂蚁，落 1m；
// 仅当次生效不回写 localStorage（宽屏偏好不丢，对标 oimimo 按窗宽选默认视图的做法）
if (typeof window !== 'undefined' && window.innerWidth < 768 && TL_NARROW_COARSE.includes(initialTlZoom)) {
  initialTlZoom = '1m'
}
const tlZoom = ref<TlZoomKey>(initialTlZoom)
function saveTlZoom(val: TlZoomKey) { safeSetItem(TL_ZOOM_KEY, val) }

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

// ─── oimimo 吸纳批二：「仅进行中/全部」过滤（默认仅进行中）───
// 对标其甘特图 filterActive：已完成/已交付/已取消的老横条会把可视区挤空，
// 默认只看在做的单，一键切全部。终态口径与拖拽守卫 TL_TERMINAL_STATUSES 同源
const TL_TERMINAL_STATUSES = ['done', 'delivered', 'cancelled']
const tlFilterActive = ref(true)
/** el-radio-group emit 为宽类型，只认严格 true（与宿主页 changeTlZoom 包装同口径） */
function setTlFilter(active: string | number | boolean | undefined) { tlFilterActive.value = active === true }
/** 过滤后的数据源：画布范围与横条行都消费它（切「全部」画布自然扩回老单范围） */
const tlFilteredOrders = computed(() =>
  tlFilterActive.value
    ? calOrders.value.filter(o => !TL_TERMINAL_STATUSES.includes(o.status))
    : calOrders.value
)

// 视口宽度（.tl-scroll clientWidth），ResizeObserver 跟踪；档位=视野天数 → dayWidth=视口宽/视野天数
const tlViewportW = ref(0)
let tlViewportObserver: ResizeObserver | null = null
function watchTlViewport() {
  const el = tlScrollEl.value
  if (!el) return
  tlViewportW.value = el.clientWidth || 0
  tlViewportObserver?.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    tlViewportObserver = new ResizeObserver(() => {
      if (tlScrollEl.value) tlViewportW.value = tlScrollEl.value.clientWidth || 0
    })
    tlViewportObserver.observe(el)
  }
}
onMounted(watchTlViewport)
onBeforeUnmount(() => { tlViewportObserver?.disconnect() })
/** 天宽：档位决定视野内天数，视口宽÷视野天数 → 自适应（Google Calendar 式缩放） */
const tlDayWidth = computed(() => {
  const days = TL_ZOOMS[tlZoom.value].viewDays
  const w = tlViewportW.value || 1200
  return Math.max(4, Math.round(w / days))
})
// ─── v0.42 时间条 Excel 式滚动（用户第 6 条反馈）+ 批F(2026-08-08) 画布覆盖订单范围 ───
// 批F: 画布恒覆盖「全部订单日期范围 ∪ 今天」+ 余量；缩放只改 dayWidth/视野中心，
// 画布不再被视野窗口裁剪 → 任何档位下窗口外订单都可拖拽/滚动查看
/** 画布余量（天）与宽度上限（防极端数据：超上限部分截断属预期保护） */
const TL_CANVAS_PAD_DAYS = 7
const TL_CANVAS_MAX_PX = 120000
/** 订单实际日期范围（过滤后订单最早/最晚的开工日/截稿日，startOfDay 归一） */
const tlOrderRange = computed(() => {
  let min: Date | null = null, max: Date | null = null
  for (const order of tlFilteredOrders.value) {
    const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
    if (rawStart) {
      const d = startOfDay(rawStart)
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
    const rawEnd = parseDate(order.deadline)
    if (rawEnd) {
      const d = startOfDay(rawEnd)
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
  }
  return { min, max }
})
/** 画布起点：最早订单日与今天取更早，再减余量（保证今天线始终在画布内） */
const tlCanvasStart = computed(() => {
  const today = startOfDay(new Date())
  const { min } = tlOrderRange.value
  const anchor = min && min < today ? min : today
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - TL_CANVAS_PAD_DAYS)
})
/** 画布终点：最晚订单日与今天取更晚，再加余量 */
const tlCanvasEnd = computed(() => {
  const today = startOfDay(new Date())
  const { max } = tlOrderRange.value
  const anchor = max && max > today ? max : today
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + TL_CANVAS_PAD_DAYS)
})
const tlCanvasDays = computed(() =>
  Math.round((tlCanvasEnd.value.getTime() - tlCanvasStart.value.getTime()) / 86_400_000) + 1
)
/** 画布宽度：覆盖订单范围（min = 当前跨度），上限 TL_CANVAS_MAX_PX（防极端数据） */
const tlCanvasWidth = computed(() => Math.min(tlCanvasDays.value * tlDayWidth.value, TL_CANVAS_MAX_PX))

/** 日期 → 画布 x 坐标（相对画布起点；画布覆盖订单范围，x ≥ 0） */
function tlX(date: Date) {
  const ms = startOfDay(date).getTime() - tlCanvasStart.value.getTime()
  return Math.round(ms / 86_400_000) * tlDayWidth.value
}

/** 滚动容器状态（提前声明：tlTicks 虚拟化依赖） */
const tlScrollEl = ref<HTMLElement | null>(null)
const tlScrollLeft = ref(0)
function onTlScroll() { tlScrollLeft.value = tlScrollEl.value?.scrollLeft || 0 }

/** 日期刻度数组（虚拟化：只渲染视口内 ± buffer 的刻度，画布 2 万 px 也不卡）
 * v0.36 波1 刻度密度适配：
 * - dayWidth ≥ 32（2w/1m）：每天标签 M/D
 * - 16 ≤ dayWidth < 32：每天标签，仅日号
 * - 8 ≤ dayWidth < 16（3m）：仅周一出标签（日号），避免重叠
 * - dayWidth < 8（6m）：仅每月 1 号出标签（短月名），周末染色跳过
 */
const TL_TICK_BUFFER = 4
const tlTicks = computed(() => {
  const ticks: { key: string; x: number; label: string; weekend: boolean; isToday: boolean }[] = []
  const todayKey = dateKey(new Date())
  const start = tlCanvasStart.value
  const dw = tlDayWidth.value
  const vw = tlViewportW.value || 1200
  const first = Math.max(0, Math.floor(tlScrollLeft.value / dw) - TL_TICK_BUFFER)
  const last = Math.min(tlCanvasDays.value, Math.ceil((tlScrollLeft.value + vw) / dw) + TL_TICK_BUFFER)
  const monthFmt = new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en', { month: 'short' })
  for (let i = first; i < last; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    let label: string
    if (dw >= 32) label = `${d.getMonth() + 1}/${d.getDate()}`
    else if (dw >= 16) label = String(d.getDate())
    else if (dw >= 8) label = d.getDay() === 1 ? String(d.getDate()) : '' // 3m: 仅周一
    else label = d.getDate() === 1 ? monthFmt.format(d) : '' // 6m: 仅每月 1 号
    ticks.push({
      key: dateKey(d),
      x: i * dw,
      label,
      weekend: dw >= 8 && (d.getDay() === 0 || d.getDay() === 6), // 低缩放跳过周末染色
      isToday: dateKey(d) === todayKey
    })
  }
  return ticks
})

/** 今天参考线 x（不在画布内 → null；画布恒含今天，故通常有值） */
const tlTodayX = computed(() => {
  const today = startOfDay(new Date())
  if (today < tlCanvasStart.value) return null
  const x = tlX(today)
  return x > tlCanvasWidth.value ? null : x + Math.floor(tlDayWidth.value / 2)
})
/** 今天是否在容器可见区内（今天恒在画布内，需结合滚动位置判断；scroll 事件驱动更新） */
const tlIsTodayVisible = computed(() => {
  const x = tlTodayX.value
  if (x == null) return false
  const el = tlScrollEl.value
  const w = el ? el.clientWidth : 0
  return x >= tlScrollLeft.value && x <= tlScrollLeft.value + w
})
function tlGoToday() {
  nextTick(() => {
    const el = tlScrollEl.value
    if (!el) return
    const x = tlX(new Date())
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3)
  })
}

/** 时间条行：按确认日排序，横条裁剪到画布（v0.42 画布覆盖订单范围）；未设截稿 → 画满到画布末端 */
const tlRows = computed(() => {
  const winStart = tlCanvasStart.value
  const winEnd = tlCanvasEnd.value
  return tlFilteredOrders.value
    .map((order): TlRow | null => {
      const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
      if (!rawStart) return null
      const start = startOfDay(rawStart)
      const rawEnd = parseDate(order.deadline)
      const noDeadline = !rawEnd
      const end = rawEnd ? startOfDay(rawEnd) : winEnd // 未设截稿：画满到画布末端
      if (end < winStart || start > winEnd) return null // 与画布无交集
      // 裁剪到画布
      const clipStart = start < winStart ? winStart : start
      const clipEnd = end > winEnd ? winEnd : end
      return {
        order,
        left: tlX(clipStart),
        width: (Math.round((clipEnd.getTime() - clipStart.getTime()) / 86_400_000) + 1) * tlDayWidth.value - 4,
        // v0.28 拖拽用：真实起止日（startOfDay 归一）+ 是否被窗口裁剪
        startDate: start,
        endDate: end,
        noDeadline,
        startClipped: start < winStart,
        endClipped: end > winEnd
      }
    })
    .filter((row): row is TlRow => row !== null)
    .sort((a, b) => {
      const sa = parseDate(a.order.startDate) || parseDate(a.order.created_at) || parseDate(a.order.confirmed_at)
      const sb = parseDate(b.order.startDate) || parseDate(b.order.created_at) || parseDate(b.order.confirmed_at)
      return (sa?.getTime() || 0) - (sb?.getTime() || 0)
    })
})

/** 切到时间条视图时，滚动到今天附近 */
watch(() => getViewMode(), (mode) => {
  if (mode !== 'timeline') return
  nextTick(() => {
    const el = tlScrollEl.value
    if (!el) return
    const today = startOfDay(new Date())
    const x = tlX(today)
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3)
  })
}, { immediate: true })

// ─── 批F + 批F2(2026-08-08) + 重做(2026-08-08): 画布手势——拖拽平移 / 滚轮缩放 / 双指 pinch ───
// 事件绑定在整个 .tl-canvas（刻度区 + 横条区 + 空白区）：
// - 空白/刻度区拖拽 = 平移（地图式），滚轮 = 缩放，双指 = pinch 缩放
// - 横条/手柄自身 pointerdown 会 stopPropagation，只走改期拖拽，不触发画布平移
/** 缩放档位顺序（放大方向）；oimimo 吸纳批二补 1y 全景档 */
const TL_ZOOM_ORDER: TlZoomKey[] = ['2w', '1m', '3m', '6m', '1y']

/** 切档：更新 tlZoom + 持久化 + 保持视野中心。radio 点击 / 滚轮 / pinch 统一走这里 */
function changeTlZoom(nextZoom: TlZoomKey) {
  if (!TL_ZOOMS[nextZoom] || nextZoom === tlZoom.value) return
  const prevDayWidth = tlDayWidth.value // 旧 dayWidth（切档前取值，供中心换算）
  tlZoom.value = nextZoom
  saveTlZoom(nextZoom)
  keepTlCenter(prevDayWidth)
}

/** 缩放切换后保持视野中心日期：按旧 dayWidth 把滚动中心换算成日期，切后重新定位 */
function keepTlCenter(prevDayWidth: number) {
  const el = tlScrollEl.value
  if (!el) return
  const dw = prevDayWidth || tlDayWidth.value
  const centerX = el.scrollLeft + el.clientWidth / 2
  const centerDate = new Date(tlCanvasStart.value.getTime() + Math.round(centerX / dw) * 86_400_000)
  nextTick(() => {
    const x = tlX(centerDate)
    el.scrollLeft = Math.max(0, Math.min(x - el.clientWidth / 2, el.scrollWidth - el.clientWidth))
  })
}

/** 滚轮缩放：deltaY 累计 ≥ 阈值切一档（快速连滚可多档，慢滚一次一档；保持视野中心） */
let tlWheelAcc = 0
const TL_WHEEL_STEP = 48
function onTlCanvasWheel(e: WheelEvent) {
  tlWheelAcc += e.deltaY
  if (Math.abs(tlWheelAcc) < TL_WHEEL_STEP) return
  const dir = tlWheelAcc > 0 ? 1 : -1 // 下滚 = 缩小（视野变宽）；上滚 = 放大（视野变窄）
  tlWheelAcc = 0
  const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
  const next = TL_ZOOM_ORDER[idx + dir]
  if (next) changeTlZoom(next)
  e.preventDefault() // 滚轮在画布 = 缩放，不滚动画布
}

// ─── 刻度区指针手势状态（批F 平移 / 批F2 pinch） ───
const tlAxisPointers = new Map<number, { x: number; y: number }>() // pointerId → { x, y }
let tlAxisPan: TlAxisPan | null = null // { startScrollX, startScrollY, startX, startY, moved }
let tlPinchDist = 0 // 双指初始间距（>0 表示 pinch 中）
const tlAxisPanning = ref(false) // 平移中 → 光标 grabbing
/** 平移轻移阈值（px）：超过才开始移动，防点击误触 */
const TL_AXIS_PAN_THRESHOLD = 4

function onTlCanvasDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // 横条/手柄/行标签按下 → 不启动画布手势（横条拖拽/点击由自身 handler 处理）
  const target = e.target as Element | null
  if (target && target.closest && target.closest('.tl-bar, .tl-handle, .tl-row-label')) return
  e.preventDefault()
  tlAxisPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 第二根手指落下：释放平移 capture，进入 pinch（记录初始间距）
  if (tlAxisPointers.size === 2) {
    const [a, b] = [...tlAxisPointers.values()]
    tlPinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    tlAxisPan = null
    tlAxisPanning.value = false
    const el = tlScrollEl.value
    if (el) {
      for (const id of [...tlAxisPointers.keys()]) {
        try { el.releasePointerCapture(id) } catch { /* 未捕获则忽略 */ }
      }
    }
    return
  }
  // 第一根手指/鼠标：准备平移（不立即移动，超阈值才生效）
  if (tlAxisPointers.size === 1) {
    const el = tlScrollEl.value
    tlAxisPan = {
      startScrollX: el ? el.scrollLeft : 0,
      startScrollY: el ? el.scrollTop : 0,
      startX: e.clientX, startY: e.clientY,
      moved: false
    }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
  }
}

function onTlCanvasMove(e: PointerEvent) {
  if (!tlAxisPointers.has(e.pointerId)) return
  const cur = { x: e.clientX, y: e.clientY }
  tlAxisPointers.set(e.pointerId, cur)
  // pinch：两指间距变化 ≥20% 切一档并重置基准（连续捏合可多档）
  if (tlAxisPointers.size === 2 && tlPinchDist > 0) {
    const [a, b] = [...tlAxisPointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (dist / tlPinchDist >= 1.2) {
      const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
      if (idx < TL_ZOOM_ORDER.length - 1) changeTlZoom(TL_ZOOM_ORDER[idx + 1])
      tlPinchDist = dist
    } else if (dist / tlPinchDist <= 0.8) {
      const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
      if (idx > 0) changeTlZoom(TL_ZOOM_ORDER[idx - 1])
      tlPinchDist = dist
    }
    return
  }
  // 单指/鼠标：平移（超过轻移阈值才生效；地图式 2D：左右=时间轴，上下=订单列表）
  const pan = tlAxisPan
  if (!pan || tlAxisPointers.size !== 1) return
  const deltaX = e.clientX - pan.startX
  const deltaY = e.clientY - pan.startY
  if (!pan.moved) {
    if (Math.abs(deltaX) < TL_AXIS_PAN_THRESHOLD && Math.abs(deltaY) < TL_AXIS_PAN_THRESHOLD) return
    pan.moved = true
    tlAxisPanning.value = true
  }
  const el = tlScrollEl.value
  if (el) {
    el.scrollLeft = pan.startScrollX - deltaX
    el.scrollTop = pan.startScrollY - deltaY
  }
}

function onTlCanvasUp(e: PointerEvent) {
  if (!tlAxisPointers.has(e.pointerId)) return
  tlAxisPointers.delete(e.pointerId)
  if (tlAxisPointers.size < 2) tlPinchDist = 0
  if (tlAxisPointers.size === 0) {
    tlAxisPan = null
    tlAxisPanning.value = false
    return
  }
  // 双指 pinch 抬起一根：剩余单指以当前 scroll 为新基准继续平移
  if (tlAxisPointers.size === 1) {
    const [only] = [...tlAxisPointers.values()]
    const el = tlScrollEl.value
    tlAxisPan = {
      startScrollX: el ? el.scrollLeft : 0,
      startScrollY: el ? el.scrollTop : 0,
      startX: only.x, startY: only.y,
      moved: false
    }
  }
}

function onTlCanvasCancel(e: PointerEvent) {
  if (e.pointerId != null && tlAxisPointers.has(e.pointerId)) {
    tlAxisPointers.delete(e.pointerId)
  }
  if (tlAxisPointers.size < 2) tlPinchDist = 0
  if (tlAxisPointers.size === 0) {
    tlAxisPan = null
    tlAxisPanning.value = false
  }
}

// ─── v0.28: 时间条拖拽（原生 Pointer Events：右端改截稿日 / 左端改开工日，吸附到天） ───
// TL_TERMINAL_STATUSES 已上提至过滤段（仅进行中过滤与拖拽守卫同源）

/**
 * 拖拽状态（null = 未在拖拽）
 * { orderId, edge('start'|'deadline'), startDate, endDate, noDeadline,
 *   startX, dayDelta, pointerX, pointerY }
 */
const tlDrag = ref<TlDragState | null>(null)

/** 终态订单不可拖；被窗口裁剪的端点不可拖（拖了等于把日期设成窗口边界，误导） */
function tlCanDragStart(row: TlRow) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.startClipped
}
function tlCanDragEnd(row: TlRow) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.endClipped
}
/** REQ-019: 整体平移——非终态 + 有截稿日 + 两端未被裁剪 */
function tlCanDragMove(row: TlRow) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.noDeadline && !row.startClipped && !row.endClipped
}

/** 横条样式：拖拽中按 dayDelta 覆盖 left/width，其余走 tlRows 计算值 */
function tlBarStyle(row: TlRow) {
  const d = tlDrag.value
  if (!d || d.orderId !== row.order.id) {
    return { left: row.left + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  const dw = d.dayDelta * tlDayWidth.value
  const minW = tlDayWidth.value - 4 // 最短 1 天
  // REQ-019: 整体平移——left 偏移，width 不变
  if (d.edge === 'move') {
    return { left: row.left + dw + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  if (d.edge === 'deadline') {
    return { left: row.left + 'px', width: Math.max(row.width + dw, minW) + 'px' }
  }
  return { left: row.left + dw + 'px', width: Math.max(row.width - dw, minW) + 'px' }
}

/** 浮动标签文字：目标日期 M/D */
const tlDragLabelText = computed(() => {
  const d = tlDrag.value
  if (!d) return ''
  // REQ-019: 整体平移显示两端日期
  if (d.edge === 'move') {
    const s = new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)
    const e = new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)
    const fmt = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
    return t('queue.tlDragMove', { s: fmt(s), e: fmt(e) })
  }
  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dStr = `${target.getMonth() + 1}/${target.getDate()}`
  return d.edge === 'deadline' ? t('queue.tlDragDeadline', { d: dStr }) : t('queue.tlDragStart', { d: dStr })
})

/** v0.36 波1: 构造拖拽状态——拖拽前记录 oldStartDate/oldDeadline，供撤销恢复 */
function tlMakeDrag(row: TlRow, edge: TlDragState['edge'], e: PointerEvent): TlDragState {
  return {
    orderId: row.order.id,
    edge,
    startDate: row.startDate,
    endDate: row.endDate,
    noDeadline: row.noDeadline,
    // 旧值快照：开工日原本缺失（fallback 显示）时记 null，撤销恢复为 null
    oldStartDate: row.order.startDate ? dateKey(row.startDate) : null,
    oldDeadline: row.noDeadline ? null : dateKey(row.endDate),
    startX: e.clientX,
    dayDelta: 0,
    pointerX: e.clientX,
    pointerY: e.clientY
  }
}

function onTlHandleDown(e: PointerEvent, row: TlRow, edge: TlDragState['edge']) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  tlDrag.value = tlMakeDrag(row, edge, e)
}

/** REQ-019: 横条中间区域按下 → 整体平移模式（handle 的 pointerdown 已 stopPropagation，不会冒泡到这里） */
function onTlBarDown(e: PointerEvent, row: TlRow) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation() // 画布手势隔离：横条拖拽不触发画布平移
  if (!tlCanDragMove(row)) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  tlDrag.value = tlMakeDrag(row, 'move', e)
}

function onTlHandleMove(e: PointerEvent) {
  const d = tlDrag.value
  if (!d) return
  let delta = Math.round((e.clientX - d.startX) / tlDayWidth.value)
  const spanDays = Math.round((d.endDate.getTime() - d.startDate.getTime()) / 86_400_000)
  // 吸附约束：截稿日 ≥ 开工日；开工日 ≤ 截稿日（未设截稿时开工日右移不受限）
  if (d.edge === 'deadline') delta = Math.max(delta, -spanDays)
  else if (d.edge === 'start' && !d.noDeadline) delta = Math.min(delta, spanDays)
  // REQ-019: 整体平移——开工日不早于今天（触达边界停止，不弹错误）
  else if (d.edge === 'move') {
    const today = startOfDay(new Date())
    const minDelta = Math.ceil((today.getTime() - d.startDate.getTime()) / 86_400_000)
    // BUG-6 修复：恒执行钳制（原版 if (minDelta > 0) 只在开工日已在过去时生效，
    // 开工日在未来时左拖可把开工日拖进过去，错误排期静默持久化）
    delta = Math.max(delta, minDelta)
  }
  d.dayDelta = delta
  d.pointerX = e.clientX
  d.pointerY = e.clientY
}

// ─── v0.36 波1: 拖拽成功后的撤销 toast（软撤销，无全局 undo 栈） ───
const undoToastVisible = ref(false)
const undoToastMessage = ref('')
/** 撤销快照：拖拽提交成功后记录订单与新值/旧值；「撤销」点击或超时即失效 */
let tlUndoState: TlUndoState | null = null

const tlFmtMD = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`

/** 拖拽成功后弹出撤销 toast（替代原 ElMessage.success）；version 供撤销时乐观锁接力 */
function showTlUndoToast(d: TlDragState, version: number | undefined) {
  let msg: string
  if (d.edge === 'move') {
    const s = tlFmtMD(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000))
    const e = tlFmtMD(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
    msg = t('queue.tlUndoMove', { s, e })
  } else if (d.edge === 'deadline') {
    msg = t('queue.tlUndoDeadline', { d: tlFmtMD(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)) })
  } else {
    msg = t('queue.tlUndoStart', { d: tlFmtMD(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)) })
  }
  tlUndoState = {
    orderId: d.orderId,
    edge: d.edge,
    oldStartDate: d.oldStartDate,
    oldDeadline: d.oldDeadline,
    newStart: dateKey(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)),
    newEnd: dateKey(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)),
    // D-1: 拖拽成功后的最新 version——撤销同样两步 PUT 用旧值起步、响应新值接力
    newVersion: version
  }
  undoToastMessage.value = msg
  undoToastVisible.value = true
}

/** 点「撤销」：调同样的 API 恢复旧日期（一次性；成功后刷新队列 + 轻提示） */
async function onTlUndo() {
  const u = tlUndoState
  tlUndoState = null
  undoToastVisible.value = false
  if (!u) return
  try {
    if (u.edge === 'move') {
      // 两次 PUT 恢复顺序与拖拽时 dayDelta 正负分支对称，避免交叉校验 400：
      // 旧开工日晚于当前截稿日（拖右的撤销）→ 先恢复截稿日再恢复开工日
      if ((u.oldStartDate as string) > u.newEnd) {
        const first = await artistApi.updateDeadline(u.orderId, u.oldDeadline, { version: u.newVersion })
        const second = await artistApi.updateStartDate(u.orderId, u.oldStartDate, { version: first?.version })
        void second
      } else {
        const first = await artistApi.updateStartDate(u.orderId, u.oldStartDate, { version: u.newVersion })
        const second = await artistApi.updateDeadline(u.orderId, u.oldDeadline, { version: first?.version })
        void second
      }
    } else if (u.edge === 'deadline') {
      // oldDeadline 可能为 null（原本未设截稿，拖拽才设上）→ 恢复即清除
      await artistApi.updateDeadline(u.orderId, u.oldDeadline, { version: u.newVersion })
    } else {
      // oldStartDate 可能为 null（原本未设开工日，横条起点是 fallback 显示）
      await artistApi.updateStartDate(u.orderId, u.oldStartDate, { version: u.newVersion })
    }
    onRefreshAll()
    ElMessage.success(t('queue.tlUndone'))
  } catch (err) {
    // D-1: 撤销同样可能撞上他人已改（409）→ 明确冲突提示 + 重拉队列
    if ((err as ApiError)?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('queue.tlOrderConflict'))
    } else {
      ElMessage.error((err as ApiError).message)
    }
    onRefreshAll() // 恢复失败重拉服务端数据，界面与后端一致
  }
}

async function onTlHandleUp() {
  const d = tlDrag.value
  if (!d) return
  tlDrag.value = null
  if (d.dayDelta === 0) return // 没移动过，不发请求
  markDragHappened() // 抑制拖拽松手后的 click 跳转（标记宿主持有，goOrder 消费）

  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dateStr = dateKey(target)

  // 兜底校验（正常在 move 阶段被吸附约束拦住，此处防御）
  if (d.edge === 'deadline' && target < d.startDate) {
    ElMessage.warning(t('queue.tlDragDeadlineBeforeStart'))
    return
  }
  if (d.edge === 'start' && !d.noDeadline && target > d.endDate) {
    ElMessage.warning(t('queue.tlDragStartAfterDeadline'))
    return
  }

  try {
    let newVersion: number | undefined
    if (d.edge === 'move') {
      // REQ-019: 整体平移——一次性更新开工日+截稿日
      const newStart = dateKey(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000))
      const newEnd = dateKey(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
      // 往右拖（延后）：先更新截稿日再更新开工日，避免交叉校验 400（newStart > 旧 deadline）
      // 往左拖（提前）：先更新开工日再更新截稿日，避免 newEnd < 旧 startDate
      // D-1: 两步 PUT 带乐观锁——第一步用行内 version，第一步响应（getOrder）带回新 version 供第二步；
      // 双标签页先改过则第一步 409，走下方 catch 提示冲突并刷新队列
      const src = findOrder(d.orderId)
      const baseVersion = src?.version
      if (d.dayDelta > 0) {
        const first = await artistApi.updateDeadline(d.orderId, newEnd, { version: baseVersion } as VersionedOptions)
        const second = await artistApi.updateStartDate(d.orderId, newStart, { version: first?.version })
        newVersion = second?.version ?? first?.version
      } else {
        const first = await artistApi.updateStartDate(d.orderId, newStart, { version: baseVersion } as VersionedOptions)
        const second = await artistApi.updateDeadline(d.orderId, newEnd, { version: first?.version })
        newVersion = second?.version ?? first?.version
      }
      if (src) { src.startDate = newStart; src.deadline = newEnd; src.version = newVersion }
    } else if (d.edge === 'deadline') {
      const src = findOrder(d.orderId)
      const res = await artistApi.updateDeadline(d.orderId, dateStr, { version: src?.version } as VersionedOptions)
      if (src) { src.deadline = dateStr; src.version = res?.version }
      newVersion = res?.version
    } else {
      const src = findOrder(d.orderId)
      const res = await artistApi.updateStartDate(d.orderId, dateStr, { version: src?.version } as VersionedOptions)
      if (src) { src.startDate = dateStr; src.version = res?.version }
      newVersion = res?.version
    }
    // v0.36 波1: 成功不再弹 ElMessage.success，改带「撤销」按钮的 toast（API 失败走 catch，不弹）
    showTlUndoToast(d, newVersion)
  } catch (err) {
    // D-1: 旧快照写入被拒（双标签页/撤销重放）→ 明确冲突提示 + 重拉队列恢复服务端真相
    if ((err as ApiError)?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('queue.tlOrderConflict'))
    } else {
      ElMessage.error((err as ApiError).message)
    }
    onRefreshAll() // 回滚
  }
}

function onTlHandleCancel() {
  tlDrag.value = null
}
  return {
    // 缩放与视口
    tlZoom, changeTlZoom, tlDayWidth,
    // 仅进行中/全部过滤（oimimo 吸纳批二）
    tlFilterActive, setTlFilter,
    // 画布与滚动
    tlScrollEl, tlScrollLeft, onTlScroll, tlCanvasWidth, tlTicks,
    tlTodayX, tlIsTodayVisible, tlGoToday, tlRows,
    // 画布手势（平移/滚轮缩放/pinch）
    tlAxisPanning, onTlCanvasWheel, onTlCanvasDown, onTlCanvasMove, onTlCanvasUp, onTlCanvasCancel,
    // 横条拖拽改期
    tlDrag, tlDragLabelText, tlBarStyle,
    tlCanDragStart, tlCanDragEnd, tlCanDragMove,
    onTlHandleDown, onTlBarDown, onTlHandleMove, onTlHandleUp, onTlHandleCancel,
    // 撤销 toast
    undoToastVisible, undoToastMessage, onTlUndo
  }
}
