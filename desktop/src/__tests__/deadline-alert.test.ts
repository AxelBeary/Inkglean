// 本地核心环波14 测试：截稿提醒——组句/去重/上限纯函数 + 标记读写口径。
import { describe, it, expect, beforeEach } from 'vitest'
import { buildDeadlineAlerts, loadAlertedIds, saveAlertedIds } from '../tools/deadlineAlert'

function item(id: string, who: string, daysLeft: number) {
  return { id, who, daysLeft }
}

beforeEach(() => localStorage.clear())

describe('buildDeadlineAlerts（组句规则）', () => {
  it('只收逾期/今天/明天，逾期排最前', () => {
    const alert = buildDeadlineAlerts([
      item('a', '张三', 1),
      item('b', '李四', -2),
      item('c', '王五', 0),
      item('d', '远期', 5)
    ], new Set())
    expect(alert).not.toBeNull()
    expect(alert!.text).toBe('李四已逾期 2 天；王五今天截稿；张三明天截稿')
    expect(alert!.newIds.sort()).toEqual(['a', 'b', 'c'])
  })

  it('已提醒过的不重复', () => {
    const alert = buildDeadlineAlerts([item('a', '张三', 0)], new Set(['a']))
    expect(alert).toBeNull()
  })

  it('超 3 条收「还有 N 笔」', () => {
    const alert = buildDeadlineAlerts([
      item('a', '一', 0), item('b', '二', 0), item('c', '三', 0),
      item('d', '四', 0), item('e', '五', 0)
    ], new Set())
    expect(alert!.text).toContain('，还有 2 笔')
    expect(alert!.newIds).toHaveLength(5) // 去重标记覆盖全部紧急项，不只展示的 3 条
  })

  it('无紧急项返 null（不发通知）', () => {
    expect(buildDeadlineAlerts([item('a', '远期', 9)], new Set())).toBeNull()
    expect(buildDeadlineAlerts([], new Set())).toBeNull()
  })
})

describe('提醒标记（每日去重）', () => {
  it('写后可读回', () => {
    saveAlertedIds(['x', 'y'])
    expect([...loadAlertedIds()].sort()).toEqual(['x', 'y'])
  })

  it('坏数据落空集', () => {
    localStorage.setItem('shihui-deadline-alerted-v1', '{这不是json')
    expect(loadAlertedIds().size).toBe(0)
  })

  it('日期不是今天则作废（跨天自动清零）', () => {
    localStorage.setItem('shihui-deadline-alerted-v1', JSON.stringify({ date: '1999-01-01', ids: ['x'] }))
    expect(loadAlertedIds().size).toBe(0)
  })
})
