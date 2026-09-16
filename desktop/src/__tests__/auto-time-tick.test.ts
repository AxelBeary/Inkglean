// 审计波2 DSK-06/12 回归：自动识别（F8）「跨午夜即归零」与「不再每次进首页白送一票 30 秒」。
// 桥层换成迷你内存库桩（只认 autoTime 用到的那几条 SQL），三处对齐着断言：内存 today / 库行 / 周·月窗口。
// 时区口径同 components/home/localGlance.ts：归属日一律本地日历日（用本地分量造时刻，断言与跑测机时区无关）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { LocalOrder } from '../stores/localLedger'

/** 迷你内存库（vi.hoisted：vi.mock 工厂会被提升到 import 之前，桩必须先于工厂存在） */
const h = vi.hoisted(() => {
  interface TimeLogRow {
    paint_secs: number
    idle_secs: number
    other_secs: number
    updated_at: string
  }
  const timeLog = new Map<string, TimeLogRow>()
  const orderTime = new Map<number, number>()
  const monitor = { title: '头像.clip – CLIP STUDIO PAINT', idle: 10 }

  const db = {
    async select<T>(sql: string, args: unknown[] = []): Promise<T> {
      // 今日累计（按 date 取单行）
      if (sql.includes('WHERE date = $1')) {
        const row = timeLog.get(String(args[0]))
        return (row ? [row] : []) as unknown as T
      }
      // 归单工时全表
      if (sql.includes('FROM local_order_time')) {
        return [...orderTime].map(([order_id, total_secs]) => ({ order_id, total_secs })) as unknown as T
      }
      // 近 7 日（真库按 date DESC；桩给全量即可，loadWeek 自己按本地日期键取）
      if (sql.includes('ORDER BY date DESC LIMIT 7')) {
        return [...timeLog].map(([date, r]) => ({ date, ...r })) as unknown as T
      }
      // 月聚合（与真库 substr(date,1,7) GROUP BY 同款口径）
      if (sql.includes('GROUP BY substr(date, 1, 7)')) {
        const byMonth = new Map<string, { paint: number; other: number }>()
        for (const [date, r] of timeLog) {
          const m = date.slice(0, 7)
          const acc = byMonth.get(m) ?? { paint: 0, other: 0 }
          acc.paint += r.paint_secs
          acc.other += r.other_secs
          byMonth.set(m, acc)
        }
        return [...byMonth].map(([m, v]) => ({ m, ...v })) as unknown as T
      }
      return [] as unknown as T
    },
    async execute(sql: string, args: unknown[] = []): Promise<{ rowsAffected: number }> {
      if (sql.includes('INSERT INTO local_time_log')) {
        const [date, paint, idle, other, updated_at] = args as [string, number, number, number, string]
        const cur = timeLog.get(date) ?? { paint_secs: 0, idle_secs: 0, other_secs: 0, updated_at: '' }
        // ON CONFLICT(date) DO UPDATE SET x = x + $n
        timeLog.set(date, {
          paint_secs: cur.paint_secs + paint,
          idle_secs: cur.idle_secs + idle,
          other_secs: cur.other_secs + other,
          updated_at
        })
        return { rowsAffected: 1 }
      }
      if (sql.includes('INSERT INTO local_order_time')) {
        const [id, secs] = args as [number, number]
        orderTime.set(id, (orderTime.get(id) ?? 0) + secs)
        return { rowsAffected: 1 }
      }
      return { rowsAffected: 0 }
    },
    async close(): Promise<void> { /* 桩无需真关 */ }
  }

  return { timeLog, orderTime, monitor, db }
})

// 桥桩：本地库与监听桥都走内存实现（isDesktop 仍用真探测——靠 window.__TAURI_INTERNALS__ 开关）
vi.mock('../bridge/db', () => ({
  openLocalDb: async () => h.db,
  closeLocalDb: async () => {},
  localDbPath: async () => '/appdata/local.db',
  broadcastCloseAllDb: async () => {},
  deleteDbSidecar: async () => {},
  DB_CLOSE_ALL_EVENT: 'desktop-db-close-all'
}))
vi.mock('../bridge/monitor', () => ({
  foregroundTitle: async () => h.monitor.title,
  inputIdleSecs: async () => h.monitor.idle
}))

import { useAutoTimeStore, tickSeconds, POLL_SECS } from '../stores/autoTime'
import { useLocalLedgerStore } from '../stores/localLedger'

const win = window as unknown as Record<string, unknown>
/** beforeEach 钉的基准日：本地 2026-09-17 */
const DAY_KEY = '2026-09-17'
const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime()

