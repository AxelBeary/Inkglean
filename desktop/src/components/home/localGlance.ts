// 本地模式概览句组装（本地核心环波6）：首页题签概览句的本地口径——
// 与云端概览同构（段落数组 + 语气标记），数据全部来自本地记账，纯函数可测。
// 纪律：0 笔在账退回一句本地口径（不打扰）；逾期/今日截稿给加重段。
import type { LocalOrder } from '../../stores/localLedger'

export interface LocalGlancePart { text: string; tone: 'od' | 'ok' | '' }

/** 截稿日与今天零点差几天（负数=已逾期）；无效日期返回 null */
export function localDaysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date()
  const a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

function fmtYuan(v: number): string {
  return `¥${v.toFixed(2).replace(/\.00$/, '')}`
}

/** 组装本地概览句：在账/进行中/本月已收 + 最急截稿（逾期/今天/明天） */
export function buildLocalGlance(orders: LocalOrder[], paidThisMonth: number): LocalGlancePart[] {
  if (orders.length === 0) return [{ text: '本地模式 · 数据仅存本机', tone: '' }]
  const parts: LocalGlancePart[] = []
  parts.push({ text: `${orders.length} 笔在账`, tone: 'ok' })
  const wip = orders.filter(o => o.status === 'in_progress').length
  if (wip > 0) parts.push({ text: `${wip} 笔进行中`, tone: '' })
  if (paidThisMonth > 0) parts.push({ text: `本月已收 ${fmtYuan(paidThisMonth)}`, tone: 'ok' })

  // 最急截稿：未完成单里取最靠前的截稿日（逾期/今天/明天进加重段）
  const open = orders
    .filter(o => o.status === 'draft' || o.status === 'in_progress')
    .map(o => ({ o, dl: localDaysLeft(o.deadline) }))
    .filter(x => x.dl !== null)
    .sort((a, b) => (a.dl ?? 0) - (b.dl ?? 0))
  const nearest = open[0]
  if (nearest && nearest.dl !== null) {
    const who = nearest.o.client_name || '有一单'
    if (nearest.dl < 0) parts.push({ text: `${who}已逾期 ${-nearest.dl} 天`, tone: 'od' })
    else if (nearest.dl === 0) parts.push({ text: `${who}今天截稿`, tone: 'od' })
    else if (nearest.dl === 1) parts.push({ text: `${who}明天截稿`, tone: 'od' })
  }
  return parts
}

// ─── 本地悬浮截稿行（本地模式体验巡检收尾波）：悬浮截稿窗的本地数据源，口径同首页倒计时条 ───

export interface LocalDeadlineRow {
  id: number
  /** 展示名：客户名优先，落内容次之 */
  clientName: string
  orderNo: string
  daysLeft: number
}

/** 从本地记账组悬浮截稿行（纯函数可测）：未完成 + 有截稿 + 窗口内（≤horizonDays），
 *  daysLeft 升序（逾期最前），超 limit 截断——与云端 fetchDeadlineSoon(14, 6) 同款口径 */
export function buildLocalDeadlineRows(
  orders: LocalOrder[],
  horizonDays: number,
  limit: number
): LocalDeadlineRow[] {
  const rows: LocalDeadlineRow[] = []
  for (const o of orders) {
    if (o.status !== 'draft' && o.status !== 'in_progress') continue
    if (!o.deadline) continue
    const dl = localDaysLeft(o.deadline)
    if (dl === null || dl > horizonDays) continue
    rows.push({
      id: o.id,
      clientName: o.client_name || o.title || '未名单',
      orderNo: o.title || o.client_name || `单 ${o.id}`,
      daysLeft: dl
    })
  }
  rows.sort((a, b) => a.daysLeft - b.daysLeft)
  return rows.slice(0, limit)
}
