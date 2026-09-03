// 卷尾「排期 · 近 7 天」摘要签纯函数（9/4 主页重设计落码波1 · 契约层）。
// 台面口径：一眼扫完这一周忙不忙，点开才进独立排期页（原型 THESIS「长卷是摘要台面，不是储物间」）。
// 三条诚实口径（与月历故意不同，因为窗口不同——月历看整月，摘要签只看今天起 7 天）：
// ① 逾期单只压「今天」一格：它的原始区间多半整段落在过去，按原样算在这 7 天里根本看不见，
//    但它确实压在画师当下（原型摘要签就是一天朱砂、其余按实）；整周涂朱砂等于把「这周全逾期」
//    这句假话告知画师，故只标今天；
// ② 已完成单不占未来时间：整条不计入（月历里仍画石绿带，那是「这个月发生了什么」的记录）；
// ③ 未设截稿的在画单画满到窗口末（同月历 fallbackEnd 口径）——它确实占着这段时间，不是 bug。
import { bandTone, todayStart } from './band'
import { orderSpan } from './cal'
import type { BandTone } from './band'
import type { SchedOrder } from './types'

export interface StripDay {
  date: Date
  /** 周几文案：一/二/三/四/五/六/日 */
  weekday: string
  /** over＝该日有逾期单（朱砂）/ busy＝有单在画（花青）/ full＝空日但名额已满（藤黄，仅云端）/ free＝空日素条 */
  tone: 'over' | 'busy' | 'full' | 'free'
  /** 该日覆盖的单数（宿主可做悬停提示） */
  count: number
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

interface StripSpan { start: Date; end: Date; tone: BandTone }

/** 今天起 7 天（含今天）的摘要签。
 *  quotaApplies：名额语义是否适用（云端 true / 本地 false）——本地记账根本没有名额席位概念，
 *  空日不能涂藤黄（那颜色在月历图例里是「名额已满」与「临期」，对本地画师是假信息），一律走素条。 */
export function buildSchedStrip(orders: SchedOrder[], canAccept: boolean, quotaApplies = true): StripDay[] {
  const list = Array.isArray(orders) ? orders : []
  const start = todayStart()
  const windowEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59)

  const spans: StripSpan[] = []
  const todayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59)
  for (const o of list) {
    const tone = bandTone(o)
    if (tone === 'done') continue // 口径②
    if (tone === 'over') {
      spans.push({ start, end: todayEnd, tone }) // 口径①：只压今天，不涂满整周
      continue
    }
    const span = orderSpan(o, windowEnd) // 口径③由 orderSpan 的 fallbackEnd 兜
    if (span) spans.push({ ...span, tone })
  }

  const days: StripDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
    const hit = spans.filter(s => s.start <= dayEnd && s.end >= dayStart)
    const tone: StripDay['tone'] = hit.some(s => s.tone === 'over')
      ? 'over'
      : hit.length > 0
        ? 'busy'
        : quotaApplies && !canAccept ? 'full' : 'free'
    days.push({ date: d, weekday: WEEKDAY[d.getDay()], tone, count: hit.length })
  }
  return days
}
