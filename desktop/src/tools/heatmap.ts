// 整年在画热力图纯构建（RingoTrack 款 GitHub 小绿砖，纸墨风墨色深浅）：
// 把「按日在画秒数」铺成 周×星期 的方格墙（周日→周六为行，一列一周），末列对齐今天。
// 纯函数无副作用，数据源＝本地 local_time_log（autoTime store 读出的 HeatDay[]）；
// 归属日一律按本地日历日算（口径同 stores/autoTime.ts、components/home/localGlance.ts），跨时区不漂。
// 铁律：数据仅存本地，本页不联网。

/** 墨色深浅档：0=空（当天没画）；1~4=越画越浓 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatCell {
  /** 本地日历日 YYYY-MM-DD */
  date: string
  /** 当日在画秒数（未来占位格恒 0） */
  secs: number
  level: HeatLevel
  /** 今天之后的占位格：只占位不渲染色（保持末列与今天对齐） */
  future: boolean
}

/** 一列＝一周（7 格，周日→周六）；monthLabel＝该列顶部的月份签（该周首次跨入的月份，否则 null） */
export interface HeatColumn {
  cells: HeatCell[]
  monthLabel: string | null
}

export interface HeatSummary {
  /** 窗口内累计在画秒数 */
  totalSecs: number
  /** 有在画记录的天数 */
  activeDays: number
  /** 单日最高（窗口内在画最久的一天；全空则 null） */
  maxDay: { date: string; secs: number } | null
  /** 最长连续在画天数 */
  longestStreak: number
  /** 当前连续在画天数（今天还没画则从昨天起算，给一天宽限） */
  currentStreak: number
}

export interface Heatmap {
  columns: HeatColumn[]
  summary: HeatSummary
}

/** 默认铺 53 列（约一整年，末列含今天所在周） */
export const HEAT_WEEKS = 53

/** 月份签最小间隔（列）：跨月太密时跳过后一个签，防「10月11月」挤成一团（GitHub 同款取舍） */
export const MONTH_LABEL_MIN_GAP = 4

/** 在画秒数 → 墨色深浅档（固定小时桶，比「相对峰值归一」更贴合绘画：
 *  单日猛画不会把其余日子全冲淡成一片浅）。0 秒=空档；<1h=1；1~3h=2；3~6h=3；≥6h=4。 */
export function levelForSecs(secs: number): HeatLevel {
  if (!(secs > 0)) return 0
  const h = secs / 3600
  if (h < 1) return 1
  if (h < 3) return 2
  if (h < 6) return 3
  return 4
}

/** 本地日历日键（与 autoTime.todayKey 同口径） */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 本周周日（本地零点；周日=0） */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay())
  return x
}

/** 连续在画天数（seq 必须是连续日历日、升序）：最长连击 + 当前连击（今天没画给一天宽限，从昨天起算） */
function computeStreaks(seq: HeatCell[]): { longest: number; current: number } {
  let longest = 0
  let run = 0
  for (const c of seq) {
    if (c.secs > 0) { run++; if (run > longest) longest = run } else run = 0
  }
  let current = 0
  let i = seq.length - 1
  if (i >= 0 && seq[i].secs <= 0) i-- // 今天还没画：宽限，从昨天起算
  while (i >= 0 && seq[i].secs > 0) { current++; i-- }
  return { longest, current }
}

/** 铺热力图：paint 为「本地日历日 → 在画秒数」映射，today 为归属基准日（一般传 new Date()）。
 *  窗口＝今天所在周往前共 weeks 列；今天之后的日子作占位格（future=true，不上色）。 */
export function buildHeatmap(paint: Map<string, number>, today: Date, weeks: number = HEAT_WEEKS): Heatmap {
  const start = startOfWeek(today)
  start.setDate(start.getDate() - (weeks - 1) * 7)
  const todayK = localKey(today)

  const columns: HeatColumn[] = []
  const windowCells: HeatCell[] = []
  const cursor = new Date(start)
  let lastMonth = -1
  let lastLabelCol = -MONTH_LABEL_MIN_GAP * 2 // 首列恒可打签

  for (let w = 0; w < weeks; w++) {
    const cells: HeatCell[] = []
    let monthLabel: string | null = null
    for (let d = 0; d < 7; d++) {
      const key = localKey(cursor)
      const future = key > todayK
      const secs = future ? 0 : (paint.get(key) ?? 0)
      const cell: HeatCell = { date: key, secs, level: future ? 0 : levelForSecs(secs), future }
      cells.push(cell)
      if (!future) {
        windowCells.push(cell)
        // 月份签：整墙顺序推进，跨入新月的第一列打签（即含该月 1 号的那一列）；
        // 与上一个签间隔不足 MONTH_LABEL_MIN_GAP 列则跳过（防相邻两签文字溢出互叠）
        if (cursor.getMonth() !== lastMonth) {
          if (monthLabel === null && w - lastLabelCol >= MONTH_LABEL_MIN_GAP) {
            monthLabel = `${cursor.getMonth() + 1}月`
            lastLabelCol = w
          }
          lastMonth = cursor.getMonth()
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    columns.push({ cells, monthLabel })
  }

  let totalSecs = 0
  let activeDays = 0
  let maxDay: { date: string; secs: number } | null = null
  for (const c of windowCells) {
    totalSecs += c.secs
    if (c.secs > 0) activeDays++
    if (!maxDay || c.secs > maxDay.secs) maxDay = { date: c.date, secs: c.secs }
  }
  if (maxDay && maxDay.secs <= 0) maxDay = null
  const { longest, current } = computeStreaks(windowCells)

  return {
    columns,
    summary: { totalSecs, activeDays, maxDay, longestStreak: longest, currentStreak: current }
  }
}

/** 星期行签（周日=0 起）：仿 GitHub 只显 一/三/五，减少视觉噪声；其余行留空占位 */
export const WEEKDAY_LABELS: readonly (string | null)[] = [null, '一', null, '三', null, '五', null]
