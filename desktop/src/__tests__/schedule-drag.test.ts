// 波2 拖拽改期批 · 路C：`schedule/drag.ts` 纯函数层口径哨兵（只写测试，不动实现）。
// 钉住的红线（编号照派工提示词 §四）：
//   口径 1 两步写顺序 → describe「planWrites」
//   口径 4 两条钳制   → describe「planDragRange」（today 一律注入固定值，不依赖本机当天）
//   拖拽可用性       → describe「canDragBar / canReorderRow / TERMINAL_STATUSES」
// 纪律：断言只认函数输入输出，绝不在测试里重抄一份算法（9/4 波1 哨兵自我循环的教训）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  TERMINAL_STATUSES,
  canDragBar,
  canReorderRow,
  planDragRange,
  planWrites,
  pxToDays,
  remainingDays,
  reorderIds,
  shiftDate
} from '../schedule/drag'
import type { DragRangeInput } from '../schedule/drag'
import type { SchedOrder } from '../schedule/types'

// ─── 夹具 ───

/** 固定"今天"：所有 planDragRange 用例一律注入，跨零点/跨时区都不许飘 */
const TODAY = '2026-09-20'

function sched(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 1, key: 'cloud-1', who: '桃桃', what: 'OC立绘', status: 'wip',
    zone: 'formal', startDate: '2026-10-05', deadline: '2026-10-12',
    createdAt: '2026-09-01T10:00:00', done: false, version: 3, ...p
  }
}

/** 相对**本机**今天的 YYYY-MM-DD：只用于「函数自己读今天」的用例（remainingDays / 不注入 today 的默认分支） */
function iso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** planDragRange 入参简写：以 TODAY 为注入的今天 */
function drag(p: Partial<DragRangeInput> & Pick<DragRangeInput, 'edge' | 'deltaDays'>): DragRangeInput {
  return { startDate: '2026-10-05', deadline: '2026-10-12', today: TODAY, ...p }
}

afterEach(() => {
  vi.useRealTimers()
})

// ─── 像素→天 ───

describe('pxToDays（像素位移 → 整天数，日级接口不支持半天）', () => {
  it('整除：窗口 20 天 / track 240px → 12px/天，拖 120px = +10 天', () => {
    expect(pxToDays(120, 240, 20)).toBe(10)
  })
  it('反向拖动给负数：-36px = -3 天', () => {
    expect(pxToDays(-36, 240, 20)).toBe(-3)
  })
  it('不足一天四舍五入到整天（119px/12px ≈ 9.92 → 10；18px/12px = 1.5 → 2）', () => {
    expect(pxToDays(119, 240, 20)).toBe(10)
    expect(pxToDays(18, 240, 20)).toBe(2)
    expect(pxToDays(5, 240, 20)).toBe(0) // 半格以内的抖动不算拖动
  })
  it('几何非法（宽/窗口 ≤0、NaN、Infinity）一律返 0：宁可不动，也不许把拖拽算成乱跳', () => {
    expect(pxToDays(120, 0, 20)).toBe(0)
    expect(pxToDays(120, -240, 20)).toBe(0)
    expect(pxToDays(120, 240, 0)).toBe(0)
    expect(pxToDays(120, 240, -20)).toBe(0)
    expect(pxToDays(Number.NaN, 240, 20)).toBe(0)
    expect(pxToDays(120, Number.POSITIVE_INFINITY, 20)).toBe(0)
    expect(pxToDays(Number.POSITIVE_INFINITY, 240, 20)).toBe(0)
  })
})

// ─── 日期加减 ───

