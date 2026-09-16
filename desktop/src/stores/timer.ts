// 本地手动计时器（方向 A 落码批）：墨环（今日在画）的唯一数据源。
// F8 纪律：数据仅存本机 localStorage（带版本键，悬浮窗跨窗口天然共享），永不上传。
// 自动识别软件窗口（在画/离开/摸鱼占比）是 F8 二期（见 stores/autoTime.ts）——故墨环侧栏占比条不渲染。
// 归一化纪律与 prefs 同款：坏数据落默认，永不抛错。
// 时区/跨天口径（审计波2 DSK-04/05）：一律按**本地日历日**判定（同 components/home/localGlance.ts 的本地零点归一）——
//   ① 关机/休眠时长不算在画：在跑段每 BEAT_MS 落一次「应用还活着」的心跳（beatAt），重开只算到最后一跳；
//   ② 跨午夜不串日：常驻体检把归属日推到本地今天，在跑段按本地午夜切开（午夜前归昨天、午夜后续跑）。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'shihui-desktop-timer-v1'
/** 在跑段心跳间隔（DSK-04）：每 15 秒把「应用还活着」的时刻落进 beatAt */
const BEAT_MS = 15_000
/** 心跳失效阈（DSK-04）：超过即判「应用曾关闭 / 系统曾休眠」，在跑段按最后一跳落账后收笔暂停。
 *  取 5 分钟：窗口最小化/隐藏时 WebView2（Chromium）会把定时器节流到约每分钟一跳，留足余量防误判 */
const STALE_BEAT_MS = 5 * 60_000
/** 常驻体检间隔（DSK-05）：暂停态没有在跑心跳，跨午夜归零与休眠唤醒恢复靠它 */
const RECONCILE_MS = 30_000

interface TimerState {
  v: 1
  /** 归属日期（YYYY-MM-DD，本地时区）；跨天自动清零 */
  date: string
  /** 已累计秒数（已暂停/停止的段之和） */
  acc: number
  /** 是否正在计时 */
  running: boolean
  /** 当前段起点（毫秒时间戳；未计时为 null） */
  startedAt: number | null
  /** 最后一次确认「应用还活着」的时刻（毫秒，DSK-04）；其后的关机/休眠时长不计在画。未计时为 null */
  beatAt: number | null
}

/** 本地零点毫秒（口径同 localGlance.localDaysLeft：只认本地日历日，不碰 UTC 串） */
function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultState(now = Date.now()): TimerState {
  return { v: 1, date: todayKey(new Date(now)), acc: 0, running: false, startedAt: null, beatAt: null }
}

/** 在跑段就地落账到 end（纯函数）：手动暂停/停止与「关机·休眠超阈」恢复共用同一口径 */
function settleSegment(st: TimerState, end: number): TimerState {
  if (!st.running || st.startedAt === null) return st
  const elapsed = Math.max(0, Math.floor((end - st.startedAt) / 1000))
  return { ...st, acc: st.acc + elapsed, running: false, startedAt: null, beatAt: null }
}

/** 归属日校正（纯函数，DSK-05）：同日内原样返回（同引用，便于调用方判「有没有变」）；跨天则清零到本地今天——
 *  在跑段按本地午夜切开：午夜前的部分归昨天（手动计时只留「今日」一个数、无按日历史，随昨天一并收笔），
 *  午夜后的部分继续算今天（段起点重设到午夜）；暂停态昨天的累计一律不带进今天。 */
function ensureToday(st: TimerState, now: number): TimerState {
  if (st.date === todayKey(new Date(now))) return st
  const d = defaultState(now)
  if (!st.running || st.startedAt === null) return d
  const midnight = startOfLocalDay(new Date(now))
  return {
    ...d,
    running: true,
    startedAt: Math.max(st.startedAt, midnight),
    beatAt: Math.max(st.beatAt ?? 0, midnight)
  }
}

/** 心跳时刻（纯函数）：老数据无 beatAt 时退化到段起点＝「停机时长一律不算」；坏值夹到不早于段起点 */
function beatOf(startedAt: number, beatAt: number | null): number {
  const b = typeof beatAt === 'number' && Number.isFinite(beatAt) ? beatAt : startedAt
  return Math.max(b, startedAt)
}

function normalize(raw: unknown, now = Date.now()): TimerState {
  const d = defaultState(now)
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<TimerState>
  // 坏日期一律清零重建（今日累计口径）
  if (typeof o.date !== 'string') return d
  const acc = typeof o.acc === 'number' && Number.isFinite(o.acc) && o.acc >= 0 ? Math.floor(o.acc) : 0
  const startedAt = typeof o.startedAt === 'number' && Number.isFinite(o.startedAt) ? o.startedAt : null
  // 状态自洽兜底：未在跑（或形状坏）不得有段起点，只接累计；跨天的累计不带进今天
  if (o.running !== true || startedAt === null) return o.date === d.date ? { ...d, acc } : d
  const beat = beatOf(startedAt, o.beatAt ?? null)
  const live: TimerState = { v: 1, date: o.date, acc, running: true, startedAt, beatAt: beat }
  // DSK-04：心跳超阈＝应用关过/系统休眠过——在跑段只算到最后一跳后收笔（不替画师猜停机期间在画）
  if (now - beat > STALE_BEAT_MS) return ensureToday(settleSegment(live, Math.min(beat, now)), now)
  return ensureToday(live, now)
}

