// 方向 A 测试④：本地手动计时器计时与持久化
// 口径：开始/暂停/停止落账无尾差；数据仅存本机（键 shihui-desktop-timer-v1）；
// 重开应用（新实例）恢复累计；坏数据落默认；跨天清零。
// 纪律：F8 时间数据永不上传——本测试同时守护「只写 localStorage」这条线。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTimerStore, formatSeconds } from '../stores/timer'

const KEY = 'shihui-desktop-timer-v1'
const DAY = new Date('2026-08-26T10:00:00')

function freshStore() {
  setActivePinia(createPinia())
  return useTimerStore()
}

describe('formatSeconds 口径', () => {
  it('分/小时/零值', () => {
    expect(formatSeconds(0)).toBe('0 分')
    expect(formatSeconds(59)).toBe('0 分')
    expect(formatSeconds(60)).toBe('1 分')
    expect(formatSeconds(3600)).toBe('1 小时')
    expect(formatSeconds(3720)).toBe('1 小时 2 分')
    expect(formatSeconds(-5)).toBe('0 分')
  })
})

describe('计时与持久化', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(DAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('开始→走秒→暂停：在跑段落账无尾差，写入本机', () => {
    const timer = freshStore()
    expect(timer.todaySeconds).toBe(0)

    timer.start()
    expect(timer.running).toBe(true)
    vi.advanceTimersByTime(65_000) // 心跳每秒刷 now，65 秒后
    expect(timer.todaySeconds).toBe(65)

    timer.pause()
    expect(timer.running).toBe(false)
    expect(timer.todaySeconds).toBe(65)

    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { acc: number; running: boolean }
    expect(persisted.acc).toBe(65)
    expect(persisted.running).toBe(false)
  })

  it('停止与暂停同口径落账（画过的时间不丢）', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(30_000)
    timer.stop()
    expect(timer.todaySeconds).toBe(30)

    timer.start()
    vi.advanceTimersByTime(12_000)
    timer.stop()
    expect(timer.todaySeconds).toBe(42)
  })

  it('重开应用（新实例）从本机恢复累计与在跑段', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(20_000)
    timer.pause()

    const reopened = freshStore()
    expect(reopened.todaySeconds).toBe(20)
    expect(reopened.running).toBe(false)
  })

  it('坏数据落默认，永不抛错', () => {
    localStorage.setItem(KEY, '{坏数据')
    const timer = freshStore()
    expect(timer.todaySeconds).toBe(0)

    localStorage.setItem(KEY, JSON.stringify({ v: 1, date: '2026-08-26', acc: -9, running: 'nope', startedAt: 'x' }))
    const timer2 = freshStore()
    expect(timer2.todaySeconds).toBe(0)
    expect(timer2.running).toBe(false)
  })

  it('跨天自动清零（今日累计口径）', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(60_000)
    timer.pause()
    expect(timer.todaySeconds).toBe(60)

    // 新的一天打开应用 → 清零重建
    vi.setSystemTime(new Date('2026-08-27T09:00:00'))
    const nextDay = freshStore()
    expect(nextDay.todaySeconds).toBe(0)
  })
})
