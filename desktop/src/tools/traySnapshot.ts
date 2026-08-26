// 托盘快照组句（本地核心环波15）：今日状态概要 → 托盘 tooltip。
// 口径：在账/逾期/今日截稿/今日已画，有什么说什么，全空退回「拾绘桌面版」。
import { formatSeconds } from '../stores/timer'

export interface TraySnapshotInput {
  /** 模式标签：云端=画师名；本地='本地' */
  modeLabel: string
  /** 在账（云端订单总数 / 本地记账笔数） */
  openCount: number
  /** 已逾期笔数 */
  overdue: number
  /** 今天截稿笔数 */
  dueToday: number
  /** 今日自动识别在画秒数 */
  paintedSecs: number
}

/** 组快照句（纯函数可测）：段落用 · 分隔，全空退回基础文案 */
export function buildTraySnapshot(i: TraySnapshotInput): string {
  const parts: string[] = [`拾绘 · ${i.modeLabel}`]
  if (i.openCount > 0) parts.push(`在账 ${i.openCount} 笔`)
  if (i.overdue > 0) parts.push(`逾期 ${i.overdue}`)
  if (i.dueToday > 0) parts.push(`今天截稿 ${i.dueToday}`)
  if (i.paintedSecs > 0) parts.push(`今日在画 ${formatSeconds(i.paintedSecs)}`)
  return parts.join(' · ')
}