describe('shiftDate（日期串加减 N 天；非法返 null 交调用方决定"不动"）', () => {
  it('同月加减与 0 天不动', () => {
    expect(shiftDate('2026-09-20', 0)).toBe('2026-09-20')
    expect(shiftDate('2026-09-20', 3)).toBe('2026-09-23')
    expect(shiftDate('2026-09-20', -3)).toBe('2026-09-17')
  })
  it('跨月、跨月末、跨年都按本地日历走（不产 2 月 31 号这类假日期）', () => {
    expect(shiftDate('2026-08-30', 3)).toBe('2026-09-02')
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-30', 3)).toBe('2027-01-02')
    expect(shiftDate('2027-01-02', -3)).toBe('2026-12-30')
  })
  it('闰年 2/29 口径', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDate('2028-02-29', 1)).toBe('2028-03-01')
  })
  it('零补齐两位（月/日个位数补 0，直接可当 key 用）', () => {
    expect(shiftDate('2026-01-05', 5)).toBe('2026-01-10')
    expect(shiftDate('2026-11-28', 5)).toBe('2026-12-03')
  })
  it('入参非法（空串/null/undefined/非日期串/天数非有限）一律 null', () => {
    expect(shiftDate('', 1)).toBeNull()
    expect(shiftDate(null, 1)).toBeNull()
    expect(shiftDate(undefined, 1)).toBeNull()
    expect(shiftDate('不是日期', 1)).toBeNull()
    expect(shiftDate('2026-09-20', Number.NaN)).toBeNull()
    expect(shiftDate('2026-09-20', Number.POSITIVE_INFINITY)).toBeNull()
  })
  it('往返一致：+N 再 -N 回到原日（拖完撤销不得漂一天）', () => {
    expect(shiftDate(shiftDate('2026-09-20', 7), -7)).toBe('2026-09-20')
    expect(shiftDate(shiftDate('2026-09-20', -11), 11)).toBe('2026-09-20')
  })
})

// ─── 拖后区间 + 两条硬钳制（口径 4） ───

describe('planDragRange · edge = move（整条平移）', () => {
  it('未来区间平移 +3 天：两端同移、长度不变、不钳制', () => {
    expect(planDragRange(drag({ edge: 'move', deltaDays: 3 }))).toEqual({
      startDate: '2026-10-08', deadline: '2026-10-15', changed: ['startDate', 'deadline'], clampedDays: 0
    })
  })
  it('撞线今天：开工日正好停在今天算"没钳"（clampedDays 记 0，不骗人说被挡）', () => {
    expect(planDragRange(drag({
      edge: 'move', deltaDays: -5, startDate: '2026-09-25', deadline: '2026-09-30'
    }))).toEqual({
      startDate: '2026-09-20', deadline: '2026-09-25', changed: ['startDate', 'deadline'], clampedDays: 0
    })
  })
  it('钳制①：拖进过去 → 开工日钉在今天，整条再往后推同样天数（区间长度不变）', () => {
    const plan = planDragRange(drag({
      edge: 'move', deltaDays: -10, startDate: '2026-09-22', deadline: '2026-09-29'
    }))
    expect(plan).toEqual({
      startDate: '2026-09-20', deadline: '2026-09-27', changed: ['startDate', 'deadline'], clampedDays: 8
    })
    // 长度守恒：拖前 7 天、拖后仍 7 天
    expect(shiftDate(plan.startDate, 7)).toBe(plan.deadline)
  })
  it('钳制①跨月也正确：整条被推回过去 30 天，仍钉今天且长度守恒', () => {
    expect(planDragRange(drag({
      edge: 'move', deltaDays: -30, startDate: '2026-09-21', deadline: '2026-09-22'
    }))).toEqual({
      startDate: '2026-09-20', deadline: '2026-09-21', changed: ['startDate', 'deadline'], clampedDays: 29
    })
  })
})

