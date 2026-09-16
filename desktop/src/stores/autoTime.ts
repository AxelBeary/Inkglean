// F8 二期自动识别（本地核心环波8 + 波11）：前台窗口分类 + AFK 检测 + 按日累计，
// 波11 补归属匹配：窗口标题↔本地记账，在画工时归到具体委托（跨软件不断档）。
// REQ-014 §F8 口径：绘图软件=在画；浏览器/游戏=摸鱼；文档/通讯/其余=中立；
// 键鼠空闲 ≥ 5 分钟=离开（AFK），不计工时。采样周期 30s，每票归入对应桶。
// 铁律：数据仅存本地 SQLite，永不上传（双模式分离纪律）。
// 本批不做：日/月对比图（墨环侧栏占比条已出）。
// 时区/跨天口径（审计波2 DSK-06/12）：归属日一律按**本地日历日**算（同 components/home/localGlance.ts）——
//   ① 跨午夜即滚日：内存 today 换到新的一天再计票，一直停在首页也不会把昨天累计当今日在画；
//   ② 每票只计「上次采样以来真实流逝」的秒数：切页/关机/休眠期间根本没在采样，不猜、不白送一票。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { openLocalDb } from '../bridge/db'
import { foregroundTitle, inputIdleSecs } from '../bridge/monitor'
import { isDesktop } from '../bridge'
import { useLocalLedgerStore } from './localLedger'
import type { LocalOrder } from './localLedger'

/** 采样周期（秒）：每票时长上限即归属时长 */
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

/** 从绘图软件窗口标题提取文档名（纯函数）：按「 - / – 」分段，优先取带扩展名的段
 *  （CSP：xxx.clip – CLIP STUDIO PAINT；PS：xxx.psd - Photoshop；SAI：xxx - PaintTool SAI）；
 *  都无扩展名则取首段。 */
export function extractDocName(title: string): string {
  const parts = title.split(/\s+[–-]\s+/).map(p => p.trim()).filter(Boolean)
  for (const p of parts) {
    if (/\.[a-z0-9]{2,5}$/i.test(p)) return p
  }
  return parts[0] ?? title.trim()
}

/** 归属匹配（纯函数可测）：文档名包含委托内容（档位）优先，其次客户名；
 *  波5 模板生成的「客户名-档位名.扩展名」命名两者皆命中；跨软件不断档
 *  （CSP 画完换 PS 修图，标题都含同一客户/档位，归同一单）。非绘图窗口返 null。 */
export function matchOrderForTitle(title: string, orders: LocalOrder[]): LocalOrder | null {
  if (classifyWindow(title) !== 'paint') return null
  const doc = extractDocName(title).toLowerCase()
  if (!doc) return null
  let byTitle: LocalOrder | null = null
  let byClient: LocalOrder | null = null
  for (const o of orders) {
    const t = o.title.trim().toLowerCase()
    const c = o.client_name.trim().toLowerCase()
    if (t && !byTitle && doc.includes(t)) byTitle = o
    if (c && !byClient && doc.includes(c)) byClient = o
  }
  return byTitle ?? byClient
}

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 本票计入秒数（纯函数可测，DSK-12）：只认「上次采样以来真实流逝」的时间，且至多一个采样周期。
 *  无基线（每次 start 的首票）/ 断档超两个周期（切页、关机、休眠期间根本没在采样）/ 时钟回拨 → 一律 0，
 *  不再「进一次首页白送一票 30 秒」（虚增今日在画，连带污染经营占比、托盘 tooltip 与工时导出）。 */
export function tickSeconds(lastSampleAt: number | null, now: number, pollSecs: number = POLL_SECS): number {
  if (lastSampleAt === null) return 0
  const gap = (now - lastSampleAt) / 1000
  if (!Number.isFinite(gap) || gap <= 0) return 0
  if (gap > pollSecs * 2) return 0 // 断档：这段时间没在采样，不猜
  return Math.min(pollSecs, Math.round(gap))
}

export interface DayTime {
  paint: number
  idle: number
  other: number
}

