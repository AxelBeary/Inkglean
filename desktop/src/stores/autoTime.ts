// F8 二期自动识别（本地核心环波8）：前台窗口分类 + AFK 检测 + 按日累计。
// REQ-014 §F8 口径：绘图软件=在画；浏览器/游戏=摸鱼；文档/通讯/其余=中立；
// 键鼠空闲 ≥ 5 分钟=离开（AFK），不计工时。采样周期 30s，每票归入对应桶。
// 铁律：数据仅存本地 SQLite（local_time_log），永不上传（双模式分离纪律）。
// 本批不做：文件名↔委托文件夹归属匹配（下一波）；日/月对比图（墨环侧栏先出占比条）。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { openLocalDb } from '../bridge/db'
import { foregroundTitle, inputIdleSecs } from '../bridge/monitor'
import { isDesktop } from '../bridge'

/** 采样周期（秒）：每票时长即归属时长 */
export const POLL_SECS = 30
/** AFK 阈值（秒）：键鼠空闲超过即判离开（REQ-014 默认 5 分钟） */
export const AFK_SECS = 300

/** 绘图软件识别（首发口径 CSP/PS/SAI，顺手含 Krita/ibisPaint；大小写不敏感） */
const PAINT_RE = /(clip studio|photoshop|painttool|\bsai\b|krita|ibispaint)/i
/** 摸鱼识别：浏览器与游戏平台（视频站多在浏览器标题内，随浏览器口径） */
const FISH_RE = /(chrome|microsoft edge|firefox|opera|brave|vivaldi|safari|360se|steam)/i

/** 窗口标题分类（纯函数可测）：绘图=在画；浏览器/游戏=摸鱼；其余=中立 */
export function classifyWindow(title: string): 'paint' | 'fish' | 'neutral' {
  if (!title) return 'neutral'
  if (PAINT_RE.test(title)) return 'paint'
  if (FISH_RE.test(title)) return 'fish'
  return 'neutral'
}

/** 单票归属（纯函数可测）：AFK 优先（空闲超阈即离开），其次窗口分类 */
export function attributeTick(
  idleSecs: number | null,
  title: string,
  afkThresholdSecs: number
): 'idle' | 'paint' | 'fish' | 'neutral' {
  if (idleSecs !== null && idleSecs >= afkThresholdSecs) return 'idle'
  return classifyWindow(title)
}

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface DayTime {
  paint: number
  idle: number
  other: number
}

export const useAutoTimeStore = defineStore('desktop-auto-time', () => {
  const today = ref<DayTime>({ paint: 0, idle: 0, other: 0 })
  const loaded = ref(false)
  const unavailable = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const hasData = computed(() => today.value.paint + today.value.idle + today.value.other > 0)

  /** 读今日累计（跨天自然换行：表按 date 分行） */
  async function loadToday(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ paint_secs: number; idle_secs: number; other_secs: number }[]>(
        'SELECT paint_secs, idle_secs, other_secs FROM local_time_log WHERE date = $1',
        [todayKey()]
      )
      const r = rows[0]
      today.value = {
        paint: typeof r?.paint_secs === 'number' ? r.paint_secs : 0,
        idle: typeof r?.idle_secs === 'number' ? r.idle_secs : 0,
        other: typeof r?.other_secs === 'number' ? r.other_secs : 0
      }
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 采样一票：读前台+空闲 → 归属 → 内存与库同步累加（失败静默，下一票自愈） */
  async function tick(): Promise<void> {
    if (unavailable.value) return
    try {
      const [title, idle] = await Promise.all([foregroundTitle(), inputIdleSecs()])
      const bucket = attributeTick(idle, title, AFK_SECS)
      const add: DayTime = {
        paint: bucket === 'paint' ? POLL_SECS : 0,
        idle: bucket === 'idle' ? POLL_SECS : 0,
        other: bucket === 'fish' || bucket === 'neutral' ? POLL_SECS : 0
      }
      today.value = {
        paint: today.value.paint + add.paint,
        idle: today.value.idle + add.idle,
        other: today.value.other + add.other
      }
      const db = await openLocalDb()
      await db.execute(
        `INSERT INTO local_time_log (date, paint_secs, idle_secs, other_secs, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(date) DO UPDATE SET
           paint_secs = paint_secs + $2, idle_secs = idle_secs + $3,
           other_secs = other_secs + $4, updated_at = $5`,
        [todayKey(), add.paint, add.idle, add.other, new Date().toISOString()]
      )
    } catch {
      // 采样失败（壳层异常/桥不可用）：静默跳过本票，不吵画师
    }
  }

  /** 启动轮询（Home 挂载时；幂等） */
  function start(): void {
    if (!isDesktop() || timer) return
    void loadToday()
    void tick() // 首票即采，不等第一个周期
    timer = setInterval(() => { void tick() }, POLL_SECS * 1000)
  }

  /** 停止轮询（Home 卸载时） */
  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { today, loaded, unavailable, hasData, loadToday, start, stop }
})