describe('planDragRange · edge = start（只改开工日）', () => {
  it('往后拖：只动 startDate，截稿日与 clampedDays 不受牵连', () => {
    expect(planDragRange(drag({ edge: 'start', deltaDays: 2 }))).toEqual({
      startDate: '2026-10-07', deadline: '2026-10-12', changed: ['startDate'], clampedDays: 0
    })
  })
  it('钳制①：开工日不得早于今天 → 停在今天并如实回报被挡掉的 5 天', () => {
    expect(planDragRange(drag({
      edge: 'start', deltaDays: -10, startDate: '2026-09-25', deadline: '2026-10-10'
    }))).toEqual({
      startDate: '2026-09-20', deadline: '2026-10-10', changed: ['startDate'], clampedDays: 5
    })
  })
  it('钳到毫无变化 → changed 空数组（调用方据此**不发请求**，不发假请求）', () => {
    const plan = planDragRange(drag({
      edge: 'start', deltaDays: -3, startDate: TODAY, deadline: '2026-09-27'
    }))
    expect(plan.changed).toEqual([])
    expect(plan.startDate).toBe(TODAY)
    expect(plan.clampedDays).toBe(3) // 被挡过仍要如实报，UI 据此说"已到最早"
  })
  it('钳制②：开工日不得越过截稿日 → 停在截稿日（后端 deadline ≥ startDate 同口径）', () => {
    expect(planDragRange(drag({
      edge: 'start', deltaDays: 10, startDate: '2026-10-01', deadline: '2026-10-03'
    }))).toEqual({
      startDate: '2026-10-03', deadline: '2026-10-03', changed: ['startDate'], clampedDays: 0
    })
  })
  it('delta = 0 → changed 空数组且 clampedDays 0（零位移零请求）', () => {
    expect(planDragRange(drag({ edge: 'start', deltaDays: 0 }))).toEqual({
      startDate: '2026-10-05', deadline: '2026-10-12', changed: [], clampedDays: 0
    })
  })
})

describe('planDragRange · edge = end（只改截稿日）', () => {
  it('往后拖：只动 deadline（10-12 + 4 = 10-16）', () => {
    expect(planDragRange(drag({ edge: 'end', deltaDays: 4 }))).toEqual({
      startDate: '2026-10-05', deadline: '2026-10-16', changed: ['deadline'], clampedDays: 0
    })
  })
  it('钳制②：截稿日不得退到开工日之前 → 停在开工日（两端同日合法）', () => {
    expect(planDragRange(drag({
      edge: 'end', deltaDays: -10, startDate: '2026-10-05', deadline: '2026-10-08'
    }))).toEqual({
      startDate: '2026-10-05', deadline: '2026-10-05', changed: ['deadline'], clampedDays: 0
    })
  })
  it('开工日已在过去时，截稿日只被开工日挡住（今天的下限不越过开工日）', () => {
    // 现状口径：clampedDays 只记「开工日不得拖进过去」这一条；end edge 被开工日挡住时仍报 0
    expect(planDragRange(drag({
      edge: 'end', deltaDays: -10, startDate: '2026-09-10', deadline: '2026-09-25'
    }))).toEqual({
      startDate: '2026-09-10', deadline: '2026-09-15', changed: ['deadline'], clampedDays: 0
    })
  })
  it('拖回原处 → changed 空数组', () => {
    expect(planDragRange(drag({ edge: 'end', deltaDays: 0 }))).toEqual({
      startDate: '2026-10-05', deadline: '2026-10-12', changed: [], clampedDays: 0
    })
  })
})

