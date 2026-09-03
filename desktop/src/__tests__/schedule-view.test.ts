// 排期页三视图口径哨兵（9/4 主页重设计落码波1 · 路A）。
// 覆盖：① timeline.ts 三纯函数（窗口裁切/窗口外不出现/逾期单不消失/今天线百分比夹边界/仅进行中过滤/未排期不计入）
// ② ScheduleList 真挂载（分区/只读无拖柄）③ 状态文案与色调（与 statusLabel.ts 同源 import）。
import { describe, it, expect } from 'vitest'
import { createApp, nextTick } from 'vue'
import {
  buildTimelineRows,
  buildTimelineAxis,
  todayPct,
  countUnscheduled,
  timelineWindow
} from '../components/schedule/timeline'
import ScheduleList from '../components/schedule/ScheduleList.vue'
import {
  KNOWN_STATUSES, STATUS_LABEL, STATUS_TONE, statusLabel, statusTone
} from '../components/schedule/statusLabel'
import { bandTone, todayStart } from '../schedule/band'
import type { SchedOrder } from '../schedule/types'

// ─── 构造器 ───

/** 相对今天的 YYYY-MM-DD（负数=过去） */
function iso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sched(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 1, key: 'cloud-1', who: '桃桃', what: 'OC立绘', status: 'wip',
    zone: 'formal', startDate: null, deadline: null, createdAt: null, done: false, ...p
  }
}

// ─── timeline.ts: buildTimelineRows ───

