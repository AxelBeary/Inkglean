// 本地手动计时器（方向 A 落码批）：墨环（今日在画）的唯一数据源。
// F8 纪律：数据仅存本机 localStorage（带版本键，悬浮窗跨窗口天然共享），永不上传。
// 自动识别软件窗口（在画/离开/摸鱼占比）是 F8 二期，本批不做——故墨环侧栏占比条不渲染。
// 归一化纪律与 prefs 同款：坏数据落默认，永不抛错。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'shihui-desktop-timer-v1'

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
}

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultState(): TimerState {
  return { v: 1, date: todayKey(), acc: 0, running: false, startedAt: null }
}

function normalize(raw: unknown): TimerState {
  const d = defaultState()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<TimerState>
  // 跨天/坏日期一律清零重建（今日累计口径）
  if (typeof o.date !== 'string' || o.date !== todayKey()) return d
  if (typeof o.acc === 'number' && Number.isFinite(o.acc) && o.acc >= 0) d.acc = Math.floor(o.acc)
  if (typeof o.running === 'boolean') d.running = o.running
  if (typeof o.startedAt === 'number' && Number.isFinite(o.startedAt)) d.startedAt = o.startedAt
  // 状态自洽兜底：未在跑不得有段起点，在跑必须有段起点
  if (!d.running) d.startedAt = null
  if (d.running && d.startedAt === null) { d.running = false; d.startedAt = null }
  return d
}

function load(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalize(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultState()
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
  /** 心跳刻度（计时中每秒刷新一次，驱动在跑段的实时显示） */
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null

  /** 跨窗口同步：另一窗口 start/pause/stop 后 storage 事件触发本窗口回读 */
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return
    state.value = load()
    syncTicker()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value)) } catch { /* 写失败静默，计时非关键路径 */ }
  }

  function syncTicker() {
    if (state.value.running && ticker === null) {
      ticker = setInterval(() => { now.value = Date.now() }, 1000)
    } else if (!state.value.running && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  /** 开始/继续计时 */
  function start() {
    if (state.value.running) return
    now.value = Date.now()
    state.value = { ...state.value, running: true, startedAt: now.value }
    persist()
    syncTicker()
  }

  /** 当前在跑段落账并暂停 */
  function settle() {
    const st = state.value
    if (!st.running || st.startedAt === null) return
    now.value = Date.now() // 落账先取当下，免掉心跳尾差
    const elapsed = Math.max(0, Math.floor((now.value - st.startedAt) / 1000))
    state.value = { ...st, acc: st.acc + elapsed, running: false, startedAt: null }
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
    state.value = { ...defaultState() }
    persist()
    syncTicker()
  }

  /**  今日累计秒数 = 已落账 + 在跑段实时部分 */
  const todaySeconds = computed(() => {
    const st = state.value
    const live = st.running && st.startedAt !== null
      ? Math.max(0, Math.floor((now.value - st.startedAt) / 1000))
      : 0
    return st.acc + live
  })

  const running = computed(() => state.value.running)

  // 挂载即恢复心跳（应用重启后在跑段继续走）
  syncTicker()

  return { state, now, running, todaySeconds, start, pause, stop, resetToday }
})