describe('planDragRange · 坏数据自卫（不猜、不动）', () => {
  it('日期串非法 → 原样退回，changed 空数组（宁可不发请求也不写半个日期）', () => {
    expect(planDragRange(drag({ edge: 'move', deltaDays: 5, startDate: 'not-a-date' }))).toEqual({
      startDate: 'not-a-date', deadline: '2026-10-12', changed: [], clampedDays: 0
    })
    expect(planDragRange(drag({ edge: 'end', deltaDays: 5, deadline: '' }))).toEqual({
      startDate: '2026-10-05', deadline: '', changed: [], clampedDays: 0
    })
  })
  it('不注入 today 时按**本机今天**钳制（用相对日期表达，故本组唯一一处不写死日期串）', () => {
    const p = planDragRange({ startDate: iso(2), deadline: iso(9), edge: 'start', deltaDays: -5 })
    expect(p.startDate).toBe(iso(0))
    expect(p.clampedDays).toBe(3)
    expect(p.changed).toEqual(['startDate'])
  })
  it('三条 edge 共用同一份钳制：move 与 start 对"今天"的落点一致', () => {
    const byStart = planDragRange(drag({
      edge: 'start', deltaDays: -20, startDate: '2026-09-25', deadline: '2026-10-10'
    }))
    const byMove = planDragRange(drag({
      edge: 'move', deltaDays: -20, startDate: '2026-09-25', deadline: '2026-10-10'
    }))
    expect(byStart.startDate).toBe(TODAY)
    expect(byMove.startDate).toBe(TODAY)
    expect(byMove.clampedDays).toBe(byStart.clampedDays)
  })
})

// ─── 两步写顺序（口径 1） ───

describe('planWrites（两端都变时的写序，钉死顺序＝后端交叉校验不被 400 拒）', () => {
  it('两端都变 + 截稿日**后移** → 先 deadline 再 startDate', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-08', deadline: '2026-10-20' }
    )).toEqual([
      { field: 'deadline', value: '2026-10-20' },
      { field: 'startDate', value: '2026-10-08' }
    ])
  })
  it('两端都变 + 截稿日**前移** → 先 startDate 再 deadline（对称分支）', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-09-28', deadline: '2026-10-02' }
    )).toEqual([
      { field: 'startDate', value: '2026-09-28' },
      { field: 'deadline', value: '2026-10-02' }
    ])
  })
  it('整条平移最常见的两种现实形状各走一支（+3 天后移 / -3 天前移）', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-08', deadline: '2026-10-15' }
    ).map(s => s.field)).toEqual(['deadline', 'startDate'])
    expect(planWrites(
      { startDate: '2026-11-05', deadline: '2026-11-12' },
      { startDate: '2026-11-02', deadline: '2026-11-09' }
    ).map(s => s.field)).toEqual(['startDate', 'deadline'])
  })
  it('只变一端 → 单步（且步里的值就是新值）', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-06', deadline: '2026-10-12' }
    )).toEqual([{ field: 'startDate', value: '2026-10-06' }])
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-05', deadline: '2026-10-09' }
    )).toEqual([{ field: 'deadline', value: '2026-10-09' }])
  })
  it('完全没变 → 空数组（调用方零请求）', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-05', deadline: '2026-10-12' }
    )).toEqual([])
  })
  it('两端变到同一天（贴边合法）仍走后移支：先 deadline', () => {
    expect(planWrites(
      { startDate: '2026-10-05', deadline: '2026-10-12' },
      { startDate: '2026-10-12', deadline: '2026-10-14' }
    ).map(s => s.field)).toEqual(['deadline', 'startDate'])
  })
})

// ─── 拖排序列 ───