describe('buildTimelineRows（时间条行数据）', () => {
  const today = todayStart()
  const w14 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)

  it('正常区间单出现在时间条内', () => {
    const orders = [sched({ startDate: iso(1), deadline: iso(5) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('cloud-1')
    expect(rows[0].leftPct).toBeGreaterThan(0)
    expect(rows[0].widthPct).toBeGreaterThan(0)
  })

  it('缺 startDate 且缺 createdAt → 不进时间条', () => {
    const orders = [sched({ startDate: null, createdAt: null, deadline: iso(5) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(0)
  })

  it('缺 deadline → 不进时间条', () => {
    const orders = [sched({ startDate: iso(1), deadline: null })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(0)
  })

  it('createdAt 作回退（startDate 缺但 createdAt 有）', () => {
    const orders = [sched({ startDate: null, createdAt: iso(2), deadline: iso(8) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(1)
  })

  it('逾期未完成、整段落在窗口左外 → 仍出现（画在最左、按原计划长度、标逾期）', () => {
    // 9/4 收口追：定稿原型把逾期单画在时间条最左（朱砂条标逾期）——它还压在画师手上，
    // 不能因为计划区间过期就从「未来 30 天」里消失（那是用遗漏说假话）
    const orders = [sched({ startDate: iso(-20), deadline: iso(-10) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(1)
    expect(rows[0].leftPct).toBe(0)
    expect(rows[0].tone).toBe('over')
    expect(rows[0].label).toContain('逾期')
    expect(rows[0].widthPct).toBeGreaterThan(0)
  })

  it('已完成且整段在过去 → 不出现（不占未来时间）', () => {
    const orders = [sched({ startDate: iso(-20), deadline: iso(-10), status: 'delivered', done: true })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(0)
  })

  it('完全在窗口外（未来）→ 不出现', () => {
    const orders = [sched({ startDate: iso(20), deadline: iso(30) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(0)
  })

  it('越界裁到窗口（开始在过去，截稿在窗口内）', () => {
    const orders = [sched({ startDate: iso(-5), deadline: iso(3) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(1)
    expect(rows[0].leftPct).toBe(0) // 裁到窗口左边界
  })

  it('越界裁到窗口（开始在窗口内，截稿超出窗口）', () => {
    const orders = [sched({ startDate: iso(10), deadline: iso(20) })]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(1)
    // 右边界被裁，宽度不超过窗口剩余
    expect(rows[0].leftPct + rows[0].widthPct).toBeLessThanOrEqual(100.01)
  })

  it('onlyActive=true 过滤已完成单', () => {
    const orders = [
      sched({ key: 'a', startDate: iso(1), deadline: iso(5), done: true, status: 'delivered' }),
      sched({ key: 'b', id: 2, startDate: iso(2), deadline: iso(6), done: false })
    ]
    const rows = buildTimelineRows(orders, today, w14, { onlyActive: true })
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('b')
  })

  it('onlyActive=false/undefined 不过滤已完成单', () => {
    const orders = [
      sched({ key: 'a', startDate: iso(1), deadline: iso(5), done: true, status: 'delivered' }),
      sched({ key: 'b', id: 2, startDate: iso(2), deadline: iso(6), done: false })
    ]
    const rows = buildTimelineRows(orders, today, w14)
    expect(rows).toHaveLength(2)
  })

  it('tone 与 bandTone 一致', () => {
    // startDate 在过去（裁到左边界），deadline 在窗口内 → 确定出现在时间条
    const o = sched({ startDate: iso(-10), deadline: iso(3), done: false })
    const rows = buildTimelineRows([o], today, w14)
    expect(rows).toHaveLength(1)
    expect(rows[0].tone).toBe(bandTone(o))
  })
})

// ─── timeline.ts: buildTimelineAxis ───

describe('buildTimelineAxis（时间轴刻度）', () => {
  it('2周 → 4 个刻度', () => {
    const w = timelineWindow('2w')
    const ticks = buildTimelineAxis(w.start, w.end, '2w')
    expect(ticks).toHaveLength(4)
    expect(ticks[0].pct).toBe(0)
    expect(ticks[3].pct).toBe(100)
  })

  it('1月 → 5 个刻度', () => {
    const w = timelineWindow('1m')
    const ticks = buildTimelineAxis(w.start, w.end, '1m')
    expect(ticks).toHaveLength(5)
  })

  it('3月 → 6 个刻度', () => {
    const w = timelineWindow('3m')
    const ticks = buildTimelineAxis(w.start, w.end, '3m')
    expect(ticks).toHaveLength(6)
  })

  it('刻度标签格式为 M/D', () => {
    const w = timelineWindow('1m')
    const ticks = buildTimelineAxis(w.start, w.end, '1m')
    for (const t of ticks) {
      expect(t.label).toMatch(/^\d{1,2}\/\d{1,2}$/)
    }
  })

  it('刻度百分比递增', () => {
    const w = timelineWindow('3m')
    const ticks = buildTimelineAxis(w.start, w.end, '3m')
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].pct).toBeGreaterThan(ticks[i - 1].pct)
    }
  })
})

// ─── timeline.ts: todayPct ───

describe('todayPct（今天线百分比）', () => {
  it('今天=窗口起点 → 0%', () => {
    const today = todayStart()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
    expect(todayPct(today, end)).toBe(0)
  })

  it('今天在窗口中间 → 约 50%', () => {
    const today = todayStart()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 15)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15)
    const pct = todayPct(start, end)
    expect(pct).toBeGreaterThan(45)
    expect(pct).toBeLessThan(55)
  })

  it('今天在窗口之后（窗口全在过去）→ 夹到 100', () => {
    const today = todayStart()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 60)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
    expect(todayPct(start, end)).toBe(100)
  })

  it('窗口跨度为零 → 返回 0', () => {
    const today = todayStart()
    expect(todayPct(today, today)).toBe(0)
  })
})

// ─── timeline.ts: countUnscheduled ───

describe('countUnscheduled（未排期单计数）', () => {
  it('缺开工日且缺 createdAt → 计入未排期', () => {
    const orders = [sched({ startDate: null, createdAt: null, deadline: iso(5) })]
    expect(countUnscheduled(orders)).toBe(1)
  })

  it('缺 deadline → 计入未排期', () => {
    const orders = [sched({ startDate: iso(1), deadline: null })]
    expect(countUnscheduled(orders)).toBe(1)
  })

  it('两端都有 → 不计入', () => {
    const orders = [sched({ startDate: iso(1), deadline: iso(5) })]
    expect(countUnscheduled(orders)).toBe(0)
  })

  it('onlyActive=true 时已完成单不计入未排期', () => {
    const orders = [sched({ startDate: null, createdAt: null, deadline: null, done: true, status: 'delivered' })]
    expect(countUnscheduled(orders, true)).toBe(0)
  })

  it('onlyActive=false 时已完成单仍计入', () => {
    const orders = [sched({ startDate: null, createdAt: null, deadline: null, done: true, status: 'delivered' })]
    expect(countUnscheduled(orders, false)).toBe(1)
  })
})

// ─── timeline.ts: timelineWindow ───

describe('timelineWindow（缩放窗口天数）', () => {
  it('2w = 14 天', () => {
    const w = timelineWindow('2w')
    const diff = (w.end.getTime() - w.start.getTime()) / 86400000
    expect(diff).toBe(14)
  })

  it('1m = 30 天', () => {
    const w = timelineWindow('1m')
    const diff = (w.end.getTime() - w.start.getTime()) / 86400000
    expect(diff).toBe(30)
  })

  it('3m = 90 天', () => {
    const w = timelineWindow('3m')
    const diff = (w.end.getTime() - w.start.getTime()) / 86400000
    expect(diff).toBe(90)
  })
})

// ─── 列表分区与状态表（真挂载组件 + 与实现同源 import）───
// 9/4 收口追：原本这两组用例在测试文件里重抄了一份状态表、自己写 filter 算分区，
// 从不 import 被测件——被测件改词/漏态/改分区时测试照绿（哨兵自我循环）。

describe('ScheduleList（真挂载）', () => {
  async function mountList(orders: SchedOrder[], slotText = ''): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp(ScheduleList, { orders, slotText }).mount(host)
    await nextTick()
    return host
  }

  it('正式区与缓冲区各自成区，区头带笔数', async () => {
    const host = await mountList([
      sched({ key: 'f1', zone: 'formal' }),
      sched({ key: 'f2', id: 2, zone: 'formal' }),
      sched({ key: 'b1', id: 3, zone: 'buffer' })
    ])
    const zones = [...host.querySelectorAll('.list-zone .zh')].map(e => e.textContent?.replace(/\s+/g, ' ') ?? '')
    expect(zones).toHaveLength(2)
    expect(zones[0]).toContain('正式区')
    expect(zones[0]).toContain('2')
    expect(zones[1]).toContain('缓冲区')
    expect(host.querySelectorAll('.q-item')).toHaveLength(3)
    host.remove()
  })

  it('只有正式区时不渲染空的缓冲区（不留空壳）', async () => {
    const host = await mountList([sched({ key: 'f1', zone: 'formal' })])
    const zones = [...host.querySelectorAll('.list-zone .zh')].map(e => e.textContent ?? '')
    expect(zones).toHaveLength(1)
    expect(zones[0]).toContain('正式区')
    host.remove()
  })

  it('名额文案空串时不上区头（本地模式不留死文案）', async () => {
    const host = await mountList([sched({ key: 'f1' })], '')
    expect(host.querySelector('.list-zone .zh')?.textContent).not.toContain('名额')
    host.remove()
  })

  it('波1 只读哨兵：不渲染拖柄、不接拖拽（拖排改期属波2）', async () => {
    const host = await mountList([sched({ key: 'f1' })])
    expect(host.querySelectorAll('.grip')).toHaveLength(0)
    expect(host.innerHTML).not.toContain('draggable')
    host.remove()
  })
})

describe('状态文案与色调（与 statusLabel.ts 同源，不在测试里重抄）', () => {
  const CLOUD_STATUSES = ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled']
  const LOCAL_STATUSES = ['draft', 'in_progress', 'delivered', 'paid']

  it('云端七态 + 本地四态全部登记在册（将来加态漏登记即红）', () => {
    for (const s of [...CLOUD_STATUSES, ...LOCAL_STATUSES]) {
      expect(KNOWN_STATUSES).toContain(s)
      expect(STATUS_LABEL[s]).toBeTruthy()
      expect(STATUS_TONE[s]).toBeTruthy()
      expect(statusLabel(s)).toBe(STATUS_LABEL[s])
      expect(statusTone(s)).toBe(STATUS_TONE[s])
    }
  })

  it('关键文案逐条钉住（防静默改词）', () => {
    expect(statusLabel('pending')).toBe('待确认')
    expect(statusLabel('wip')).toBe('进行中')
    expect(statusLabel('revision')).toBe('修改中')
    expect(statusLabel('delivered')).toBe('已交付')
    expect(statusLabel('cancelled')).toBe('已取消')
    expect(statusLabel('draft')).toBe('草稿')
    expect(statusLabel('in_progress')).toBe('进行中')
    expect(statusLabel('paid')).toBe('已收款')
  })

  it('色调只走原型四档纸签色（hq/th/sl/buf），不自创新色', () => {
    for (const s of KNOWN_STATUSES) expect(['hq', 'th', 'sl', 'buf']).toContain(statusTone(s))
  })

  it('未知状态落原串不炸，色调落花青底', () => {
    expect(statusLabel('unknown_future_status')).toBe('unknown_future_status')
    expect(statusTone('unknown_future_status')).toBe('hq')
  })
})