function load(now = Date.now()): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalize(raw ? JSON.parse(raw) : null, now)
  } catch {
    return defaultState(now)
  }
}

/** 秒数 → 「X 小时 Y 分 / Y 分」口径（墨环中心与悬浮计时卡共用） */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  return `${m} 分`
}

export const useTimerStore = defineStore('desktop-timer', () => {
  const state = ref<TimerState>(load())
  /** 心跳刻度（计时中每秒刷新一次，驱动在跑段的实时显示；暂停时由常驻体检每 30 秒推一次） */
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value)) } catch { /* 写失败静默，计时非关键路径 */ }
  }

  /** 体检（DSK-04/05）：先把「应用曾关闭 / 系统曾休眠」的时长按最后一跳收掉，再把归属日校正到本地今天。
   *  状态没变时不写盘——跨窗口 storage 事件不会因此对打。 */
  function reconcile(n = Date.now()): void {
    now.value = n
    const st = state.value
    let next = st
    if (next.running && next.startedAt !== null) {
      const beat = beatOf(next.startedAt, next.beatAt)
      if (n - beat > STALE_BEAT_MS) next = settleSegment(next, Math.min(beat, n))
    }
    next = ensureToday(next, n)
    if (next === st) return
    state.value = next
    persist()
    syncTicker()
  }

  /** 在跑心跳：每秒推显示刻度、每 BEAT_MS 把「还活着」落盘；顺带体检（跨午夜即在跑段按午夜切开） */
  function onTick(): void {
    const n = Date.now()
    reconcile(n)
    const st = state.value
    if (!st.running) return
    if (st.beatAt === null || n - st.beatAt >= BEAT_MS) {
      state.value = { ...st, beatAt: n }
      persist()
    }
  }

  function syncTicker() {
    if (state.value.running && ticker === null) {
      ticker = setInterval(onTick, 1000)
    } else if (!state.value.running && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  /** 跨窗口同步：另一窗口 start/pause/stop 或心跳落盘后，storage 事件触发本窗口回读 */
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return
    state.value = load()
    now.value = Date.now()
    syncTicker()
  }

  /** 窗口隐藏/关闭前补一跳（DSK-04）：让「最后活着的时刻」贴近真实关窗时刻
   *  （强杀/断电来不及跑这里，仍有 BEAT_MS 心跳兜底，最坏多算一跳） */
  function onHide(): void {
    const st = state.value
    if (!st.running) return
    const n = Date.now()
    now.value = n
    state.value = { ...st, beatAt: n }
    persist()
  }

  /** 回到前台 / 休眠唤醒：立刻体检，不等下一跳 */
  function onVisible(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { onHide(); return }
    reconcile()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    window.addEventListener('pagehide', onHide)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  /** 开始/继续计时 */
  function start() {
    const n = Date.now()
    reconcile(n) // 跨天/休眠先体检：新段一律记到本地今天，也不把停机时长接进来
    if (state.value.running) return
    now.value = n
    state.value = { ...state.value, running: true, startedAt: n, beatAt: n }
    persist()
    syncTicker()
  }

  /** 当前在跑段落账并暂停 */
  function settle() {
    const n = Date.now()
    reconcile(n) // 休眠超阈的段已按最后一跳收掉，不再往今天灌
    const st = state.value
    if (!st.running || st.startedAt === null) return
    now.value = n // 落账先取当下，免掉心跳尾差
    state.value = settleSegment(st, n)
    persist()
    syncTicker()
  }

  /** 暂停（在跑段落账，保留今日累计） */
  function pause() {
    settle()
  }

  /** 停止（本段同样落账：画过的时间不丢；与暂停同口径，语义上是收笔） */
  function stop() {
    settle()
  }

  /** 手动清零今日累计（长按类动作本批不做入口，只留能力位） */
  function resetToday() {
    now.value = Date.now()
    state.value = defaultState(now.value)
    persist()
    syncTicker()
  }

  /**  今日累计秒数 = 已落账 + 在跑段实时部分（归属日不是本地今天时恒 0：昨天不串进今天，DSK-05） */
  const todaySeconds = computed(() => {
    const st = state.value
    const n = now.value
    if (st.date !== todayKey(new Date(n))) return 0
    const live = st.running && st.startedAt !== null
      ? Math.max(0, Math.floor((n - st.startedAt) / 1000))
      : 0
    return st.acc + live
  })

  const running = computed(() => state.value.running)

  // 挂载即恢复心跳（应用重启后在跑段接着走；关机/休眠时长由 normalize 按最后一跳扣掉）
  syncTicker()
  // 常驻体检（DSK-05）：暂停态没有在跑心跳，跨午夜归零与休眠恢复靠它——与 store 同寿命，
  // 和上面的 storage/pagehide/visibilitychange 监听一样不做拆除（Pinia store 是窗口级单例，窗口关了自然没）
  if (typeof window !== 'undefined') setInterval(() => { reconcile() }, RECONCILE_MS)

  return { state, now, running, todaySeconds, start, pause, stop, resetToday }
})