/** 近 7 日某天的时长行（波14 周条图数据源） */
export interface DayTimeRow {
  date: string
  paint: number
  idle: number
  other: number
}

/** 月度时长行（波16 月对比图数据源：YYYY-MM → 当月累计在画/其他） */
export interface MonthTimeRow {
  month: string
  paint: number
  other: number
}

export const useAutoTimeStore = defineStore('desktop-auto-time', () => {
  const today = ref<DayTime>({ paint: 0, idle: 0, other: 0 })
  /** 内存 today 归属的本地日历日（DSK-06：跨午夜靠它判要不要滚日，昨天累计不带进今天） */
  const todayDate = ref<string>(todayKey())
  /** 归单工时（波11）：order_id → 累计秒 */
  const orderSeconds = ref<Record<number, number>>({})
  /** 近 7 日时长行（波14 周条图；缺日补 0，升序时间序） */
  const week = ref<DayTimeRow[]>([])
  /** 近 2 个月时长行（波16 月对比图；升序，旧在前） */
  const months = ref<MonthTimeRow[]>([])
  const loaded = ref(false)
  const unavailable = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  /** 上次采样时刻（毫秒，DSK-12）：start/stop 一律清空——没在采样的时间段不计票 */
  let lastSampleAt: number | null = null

  const hasData = computed(() => today.value.paint + today.value.idle + today.value.other > 0)

  /** 读今日累计（跨天自然换行：表按 date 分行） */
  async function loadToday(): Promise<void> {
    const key = todayKey()
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ paint_secs: number; idle_secs: number; other_secs: number }[]>(
        'SELECT paint_secs, idle_secs, other_secs FROM local_time_log WHERE date = $1',
        [key]
      )
      const r = rows[0]
      today.value = {
        paint: typeof r?.paint_secs === 'number' ? r.paint_secs : 0,
        idle: typeof r?.idle_secs === 'number' ? r.idle_secs : 0,
        other: typeof r?.other_secs === 'number' ? r.other_secs : 0
      }
      todayDate.value = key // 内存与归属日同行（DSK-06）
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 跨午夜滚日（DSK-06）：内存 today 换成新的一天（以库为准重读），周/月窗口随之平移。
   *  写库本来就按 date 分行，坏的只是内存——一直停在首页会把昨天累计整天显示成今日在画。 */
  async function rollToDay(key: string): Promise<void> {
    today.value = { paint: 0, idle: 0, other: 0 }
    todayDate.value = key // 先占位：即使重读失败也不每票重试滚日
    await loadToday()
    void loadWeek()
    void loadMonths()
  }

  /** 读归单工时累计（波11；记账行「已画 X」展示源） */
  async function loadOrderTimes(): Promise<void> {
    if (!isDesktop()) return
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ order_id: number; total_secs: number }[]>(
        'SELECT order_id, total_secs FROM local_order_time'
      )
      const map: Record<number, number> = {}
      for (const r of rows) {
        if (typeof r.order_id === 'number' && typeof r.total_secs === 'number') map[r.order_id] = r.total_secs
      }
      orderSeconds.value = map
    } catch {
      // 读失败：已画展示为空，不影响主计时
    }
  }

  /** 读近 7 日时长（波14；缺日补 0，升序时间序；读失败周条留空不影响主计时） */
  async function loadWeek(): Promise<void> {
    if (!isDesktop()) return
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ date: string; paint_secs: number; idle_secs: number; other_secs: number }[]>(
        'SELECT date, paint_secs, idle_secs, other_secs FROM local_time_log ORDER BY date DESC LIMIT 7'
      )
      const byDate = new Map(rows.map(r => [r.date, r]))
      const days: DayTimeRow[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = todayKey(d)
        const r = byDate.get(key)
        days.push({
          date: key,
          paint: typeof r?.paint_secs === 'number' ? r.paint_secs : 0,
          idle: typeof r?.idle_secs === 'number' ? r.idle_secs : 0,
          other: typeof r?.other_secs === 'number' ? r.other_secs : 0
        })
      }
      week.value = days
    } catch {
      // 读失败：周条留空，不影响主计时
    }
  }

  /** 读近 2 个月累计（波16；缺月补 0，升序旧在前；读失败留空不影响主计时） */
  async function loadMonths(): Promise<void> {
    if (!isDesktop()) return
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ m: string; paint: number; other: number }[]>(
        `SELECT substr(date, 1, 7) AS m, SUM(paint_secs) AS paint, SUM(other_secs) AS other
         FROM local_time_log GROUP BY substr(date, 1, 7) ORDER BY m DESC LIMIT 2`
      )
      // 补全近两月键（缺月补 0），升序旧在前；当月键由本地时区算（与 date 口径一致）
      const now = new Date()
      const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`
      const byMonth = new Map(rows.map(r => [r.m, r]))
      months.value = [prev, cur].map(key => {
        const r = byMonth.get(key)
        return {
          month: key,
          paint: typeof r?.paint === 'number' ? r.paint : 0,
          other: typeof r?.other === 'number' ? r.other : 0
        }
      })
    } catch {
      // 读失败：月对比留空，不影响主计时
    }
  }

  /** 采样一票：跨午夜先滚日（DSK-06）→ 按真实流逝秒数计票（DSK-12）→ 读前台+空闲 → 归属 →
   *  内存与库同步累加；在画票再归单（失败静默，下一票自愈） */
  async function tick(): Promise<void> {
    if (unavailable.value) return
    const n = Date.now()
    const key = todayKey(new Date(n))
    let rolled = false
    if (key !== todayDate.value) {
      await rollToDay(key)
      rolled = true
    }
    const secs = tickSeconds(lastSampleAt, n)
    lastSampleAt = n
    // 没观察到时间（首票无基线 / 切页·关机·休眠断档）：只立基线，不写库不白送工时
    if (secs <= 0) return
    try {
      const [title, idle] = await Promise.all([foregroundTitle(), inputIdleSecs()])
      const bucket = attributeTick(idle, title, AFK_SECS)
      const add: DayTime = {
        paint: bucket === 'paint' ? secs : 0,
        idle: bucket === 'idle' ? secs : 0,
        other: bucket === 'fish' || bucket === 'neutral' ? secs : 0
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
        [key, add.paint, add.idle, add.other, new Date(n).toISOString()]
      )
      // 归单（波11）：在画票匹配到本地委托即累计到该单（跨软件不断档，匹配规则见 matchOrderForTitle）
      if (bucket === 'paint') {
        const ledger = useLocalLedgerStore()
        const matched = matchOrderForTitle(title, ledger.orders)
        if (matched) {
          await db.execute(
            `INSERT INTO local_order_time (order_id, total_secs, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT(order_id) DO UPDATE SET total_secs = total_secs + $2, updated_at = $3`,
            [matched.id, secs, new Date(n).toISOString()]
          )
          orderSeconds.value = {
            ...orderSeconds.value,
            [matched.id]: (orderSeconds.value[matched.id] ?? 0) + secs
          }
        }
      }
      // 滚日当票：本票写库后再刷一次周/月窗口（滚日里那次读在本票之前，会让新一天的条形先显示 0）
      if (rolled) {
        void loadWeek()
        void loadMonths()
      }
    } catch {
      // 采样失败（壳层异常/桥不可用）：静默跳过本票，不吵画师
    }
  }

  /** 启动轮询（Home 挂载时；幂等）。DSK-12：采样基线清空——首票只立基线不计秒，
   *  免掉「每次进首页无条件多采一票 30 秒」（切页期间没在采样，不猜） */
  function start(): void {
    if (!isDesktop() || timer) return
    lastSampleAt = null
    void loadToday()
    void loadOrderTimes()
    void loadWeek()
    void loadMonths()
    void tick() // 首票即采（只立采样基线，秒数见 tickSeconds）
    timer = setInterval(() => { void tick() }, POLL_SECS * 1000)
  }

  /** 停止轮询（Home 卸载时）：基线一并清掉，再进首页从 0 起算（DSK-12） */
  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    lastSampleAt = null
  }

  return { today, todayDate, orderSeconds, week, months, loaded, unavailable, hasData, loadToday, loadOrderTimes, loadWeek, loadMonths, start, stop }
})
