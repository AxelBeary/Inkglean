// 截稿提醒（本地核心环波14）：云端截稿倒计时与本地记账截稿共用一条提醒链——
// 「逾期/今天截稿/明天截稿」进系统通知，每日按条目去重（不打扰纪律：一天一条一次）。
// 纯函数可测；通知本体走既有 notify 桥（非关键路径静默降级）。
export interface DeadlineAlertItem {
  /** 去重键（云端=订单号/本地=记账 id 前缀，调用方保证稳定唯一） */
  id: string
  /** 展示用人名/单名 */
  who: string
  /** 距截稿天数（负数=已逾期） */
  daysLeft: number
}

export interface DeadlineAlert {
  text: string
  newIds: string[]
}

/** 组装提醒：只收「逾期/今天/明天」且未提醒过的条目，最多展示 3 条（多了收「还有 N 笔」）。
 *  无可提醒项返 null（调用方不发通知）。 */
export function buildDeadlineAlerts(
  items: DeadlineAlertItem[],
  notified: Set<string>
): DeadlineAlert | null {
  const urgent = items
    .filter(i => i.daysLeft <= 1 && !notified.has(i.id))
    .sort((a, b) => a.daysLeft - b.daysLeft)
  if (urgent.length === 0) return null
  const shown = urgent.slice(0, 3)
  const parts = shown.map(i => {
    if (i.daysLeft < 0) return `${i.who}已逾期 ${-i.daysLeft} 天`
    if (i.daysLeft === 0) return `${i.who}今天截稿`
    return `${i.who}明天截稿`
  })
  const more = urgent.length > 3 ? `，还有 ${urgent.length - 3} 笔` : ''
  return { text: parts.join('；') + more, newIds: urgent.map(i => i.id) }
}

const ALERT_KEY = 'shihui-deadline-alerted-v1'

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 读今日已提醒 id 集（跨天自动作废；坏数据落空集） */
export function loadAlertedIds(storage: Storage = localStorage): Set<string> {
  try {
    const raw = storage.getItem(ALERT_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { date?: string; ids?: string[] }
    if (parsed?.date !== todayKey() || !Array.isArray(parsed.ids)) return new Set()
    return new Set(parsed.ids.filter(x => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

/** 写今日已提醒 id 集（整体覆盖，日期戳随行） */
export function saveAlertedIds(ids: string[], storage: Storage = localStorage): void {
  try {
    storage.setItem(ALERT_KEY, JSON.stringify({ date: todayKey(), ids }))
  } catch {
    /* 标记失败：下次可能重提一条，非致命 */
  }
}
