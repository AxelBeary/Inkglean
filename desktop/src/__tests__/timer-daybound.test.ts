// 审计波2 DSK-04/05 回归：手动计时器的「关机·休眠时长不算在画」与「跨午夜按本地日历日切」。
// 与 timer.test.ts 分工：那边管落账无尾差/坏数据兜底/重开恢复，这边专管停机与跨天口径。
// 口径同 components/home/localGlance.ts：一律本地日历日（本地零点归一），不碰 UTC 串前缀。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTimerStore } from '../stores/timer'

const KEY = 'shihui-desktop-timer-v1'
const MIN = 60_000
const HOUR = 3_600_000
/** 基准日：本地 2026-08-26 10:00（用本地分量造，断言与跑测机时区无关） */
const DAY = new Date(2026, 7, 26, 10, 0, 0)

function freshStore() {
  setActivePinia(createPinia())
  return useTimerStore()
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 造一份「上次运行留下的」落盘状态（模拟关机前的形状）；legacy=升级前的老形状（无 beatAt 字段） */
function seed(p: {
  date?: string
  acc?: number
  running?: boolean
  startedAt?: number | null
  beatAt?: number | null
  legacy?: boolean
}): void {
  const raw: Record<string, unknown> = {
    v: 1,
    date: p.date ?? keyOf(DAY),
    acc: p.acc ?? 0,
    running: p.running ?? false,
    startedAt: p.startedAt ?? null,
    beatAt: p.beatAt ?? null
  }
  if (p.legacy) delete raw.beatAt
  localStorage.setItem(KEY, JSON.stringify(raw))
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(DAY)
})
afterEach(() => {
  vi.useRealTimers() // 顺带丢掉本例挂着的假定时器（体检/心跳不跨用例残留）
  localStorage.clear()
})

describe('DSK-04　关机/休眠时长不算在画', () => {
  it('同日内关机 3 小时再开：只算到最后一跳，且不自动续跑', () => {
    const t0 = DAY.getTime()
    // 关机前：已落账 10 分钟 + 一段在跑 20 分钟（心跳停在 11:20）
    seed({ acc: 600, running: true, startedAt: t0, beatAt: t0 + 20 * MIN })
    vi.setSystemTime(new Date(t0 + 20 * MIN + 3 * HOUR)) // 关机 3 小时后重开

    const timer = freshStore()
    expect(timer.todaySeconds).toBe(600 + 20 * 60) // 只认最后一跳之前的 20 分钟，关机 3 小时不算
    expect(timer.running).toBe(false)              // 停机期间没在画：收笔暂停，等画师手动继续
    expect(timer.state.date).toBe(keyOf(DAY))
  })

  it('心跳仍新鲜（崩溃后 30 秒重开）：在跑段原样续跑，不清零不暂停', () => {
    const t0 = DAY.getTime()
    seed({ acc: 600, running: true, startedAt: t0, beatAt: t0 + 30_000 })
    vi.setSystemTime(new Date(t0 + 60_000))

    const timer = freshStore()
    expect(timer.running).toBe(true)
    expect(timer.todaySeconds).toBe(660)
    timer.stop() // 收尾：在跑态别漏给后面的用例
    expect(timer.todaySeconds).toBe(660)
  })

  it('升级前的老形状（无 beatAt）：段起点即最后已知时刻，停机时长一律不算', () => {
    const t0 = DAY.getTime()
    seed({ acc: 300, running: true, startedAt: t0, legacy: true })
    vi.setSystemTime(new Date(t0 + 2 * HOUR))

    const timer = freshStore()
    expect(timer.todaySeconds).toBe(300) // 没有心跳可依：宁可不猜，也不把关机 2 小时算成在画
    expect(timer.running).toBe(false)
  })

  it('运行中系统休眠 20 分钟：唤醒后按最后一跳收笔，休眠时长不灌进今天', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(60_000) // 画了 1 分钟（心跳每 15 秒落一次）
    expect(timer.todaySeconds).toBe(60)

    vi.setSystemTime(new Date(DAY.getTime() + 20 * MIN + 60_000)) // 休眠 20 分钟：定时器根本不跑
    timer.pause()                                                 // 唤醒后画师点暂停 → 先体检再落账
    expect(timer.todaySeconds).toBe(60) // 不是 1260
    expect(timer.running).toBe(false)
  })

  it('关窗前补一跳（pagehide）：重开只算到关窗那一刻，比裸心跳更贴', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(20_000)              // 画了 20 秒（心跳只落到 T0+15s）
    window.dispatchEvent(new Event('pagehide')) // 关窗：补一跳到 T0+20s
    vi.setSystemTime(new Date(DAY.getTime() + 3 * HOUR))

    const reopened = freshStore()
    expect(reopened.todaySeconds).toBe(20) // 按补跳算到关窗，而不是按 15 秒心跳少算 5 秒
    expect(reopened.running).toBe(false)
    timer.stop() // 收尾（断言已做完，这次落盘不影响本例）
  })

  it('心跳落盘可跨窗口读到：beatAt 随在跑段定期写进本机存储', () => {
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(16_000)
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { beatAt: number | null; running: boolean }
    expect(persisted.running).toBe(true)
    expect(persisted.beatAt).toBe(DAY.getTime() + 15_000) // 每 15 秒一跳，不是每秒刷盘
    timer.stop()
  })
})