/** 排空挂起的桥调用（Promise 链）：假定时器不动微任务，用 0 毫秒异步推进让 start 的首轮读取落定 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

function seedDay(date: string, paint: number): void {
  h.timeLog.set(date, { paint_secs: paint, idle_secs: 0, other_secs: 0, updated_at: '' })
}

function order(p: Partial<LocalOrder>): LocalOrder {
  return {
    id: p.id ?? 1, client_name: p.client_name ?? '张三', title: p.title ?? '头像',
    price: p.price ?? 100, deadline: p.deadline ?? null, status: p.status ?? 'in_progress',
    created_at: '', updated_at: ''
  }
}

beforeEach(() => {
  h.timeLog.clear()
  h.orderTime.clear()
  h.monitor.title = '头像.clip – CLIP STUDIO PAINT'
  h.monitor.idle = 10
  win.__TAURI_INTERNALS__ = {} // 装成桌面壳：否则 start() 直接短路
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date(T0))
})
afterEach(() => {
  vi.useRealTimers() // 顺带丢掉本例挂着的假轮询，不跨用例残留
  delete win.__TAURI_INTERNALS__
})

describe('tickSeconds（DSK-12 计票口径纯函数）', () => {
  it('无基线（每次 start 的首票）计 0：不再白送一票', () => {
    expect(tickSeconds(null, T0)).toBe(0)
  })

  it('正常一个周期计满 30 秒，不足按真实流逝', () => {
    expect(tickSeconds(T0, T0 + 30_000)).toBe(POLL_SECS)
    expect(tickSeconds(T0, T0 + 29_000)).toBe(29)
  })

  it('后台节流拖到 55 秒仍钳在一个周期（与旧行为一致，不虚增）', () => {
    expect(tickSeconds(T0, T0 + 55_000)).toBe(POLL_SECS)
    expect(tickSeconds(T0, T0 + 60_000)).toBe(POLL_SECS)
  })

  it('断档超两个周期（切页/关机/休眠）计 0：没在采样就不猜', () => {
    expect(tickSeconds(T0, T0 + 61_000)).toBe(0)
    expect(tickSeconds(T0, T0 + 10 * 60_000)).toBe(0)
  })

  it('时钟回拨/同刻/坏基线计 0（不产生负工时）', () => {
    expect(tickSeconds(T0, T0 - 1000)).toBe(0)
    expect(tickSeconds(T0, T0)).toBe(0)
    expect(tickSeconds(Number.NaN, T0)).toBe(0)
  })
})

describe('DSK-12　每次进首页不再无条件多采一票', () => {
  it('start 的首票只立采样基线：内存不涨、库里也不落这一票', async () => {
    const store = useAutoTimeStore()
    store.start()
    await flush()
    expect(store.today.paint).toBe(0)
    expect(store.hasData).toBe(false)
    expect(h.timeLog.size).toBe(0)
    store.stop()
  })

  it('首票之后按 30 秒节奏照常计票（没把轮询一并弄坏）', async () => {
    const store = useAutoTimeStore()
    store.start()
    await flush()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(POLL_SECS)
    expect(h.timeLog.get(DAY_KEY)?.paint_secs).toBe(POLL_SECS)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(2 * POLL_SECS)
    store.stop()
  })

  it('反复切页（stop→start 五次）：只按真实采样到的票算，不每次进门多一票', async () => {
    const store = useAutoTimeStore()
    for (let i = 0; i < 5; i++) {
      store.start()
      await flush()
      await vi.advanceTimersByTimeAsync(30_000) // 每次在首页只采到一票
      store.stop()
      await vi.advanceTimersByTimeAsync(1_000) // 离开首页 1 秒
    }
    expect(store.today.paint).toBe(5 * POLL_SECS) // 旧行为 6 票＝180 秒（多送的那票即本条缺陷）
    expect(h.timeLog.get(DAY_KEY)?.paint_secs).toBe(5 * POLL_SECS)
    store.stop()
  })

  it('离开首页 10 分钟再回来：那 10 分钟不算工时', async () => {
    const store = useAutoTimeStore()
    store.start()
    await flush()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(POLL_SECS)

    store.stop()                                   // 切到别的页：轮询停
    await vi.advanceTimersByTimeAsync(10 * 60_000) // 离开 10 分钟（无定时器在跑，只走时钟）
    store.start()                                  // 回到首页
    await flush()
    expect(store.today.paint).toBe(POLL_SECS)      // 首票不白送（旧行为这里已是 60 秒）

    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(2 * POLL_SECS)
    expect(h.timeLog.get(DAY_KEY)?.paint_secs).toBe(2 * POLL_SECS) // 库里同样只有真实采到的 60 秒
    store.stop()
  })

  it('AFK 票也不白送：首票计 0，空闲超阈的那票按真实秒数进「离开」桶', async () => {
    const store = useAutoTimeStore()
    store.start()
    await flush()
    h.monitor.idle = 600 // 键鼠空闲 10 分钟 → 判离开
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(0)
    expect(store.today.idle).toBe(POLL_SECS)
    expect(h.timeLog.get(DAY_KEY)?.idle_secs).toBe(POLL_SECS)
    store.stop()
  })
})

describe('DSK-06　自动识别跨午夜即归零（本地日历日）', () => {
  it('一直停在首页：午夜一过内存 today 换成新的一天，昨天累计不串进今日在画', async () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 50)) // 本地 09-17 23:59:50
    seedDay('2026-09-17', 3600)

    const store = useAutoTimeStore()
    store.start()
    await flush()
    expect(store.todayDate).toBe('2026-09-17')
    expect(store.today.paint).toBe(3600)

    await vi.advanceTimersByTimeAsync(40_000) // → 本地 09-18 00:00:20，跨过午夜
    expect(store.todayDate).toBe('2026-09-18')
    expect(store.today.paint).toBe(POLL_SECS) // 旧行为：3600 + 30（昨天整天挂在「今日在画」上）
    expect(h.timeLog.get('2026-09-17')?.paint_secs).toBe(3600) // 昨天那行原样留着
    expect(h.timeLog.get('2026-09-18')?.paint_secs).toBe(POLL_SECS) // 新的一天另起一行
    expect(store.week[6]?.date).toBe('2026-09-18') // 周窗口随滚日平移
    expect(store.week[6]?.paint).toBe(POLL_SECS)
    store.stop()
  })

  it('跨月午夜（09-30 → 10-01）：滚日连带周/月窗口平移到新月', async () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 50))
    seedDay('2026-09-30', 7200)

    const store = useAutoTimeStore()
    store.start()
    await flush()
    expect(store.today.paint).toBe(7200)
    expect(store.months.map(m => m.month)).toEqual(['2026-08', '2026-09'])

    await vi.advanceTimersByTimeAsync(40_000)
    expect(store.todayDate).toBe('2026-10-01')
    expect(store.today.paint).toBe(POLL_SECS)
    expect(store.months.map(m => m.month)).toEqual(['2026-09', '2026-10'])
    expect(store.months[0]?.paint).toBe(7200)      // 9 月留在库里
    expect(store.months[1]?.paint).toBe(POLL_SECS) // 10 月只有刚采的这一票
    store.stop()
  })

  it('午夜后连续采样：每票都记到新的一天，不再回写昨天', async () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 50))
    seedDay('2026-09-17', 3600)

    const store = useAutoTimeStore()
    store.start()
    await flush()
    await vi.advanceTimersByTimeAsync(40_000) // → 09-18 00:00:20：第一票顺带滚日
    await vi.advanceTimersByTimeAsync(30_000) // → 09-18 00:00:50：第二票
    expect(store.todayDate).toBe('2026-09-18')
    expect(store.today.paint).toBe(2 * POLL_SECS)
    expect(h.timeLog.get('2026-09-17')?.paint_secs).toBe(3600) // 昨天那行没被再动过
    expect(h.timeLog.get('2026-09-18')?.paint_secs).toBe(2 * POLL_SECS)
    store.stop()
  })

  it('午夜后重开应用：今日在画从 0 起算，昨天那行仍在库里', async () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 50))
    seedDay('2026-09-17', 3600)
    const first = useAutoTimeStore()
    first.start()
    await flush()
    expect(first.today.paint).toBe(3600)
    first.stop()

    setActivePinia(createPinia()) // 新 pinia ＝ 重启后的新窗口
    vi.setSystemTime(new Date(2026, 8, 18, 9, 0, 0))
    const second = useAutoTimeStore()
    second.start()
    await flush()
    expect(second.todayDate).toBe('2026-09-18')
    expect(second.today.paint).toBe(0)
    expect(h.timeLog.get('2026-09-17')?.paint_secs).toBe(3600)
    second.stop()
  })
})

describe('DSK-12　归单工时同样不白送（波11 归属连带）', () => {
  it('首票不往委托上挂工时；随后每票按真实秒数累加', async () => {
    const ledger = useLocalLedgerStore()
    ledger.orders = [order({ id: 7, client_name: '张三', title: '头像' })]

    const store = useAutoTimeStore()
    store.start()
    await flush()
    expect(h.orderTime.size).toBe(0)
    expect(store.orderSeconds[7]).toBeUndefined()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.today.paint).toBe(POLL_SECS)
    expect(h.orderTime.get(7)).toBe(POLL_SECS)
    expect(store.orderSeconds[7]).toBe(POLL_SECS)
    store.stop()
  })
})
