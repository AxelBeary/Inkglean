// 波2 拖拽改期/拖排 纯函数（9/13 批 · 契约层）：像素→天换算、拖后区间钳制、两步写序、拖排序列。
// 三条纪律：
//  ①**不照抄网页端吸附算法**——桌面时间条是「固定窗口（今天零点 + N 天）+ 百分比几何」，
//    网页端是「订单范围画布 + dayWidth px/天 + 裁剪守卫」，两者不同构；换算一律以组件量到的
//    track 实际宽度为入参（本文件不碰 DOM，测宽由组件负责），免得重演「百分比乘长度＝非法 CSS」。
//  ②日级比较全走本地零点（band.ts 的 todayStart/dateKey 同源），不许用 UTC 直接比（网页端 a1-7 教训）。
//  ③纯函数零副作用，页面与 store 只消费、不另立副本。
import { dateKey, daysLeft, parseDate, todayStart } from './band'
import type { SchedOrder } from './types'

/** 拖拽端：start＝只改开工日 / end＝只改截稿日 / move＝整条平移 */
export type DragEdge = 'start' | 'end' | 'move'

/** 终态一律不可拖（与网页端 useQueueTimeline 的 TL_TERMINAL_STATUSES 同名单）。
 *  时间条过滤与拖拽守卫共用这一份常量，防"看得到却拖不动"或反之的口径分裂。 */
export const TERMINAL_STATUSES: readonly string[] = ['done', 'delivered', 'cancelled']

/** 时间条横条可否拖：云端行（有乐观锁版本）+ 非终态 + 开工日与截稿日齐（缺任端的单本来就不进时间条）。 */
export function canDragBar(o: SchedOrder): boolean {
  if (o.version === undefined) return false // 本地记账行无 version、无写路径（拍板②诚实缺席）
  if (TERMINAL_STATUSES.includes(o.status)) return false
  return Boolean(o.startDate && o.deadline)
}

/** 列表行可否拖排：云端正式区才有效——缓冲区与本地记账行都不参与 reorder
 *  （后端按"整段正式区顺序"落位，本地记账也没有队列序概念）。 */
export function canReorderRow(o: SchedOrder): boolean {
  return o.version !== undefined && o.zone === 'formal'
}

/** 像素位移 → 整天数：四舍五入到整天（日级接口不支持半天）。
 *  非法/除零一律返 0——宁可不动，也不许把拖拽算成乱跳。 */
export function pxToDays(deltaPx: number, trackWidth: number, windowDays: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(trackWidth) || !Number.isFinite(windowDays)) return 0
  if (trackWidth <= 0 || windowDays <= 0) return 0
  const perDay = trackWidth / windowDays
  if (!Number.isFinite(perDay) || perDay <= 0) return 0
  return Math.round(deltaPx / perDay)
}

/** 日期串加减 N 天 → YYYY-MM-DD；入参非法返 null（由调用方决定"不动"，本文件不猜） */
export function shiftDate(dateStr: string | null | undefined, days: number): string | null {
  const d = parseDate(dateStr)
  if (!d) return null
  if (!Number.isFinite(days)) return null
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(days)))
}

export interface DragRangeInput {
  /** 拖前开工日 YYYY-MM-DD（必填——缺端子的单 canDragBar 已挡在外面） */
  startDate: string
  /** 拖前截稿日 YYYY-MM-DD */
  deadline: string
  edge: DragEdge
  deltaDays: number
  /** 今天 YYYY-MM-DD：默认取本机今天，测试可注入固定值（防跨零点用例飘） */
  today?: string
}

export interface DragPlan {
  startDate: string
  deadline: string
  /** 真正要写的字段；被钳到毫无变化时为空数组 → 调用方**不发请求**（不发假请求） */
  changed: Array<'startDate' | 'deadline'>
  /** 被「开工日不得拖进过去」钳掉的整天数（>0 时 UI 可据实说"已到最早"，不骗人） */
  clampedDays: number
}

/** 排一条拖拽的目标区间，并施加两条硬钳制：
 *  ①开工日不得早于今天（拖进过去没意义，网页端 BUG-6 同口径）；
 *  ②截稿日不得早于开工日（后端有 deadline ≥ startDate 交叉校验，前端先挡，免得白吃 400）。 */
