// 截稿倒计时板块纯函数测试（自定义首页批二·子代理 E）
import { describe, it, expect } from 'vitest'
import { classifyDeadline, deadlineLabel } from '../ddl-soon'

describe('classifyDeadline 三态色点判定', () => {
  it('负数 = 逾期（朱砂）', () => {
    expect(classifyDeadline(-3)).toBe('overdue')
  })

  it('0 = 今天截稿（藤黄）', () => {
    expect(classifyDeadline(0)).toBe('today')
  })

  it('正数 = 未来（花青）', () => {
    expect(classifyDeadline(6)).toBe('future')
  })

  it('非有限数防御落 future', () => {
    expect(classifyDeadline(Number.NaN)).toBe('future')
    expect(classifyDeadline(Number.POSITIVE_INFINITY)).toBe('future')
  })
})

describe('deadlineLabel 文案三键切换', () => {
  it('逾期 → ddlOverdue + 绝对天数', () => {
    expect(deadlineLabel(-2)).toEqual({ key: 'dashboardPrefs.ddlOverdue', params: { n: 2 } })
  })

  it('今天 → ddlToday（无参数）', () => {
    expect(deadlineLabel(0)).toEqual({ key: 'dashboardPrefs.ddlToday' })
  })

  it('未来 → ddlDaysLeft + 天数', () => {
    expect(deadlineLabel(6)).toEqual({ key: 'dashboardPrefs.ddlDaysLeft', params: { n: 6 } })
  })

  it('非整数截断（防御；服务端契约保证整数）', () => {
    expect(deadlineLabel(3.7)).toEqual({ key: 'dashboardPrefs.ddlDaysLeft', params: { n: 3 } })
    expect(deadlineLabel(-1.9)).toEqual({ key: 'dashboardPrefs.ddlOverdue', params: { n: 1 } })
  })

  it('非有限数防御落「还剩 0 天」', () => {
    expect(deadlineLabel(Number.NaN)).toEqual({ key: 'dashboardPrefs.ddlDaysLeft', params: { n: 0 } })
  })
})
