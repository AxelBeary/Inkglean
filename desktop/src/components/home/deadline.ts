// 截稿倒计时三色分级（照原型口径：剩 3 天内花青 / 明天·今天截稿朱砂 / 已逾期深朱砂）
// 供订单速览板块与截稿悬浮卡共用，避免两处口径漂移。

export interface DeadlineLevel {
  /** 纸墨色阶 class（zs-d=已逾期 / zs=明天、今天截稿 / hq=剩 2~3 天 / buf=更远） */
  cls: 'zs-d' | 'zs' | 'hq' | 'buf'
  /** 口径文案 */
  text: string
}

export function deadlineLevel(daysLeft: number): DeadlineLevel {
  if (daysLeft < 0) return { cls: 'zs-d', text: `逾期 ${-daysLeft} 天` }
  if (daysLeft === 0) return { cls: 'zs', text: '今天截稿' }
  if (daysLeft === 1) return { cls: 'zs', text: '明天截稿' }
  if (daysLeft <= 3) return { cls: 'hq', text: `剩 ${daysLeft} 天` }
  return { cls: 'buf', text: `剩 ${daysLeft} 天` }
}