describe('reorderIds（列表拖排后的 id 序列）', () => {
  it('往下拖与往上拖都按「摘出来再插进去」算', () => {
    expect(reorderIds([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(reorderIds([1, 2, 3], 2, 0)).toEqual([3, 1, 2])
    expect(reorderIds(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'd', 'b'])
  })
  it('原地不动：oldIndex === newIndex 序列不变', () => {
    expect(reorderIds([1, 2, 3], 1, 1)).toEqual([1, 2, 3])
  })
  it('目标越界一律夹到边界（drop 落在末尾/开头时索引常越界）', () => {
    expect(reorderIds([1, 2, 3], 0, 99)).toEqual([2, 3, 1])
    expect(reorderIds([1, 2, 3], 0, -5)).toEqual([1, 2, 3])
    expect(reorderIds([1, 2, 3], 2, 99)).toEqual([1, 2, 3])
  })
  it('源越界 / 非整数索引 → 返**原序列副本**（不是同一引用，且不改原数组）', () => {
    const ids = [1, 2, 3]
    const bySource = reorderIds(ids, 5, 0)
    expect(bySource).toEqual([1, 2, 3])
    expect(bySource).not.toBe(ids)
    const byNegative = reorderIds(ids, -1, 1)
    expect(byNegative).toEqual([1, 2, 3])
    expect(reorderIds(ids, Number.NaN, 1)).toEqual([1, 2, 3])
    expect(reorderIds(ids, 0.5, 1)).toEqual([1, 2, 3])
    expect(ids).toEqual([1, 2, 3]) // 原数组零副作用
  })
  it('空数组 / 单行不炸（一行没什么可拖）', () => {
    expect(reorderIds<number[]>([], 0, 0)).toEqual([])
    expect(reorderIds([7], 0, 0)).toEqual([7])
  })
})

// ─── 可拖性守卫 ───

describe('canDragBar（时间条横条可否拖）', () => {
  it('云端行 + 非终态 + 两端日期齐 → 可拖', () => {
    expect(canDragBar(sched())).toBe(true)
    expect(canDragBar(sched({ status: 'pending' }))).toBe(true)
    expect(canDragBar(sched({ status: 'revision' }))).toBe(true)
  })
  it('本地记账行（无 version）不可拖——无乐观锁起步值即无写路径（拍板②诚实缺席）', () => {
    expect(canDragBar(sched({ version: undefined }))).toBe(false)
  })
  it('终态一律不可拖：done / delivered / cancelled 逐条', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(canDragBar(sched({ status, done: true }))).toBe(false)
    }
  })
  it('缺开工日或缺截稿日的单不进时间条，也就拖不动', () => {
    expect(canDragBar(sched({ startDate: null }))).toBe(false)
    expect(canDragBar(sched({ deadline: null }))).toBe(false)
    expect(canDragBar(sched({ startDate: '', deadline: '' }))).toBe(false)
  })
})

describe('canReorderRow（列表行可否拖排）', () => {
  it('只有「云端 + 正式区」可拖排', () => {
    expect(canReorderRow(sched({ zone: 'formal' }))).toBe(true)
  })
  it('缓冲区不参与 reorder（后端按整段正式区落位）', () => {
    expect(canReorderRow(sched({ zone: 'buffer' }))).toBe(false)
  })
  it('本地记账行（无 version）不参与 reorder', () => {
    expect(canReorderRow(sched({ zone: 'formal', version: undefined }))).toBe(false)
  })
  it('终态单照旧可拖排：拖排改的是队列序不是日期，后端活跃集含 done（本端口径不得更严）', () => {
    expect(canReorderRow(sched({ zone: 'formal', status: 'done' }))).toBe(true)
  })
})

describe('TERMINAL_STATUSES（时间条过滤与拖拽守卫共用的一份常量）', () => {
  it('名单钉死：done / delivered / cancelled，不多不少不加态', () => {
    expect(TERMINAL_STATUSES).toEqual(['done', 'delivered', 'cancelled'])
  })
  it('可拖与可拖排是两回事：同一行能拖排不代表能拖条（防口径分裂）', () => {
    const barOnlyMissing = sched({ deadline: null, zone: 'formal' })
    expect(canDragBar(barOnlyMissing)).toBe(false)
    expect(canReorderRow(barOnlyMissing)).toBe(true)
  })
})

// ─── 剩余天数（UI 提示用） ───

describe('remainingDays', () => {
  it('无截稿日 / 非法串 → null（不给"还能往后退 N 天"编数）', () => {
    expect(remainingDays(null)).toBeNull()
    expect(remainingDays('')).toBeNull()
    expect(remainingDays('不是日期')).toBeNull()
  })
  it('按本机今天算：今天 0、未来正、过去负（口径与 band.daysLeft 同源一份实现）', () => {
    expect(remainingDays(iso(0))).toBe(0)
    expect(remainingDays(iso(6))).toBe(6)
    expect(remainingDays(iso(-4))).toBe(-4)
  })
})