export function planDragRange(input: DragRangeInput): DragPlan {
  const { edge, deltaDays } = input
  const today = input.today ?? dateKey(todayStart())
  const old = { startDate: input.startDate, deadline: input.deadline }
  const clamped = { startDate: input.startDate, deadline: input.deadline }
  let clampedDays = 0

  if (edge === 'move') {
    const s = shiftDate(old.startDate, deltaDays)
    const e = shiftDate(old.deadline, deltaDays)
    if (s && e) {
      clamped.startDate = s
      clamped.deadline = e
      // 整体不许被拖到过去：开工日撞上今天，就把整条再往后推同样的天数（长度不变）
      const back = dayGap(today, s)
      if (back < 0) {
        clampedDays = -back
        clamped.startDate = shiftDate(s, -back) ?? s
        clamped.deadline = shiftDate(e, -back) ?? e
      }
    }
  } else if (edge === 'start') {
    let s = shiftDate(old.startDate, deltaDays)
    if (s) {
      const back = dayGap(today, s)
      if (back < 0) {
        clampedDays = -back
        s = shiftDate(s, -back)
      }
      // 开工日不得越过截稿日
      if (s && dayGap(s, old.deadline) < 0) s = old.deadline
      if (s) clamped.startDate = s
    }
  } else {
    const e = shiftDate(old.deadline, deltaDays)
    // 只钳「截稿日不得退到开工日之前」一条。**刻意不管“截稿日被拖到过去”**：
    // 画师可以把一个已经追不回的单如实标成逾期（后端也只校 deadline ≥ startDate，不校 ≥ 今天）。
    // 与网页端 useQueueTimeline 同口径：只有开工日不得拖进过去（上面 'move' / 'start' 两支钳它）。
    // 旧版此处多写了一句“开工日在过去时也不许把截稿拖到过去”——它永远命中不了
    // （上一行已先把截稿抬到 startDate 及以后），删掉，不留做不到的承诺。
    if (e) clamped.deadline = dayGap(clamped.startDate, e) < 0 ? clamped.startDate : e
  }

  const changed: DragPlan['changed'] = []
  if (clamped.startDate !== old.startDate) changed.push('startDate')
  if (clamped.deadline !== old.deadline) changed.push('deadline')
  return { startDate: clamped.startDate, deadline: clamped.deadline, changed, clampedDays }
}

/** b − a 差几天（本地零点口径；任一非法返 0，调用方按"不钳"处理） */
function dayGap(a: string, b: string): number {
  const da = parseDate(a)
  const db = parseDate(b)
  if (!da || !db) return 0
  const x = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime()
  const y = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime()
  return Math.round((y - x) / 86_400_000)
}

export type WriteField = 'startDate' | 'deadline'
export interface WriteStep {
  field: WriteField
  value: string
}

/** 把拖前/拖后区间拆成写步骤，并钉死**顺序**：
 *  两端都要改时，截稿日后移（增量 ≥ 0）→ 先写 deadline 再写 startDate；否则对称先 startDate。
 *  原因是后端交叉校验 deadline ≥ startDate——先动被另一端旧值挡住的那一步会被 400 拒。
 *  （照 web useQueueTimeline.ts 的 dayDelta 正负分支口径，桌面不另立规则。） */
export function planWrites(
  before: { startDate: string; deadline: string },
  after: { startDate: string; deadline: string }
): WriteStep[] {
  const steps: WriteStep[] = []
  const startChanged = after.startDate !== before.startDate
  const deadlineChanged = after.deadline !== before.deadline
  if (!startChanged && !deadlineChanged) return []
  const deadlineLater = !deadlineChanged || dayGap(before.deadline, after.deadline) >= 0
  if (startChanged && deadlineChanged && !deadlineLater) {
    steps.push({ field: 'startDate', value: after.startDate })
    steps.push({ field: 'deadline', value: after.deadline })
  } else {
    if (deadlineChanged) steps.push({ field: 'deadline', value: after.deadline })
    if (startChanged) steps.push({ field: 'startDate', value: after.startDate })
  }
  return steps
}

/** 列表拖排后的 id 序列：把 oldIndex 那行摘出来插到 newIndex。
 *  越界一律夹到边界（HTML5 drop 落在末尾/开头时索引常越界）；非法索引返原序列副本。 */
export function reorderIds<T>(ids: readonly T[], oldIndex: number, newIndex: number): T[] {
  const next = [...ids]
  if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex)) return next
  if (oldIndex < 0 || oldIndex >= next.length) return next
  const [moved] = next.splice(oldIndex, 1)
  const target = Math.max(0, Math.min(next.length, newIndex))
  next.splice(target, 0, moved)
  return next
}

/** 剩余天数（供 UI 提示"还能往后退 N 天"）；无截稿日返 null */
export function remainingDays(deadline: string | null): number | null {
  return daysLeft(deadline)
}
