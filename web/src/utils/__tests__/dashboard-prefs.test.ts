// utils/dashboard-prefs 单测（自定义首页批一 v70）
// 覆盖：板块登记表 / 拖动换位 / 显隐切换 / 最大宽度钳制吸附 / 行数档位归一 /
//       prefs 快照独立性 / useDashboardPrefs 拉取·保存·失败回滚·恢复默认
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DashboardPrefs } from '../../api/types'

const h = vi.hoisted(() => ({
  getDashboardPrefs: vi.fn(),
  putDashboardPrefs: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    getDashboardPrefs: (...args: unknown[]) => h.getDashboardPrefs(...args),
    putDashboardPrefs: (...args: unknown[]) => h.putDashboardPrefs(...args)
  }
}))
vi.mock('element-plus', () => ({ ElMessage: { error: h.msgError } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import {
  DASHBOARD_MODULE_IDS,
  DASHBOARD_MODULE_METAS,
  DENSITY_MODULE_IDS,
  PAGE_MAX_MIN,
  PAGE_MAX_MAX,
  PAGE_MAX_STEP,
  PAGE_MAX_DEFAULT,
  getDashboardModuleMeta,
  reorderModules,
  toggleModuleHidden,
  clampPageMax,
  normalizeDensity,
  clonePrefs,
  useDashboardPrefs
} from '../dashboard-prefs'

/** 全默认 prefs 夹具（与服务端归一化输出口径一致） */
function fixture(over: Partial<DashboardPrefs> = {}): DashboardPrefs {
  return {
    v: 1,
    order: [...DASHBOARD_MODULE_IDS],
    hidden: [],
    width: {
      greet: 'full', stats: 'full', schedule: 'full',
      todo: 'half', guestbook: 'half', activity: 'half',
      announcement: 'half', onboarding: 'half', quick: 'half'
    },
    density: { todo: 0, guestbook: 0, activity: 0 },
    scheduleStyle: 'bars',
    greetStyle: 'plain',
    pageAlign: 'center',
    pageMax: PAGE_MAX_DEFAULT,
    ...over
  }
}

beforeEach(() => {
  h.getDashboardPrefs.mockReset()
  h.putDashboardPrefs.mockReset()
  h.msgError.mockReset()
})

describe('板块登记表（与服务端 CORE_MODULES 同口径）', () => {
  it('恰好 10 个基础板块且顺序与服务端一致', () => {
    expect([...DASHBOARD_MODULE_IDS]).toEqual([
      'greet', 'plaque', 'stats', 'schedule', 'todo', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick'
    ])
  })

  it('todo/guestbook/activity 支持显示行数，其余不支持；每项都有 i18n 名称键', () => {
    expect([...DENSITY_MODULE_IDS]).toEqual(['todo', 'guestbook', 'activity'])
    for (const meta of DASHBOARD_MODULE_METAS) {
      expect(meta.nameKey).toMatch(/^dashboardPrefs\.module/)
      expect(meta.hasDensity).toBe(DENSITY_MODULE_IDS.includes(meta.id))
    }
  })

  it('getDashboardModuleMeta：已知 id 返回元信息，未知 id 返回 undefined', () => {
    expect(getDashboardModuleMeta('greet')?.nameKey).toBe('dashboardPrefs.moduleGreet')
    expect(getDashboardModuleMeta('incomeChart')).toBeUndefined()
  })
})

describe('reorderModules 拖动换位', () => {
  const order = [...DASHBOARD_MODULE_IDS]

  it('插到目标之前（拖到最前）', () => {
    const next = reorderModules(order, 'todo', 'greet', true)
    expect(next[0]).toBe('todo')
    expect(next).toHaveLength(order.length)
    expect(new Set(next)).toEqual(new Set(order))
  })

  it('插到目标之后（拖到最后）', () => {
    const next = reorderModules(order, 'greet', 'quick', false)
    expect(next[next.length - 1]).toBe('greet')
    expect(new Set(next)).toEqual(new Set(order))
  })

  it('相邻换位：stats 挪到 schedule 之后', () => {
    const next = reorderModules(order, 'stats', 'schedule', false)
    expect(next.slice(0, 4)).toEqual(['greet', 'plaque', 'schedule', 'stats'])
  })

  it('同 id / 未知 id 一律原序副本，输入数组永不改写', () => {
    const same = reorderModules(order, 'greet', 'greet', true)
    expect(same).toEqual(order)
    expect(same).not.toBe(order)
    const unknown = reorderModules(order, 'nope', 'greet', true)
    expect(unknown).toEqual(order)
    expect(order).toEqual([...DASHBOARD_MODULE_IDS])
  })
})

describe('toggleModuleHidden 显隐切换', () => {
  it('无则追加、有则移除，且不改原数组', () => {
    const hidden = ['todo']
    const added = toggleModuleHidden(hidden, 'greet')
    expect(added).toEqual(['todo', 'greet'])
    const removed = toggleModuleHidden(hidden, 'todo')
    expect(removed).toEqual([])
    expect(hidden).toEqual(['todo'])
  })
})

describe('clampPageMax 最大宽度钳制 + 吸附', () => {
  it('范围常量 1000~1680 step 20，默认 1200', () => {
    expect(PAGE_MAX_MIN).toBe(1000)
    expect(PAGE_MAX_MAX).toBe(1680)
    expect(PAGE_MAX_STEP).toBe(20)
    expect(PAGE_MAX_DEFAULT).toBe(1200)
  })

  it('越界钳到两端', () => {
    expect(clampPageMax(999)).toBe(1000)
    expect(clampPageMax(0)).toBe(1000)
    expect(clampPageMax(1681)).toBe(1680)
    expect(clampPageMax(99999)).toBe(1680)
  })

  it('档内值吸附到最近的 20px 档', () => {
    expect(clampPageMax(1200)).toBe(1200)
    expect(clampPageMax(1205)).toBe(1200)
    expect(clampPageMax(1215)).toBe(1220)
  })

  it('非有限数落默认 1200', () => {
    expect(clampPageMax(Number.NaN)).toBe(1200)
    expect(clampPageMax(Number.POSITIVE_INFINITY)).toBe(1200)
  })
})

describe('normalizeDensity 行数档位归一', () => {
  it('只认 3/5，其余一律 0（全部）', () => {
    expect(normalizeDensity(3)).toBe(3)
    expect(normalizeDensity(5)).toBe(5)
    expect(normalizeDensity(0)).toBe(0)
    expect(normalizeDensity(7)).toBe(0)
    expect(normalizeDensity(undefined)).toBe(0)
    expect(normalizeDensity('3')).toBe(0)
  })
})

describe('clonePrefs 快照独立性', () => {
  it('order/hidden/width/density 各自独立副本，标量字段保留', () => {
    const src = fixture({ hidden: ['stats'], pageMax: 1400, pageAlign: 'left' })
    const copy = clonePrefs(src)
    expect(copy).toEqual(src)

    copy.order.reverse()
    copy.hidden.push('todo')
    copy.width.todo = 'full'
    copy.density.todo = 5
    expect(src.order).toEqual([...DASHBOARD_MODULE_IDS])
    expect(src.hidden).toEqual(['stats'])
    expect(src.width.todo).toBe('half')
    expect(src.density.todo).toBe(0)
    expect(copy.pageMax).toBe(1400)
    expect(copy.pageAlign).toBe('left')
  })
})

describe('useDashboardPrefs 拉取 / 保存 / 回滚 / 恢复默认', () => {
  it('load 成功写入 prefs，清 loadFailed', async () => {
    const server = fixture({ pageMax: 1300 })
    h.getDashboardPrefs.mockResolvedValueOnce(server)
    const ctrl = useDashboardPrefs()
    await ctrl.load()
    expect(ctrl.prefs.value).toEqual(server)
    expect(ctrl.loadFailed.value).toBe(false)
    expect(ctrl.loading.value).toBe(false)
  })

  it('load 失败置 loadFailed 并保留旧值供重试', async () => {
    const ctrl = useDashboardPrefs()
    ctrl.prefs.value = fixture()
    h.getDashboardPrefs.mockRejectedValueOnce(new Error('network'))
    await ctrl.load()
    expect(ctrl.loadFailed.value).toBe(true)
    expect(ctrl.prefs.value).not.toBeNull()
  })

  it('mutate 成功：PUT 全量对象，服务端返回成为新事实源', async () => {
    const ctrl = useDashboardPrefs()
    ctrl.prefs.value = fixture()
    const serverEcho = fixture({ hidden: ['quick'] })
    h.putDashboardPrefs.mockResolvedValueOnce(serverEcho)

    const ok = await ctrl.mutate(d => { d.hidden = toggleModuleHidden(d.hidden, 'quick') })
    expect(ok).toBe(true)
    expect(h.putDashboardPrefs).toHaveBeenCalledTimes(1)
    // PUT 载荷 = 改动后的完整对象
    expect(h.putDashboardPrefs.mock.calls[0][0]).toEqual(fixture({ hidden: ['quick'] }))
    expect(ctrl.prefs.value).toEqual(serverEcho)
    expect(h.msgError).not.toHaveBeenCalled()
  })

  it('mutate 失败：回滚本地快照 + ElMessage 报错', async () => {
    const ctrl = useDashboardPrefs()
    const before = fixture({ pageMax: 1240 })
    ctrl.prefs.value = before
    h.putDashboardPrefs.mockRejectedValueOnce(new Error('boom'))

    const ok = await ctrl.mutate(d => { d.pageMax = 1600 })
    expect(ok).toBe(false)
    expect(ctrl.prefs.value?.pageMax).toBe(1240)
    expect(h.msgError).toHaveBeenCalledWith('dashboardPrefs.saveFailed')
  })

  it('prefs 未加载时 mutate 不发请求直接失败', async () => {
    const ctrl = useDashboardPrefs()
    const ok = await ctrl.mutate(d => { d.pageMax = 1600 })
    expect(ok).toBe(false)
    expect(h.putDashboardPrefs).not.toHaveBeenCalled()
  })

  it('resetDefaults：PUT 空对象后重新拉取', async () => {
    const ctrl = useDashboardPrefs()
    ctrl.prefs.value = fixture({ hidden: ['todo'], pageAlign: 'full' })
    h.putDashboardPrefs.mockResolvedValueOnce(fixture())
    h.getDashboardPrefs.mockResolvedValueOnce(fixture())

    const ok = await ctrl.resetDefaults()
    expect(ok).toBe(true)
    expect(h.putDashboardPrefs).toHaveBeenCalledWith({})
    expect(h.getDashboardPrefs).toHaveBeenCalledTimes(1)
    expect(ctrl.prefs.value).toEqual(fixture())
  })

  it('resetDefaults 失败：报错且不覆盖本地状态', async () => {
    const ctrl = useDashboardPrefs()
    const before = fixture({ pageMax: 1500 })
    ctrl.prefs.value = before
    h.putDashboardPrefs.mockRejectedValueOnce(new Error('boom'))

    const ok = await ctrl.resetDefaults()
    expect(ok).toBe(false)
    expect(h.msgError).toHaveBeenCalledWith('dashboardPrefs.saveFailed')
    expect(ctrl.prefs.value?.pageMax).toBe(1500)
  })
})