describe('DSK-05　跨午夜按本地日历日切', () => {
  it('运行中跨午夜：在跑段按午夜切开，今天只算午夜后的部分', () => {
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 30))
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(20_000) // → 23:59:50
    expect(timer.todaySeconds).toBe(20)
    expect(timer.state.date).toBe('2026-08-26')

    vi.advanceTimersByTime(40_000) // → 次日 00:00:30
    expect(timer.state.date).toBe('2026-08-27')
    expect(timer.todaySeconds).toBe(30) // 只算午夜后的 30 秒，昨天那 20 秒不串进今天
    expect(timer.running).toBe(true)    // 画师没停手：继续跑

    timer.stop()
    expect(timer.state.acc).toBe(30)
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { date: string; acc: number }
    expect(persisted.date).toBe('2026-08-27')
    expect(persisted.acc).toBe(30)
  })

  it('暂停态跨午夜：常驻体检把昨天累计清零（心跳停摆也要归零）', () => {
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 0))
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(30_000) // → 23:59:30
    timer.pause()
    expect(timer.todaySeconds).toBe(30)

    vi.advanceTimersByTime(90_000) // → 次日 00:01:00，期间没有在跑
    expect(timer.state.date).toBe('2026-08-27')
    expect(timer.todaySeconds).toBe(0)
  })

  it('次日重开：昨天未落账的在跑段不带进今天（关机期间没在画）', () => {
    const y = new Date(2026, 7, 26, 23, 0, 0).getTime()
    seed({ date: '2026-08-26', acc: 3600, running: true, startedAt: y, beatAt: y + 30 * MIN })
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0, 0))

    const timer = freshStore()
    expect(timer.state.date).toBe('2026-08-27')
    expect(timer.todaySeconds).toBe(0) // 昨天的 1 小时 + 在跑 30 分都归昨天
    expect(timer.running).toBe(false)
  })

  it('午夜前后快速重开（心跳仍新鲜）：在跑段按午夜切开后续跑', () => {
    const t = new Date(2026, 7, 26, 23, 58, 0).getTime()
    seed({ date: '2026-08-26', acc: 100, running: true, startedAt: t, beatAt: t + 110_000 }) // 最后一跳 23:59:50
    vi.setSystemTime(new Date(2026, 7, 27, 0, 1, 0))                                        // 00:01:00 重开

    const timer = freshStore()
    expect(timer.state.date).toBe('2026-08-27')
    expect(timer.running).toBe(true)
    expect(timer.todaySeconds).toBe(60) // 只算午夜后的 60 秒，昨天的 100 秒不串过来

    timer.stop()
    expect(timer.state.acc).toBe(60)
  })

  it('跨月/跨年同样按本地日历日切（不是只认「日」字面）', () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 50)) // 本地 2026-09-30 23:59:50
    const timer = freshStore()
    timer.start()
    vi.advanceTimersByTime(20_000) // → 2026-10-01 00:00:10
    expect(timer.state.date).toBe('2026-10-01')
    expect(timer.todaySeconds).toBe(10)
    timer.stop()
  })

  it('按**本地**午夜切，不按 UTC 串（时区口径哨兵）', () => {
    seed({ date: '2026-08-26', acc: 900 })
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 59))
    expect(freshStore().todaySeconds).toBe(900) // 还在本地 26 号：这份累计仍属「今日」

    vi.setSystemTime(new Date(2026, 7, 27, 0, 0, 0))
    expect(freshStore().todaySeconds).toBe(0) // 本地午夜一过即清零（UTC 串口径会在别的钟点清零）
  })
})
