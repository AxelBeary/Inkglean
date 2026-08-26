// 本地核心环波15 测试：托盘快照组句（口径哨兵）。
import { describe, it, expect } from 'vitest'
import { buildTraySnapshot } from '../tools/traySnapshot'

describe('buildTraySnapshot（托盘快照组句）', () => {
  it('全空退回基础文案（模式标签随行）', () => {
    expect(buildTraySnapshot({ modeLabel: '本地', openCount: 0, overdue: 0, dueToday: 0, paintedSecs: 0 }))
      .toBe('拾绘 · 本地')
    expect(buildTraySnapshot({ modeLabel: '星野', openCount: 0, overdue: 0, dueToday: 0, paintedSecs: 0 }))
      .toBe('拾绘 · 星野')
  })

  it('有什么说什么，顺序固定（在账→逾期→今日截稿→今日在画）', () => {
    const text = buildTraySnapshot({ modeLabel: '星野', openCount: 5, overdue: 1, dueToday: 2, paintedSecs: 7200 })
    expect(text).toBe('拾绘 · 星野 · 在账 5 笔 · 逾期 1 · 今天截稿 2 · 今日在画 2 小时')
  })

  it('零值段落不出现（不打扰纪律）', () => {
    const text = buildTraySnapshot({ modeLabel: '本地', openCount: 3, overdue: 0, dueToday: 0, paintedSecs: 90 })
    expect(text).toBe('拾绘 · 本地 · 在账 3 笔 · 今日在画 1 分')
    expect(text).not.toContain('逾期')
    expect(text).not.toContain('截稿')
  })
})
