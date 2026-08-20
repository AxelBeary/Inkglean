/**
 * 自定义首页批二·截稿倒计时板块纯函数（子代理 E）
 * 口径：后端 getDeadlineSoon 返 daysLeft 整数天数；负数=已逾期，0=今天截稿。
 * 三态色点：逾期=朱砂(--zs) / 今天=藤黄(--th) / 未来=花青(--hq)（原型 820 拍板）
 */

/** 截稿三态（色点与文案共用同一判定） */
export type DdlTone = 'overdue' | 'today' | 'future'

/** daysLeft → 三态；非有限数防御落 future */
export function classifyDeadline(daysLeft: number): DdlTone {
  if (!Number.isFinite(daysLeft)) return 'future'
  if (daysLeft < 0) return 'overdue'
  if (daysLeft === 0) return 'today'
  return 'future'
}

/** 文案键 + 参数（i18n 词条在 dashboardPrefs 命名空间） */
export interface DdlLabel {
  key: 'dashboardPrefs.ddlOverdue' | 'dashboardPrefs.ddlToday' | 'dashboardPrefs.ddlDaysLeft'
  params?: { n: number }
}

/**
 * 文案三键切换：逾期→ddlOverdue{n=绝对天数} / 今天→ddlToday / 未来→ddlDaysLeft{n=天数}；
 * 非有限数防御落「还剩 0 天」（服务端契约保证整数，此路仅为兜底）
 */
export function deadlineLabel(daysLeft: number): DdlLabel {
  if (!Number.isFinite(daysLeft)) return { key: 'dashboardPrefs.ddlDaysLeft', params: { n: 0 } }
  const tone = classifyDeadline(daysLeft)
  if (tone === 'overdue') return { key: 'dashboardPrefs.ddlOverdue', params: { n: Math.abs(Math.trunc(daysLeft)) } }
  if (tone === 'today') return { key: 'dashboardPrefs.ddlToday' }
  return { key: 'dashboardPrefs.ddlDaysLeft', params: { n: Math.trunc(daysLeft) } }
}
