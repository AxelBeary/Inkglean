// 档②波17 二件测试：模块注册表纯逻辑（M2 目录名匹配/去重 + 违规窗口口径哨兵）。
import { describe, it, expect } from 'vitest'
import {
  buildRegistry, recordViolation, clearViolations, violationCount,
  type ScannedModule
} from '../modules/registry'
import { VIOLATION_LIMIT, VIOLATION_WINDOW_MS } from '../modules/manifest'

/** 合法 manifest 文本工厂（id 可注入） */
function manifest(id: string): string {
  return JSON.stringify({
    spec: '1.0', api: 'panel@1', minHost: '0.1.0',
    id, name: '模块', description: '', version: '0.1.0', entry: 'panel.js'
  })
}

function scan(dirName: string, id = dirName): ScannedModule {
  return { dirName, manifestText: manifest(id) }
}

describe('buildRegistry（加载强制点）', () => {
  it('合法模块注册为 ok', () => {
    const r = buildRegistry([scan('mood-weather')])
    expect(r).toHaveLength(1)
    expect(r[0].state).toBe('ok')
    expect(r[0].manifest?.id).toBe('mood-weather')
  })

  it('manifest 读失败 → invalid 带原因', () => {
    const r = buildRegistry([{ dirName: 'broken', manifestText: null, readError: '缺少 manifest.json' }])
    expect(r[0].state).toBe('invalid')
    expect(r[0].reasons[0]).toContain('缺少 manifest.json')
  })

  it('非法 manifest → invalid 带校验原因', () => {
    const r = buildRegistry([{ dirName: 'bad', manifestText: 'not-json' }])
    expect(r[0].state).toBe('invalid')
    expect(r[0].reasons.length).toBeGreaterThan(0)
  })

  it('目录名与 id 不一致 → invalid（审计 M2）', () => {
    const r = buildRegistry([scan('wrong-dir', 'real-id')])
    expect(r[0].state).toBe('invalid')
    expect(r[0].reasons.some(x => x.includes('目录名'))).toBe(true)
  })

  it('同 id 重复注册：后到者拒载（审计 M2，防御性：同名双条目）', () => {
    const r = buildRegistry([scan('a-mod'), scan('a-mod')])
    expect(r[0].state).toBe('ok')
    expect(r[1].state).toBe('invalid')
    expect(r[1].reasons.some(x => x.includes('同 id'))).toBe(true)
  })

  it('多模块混合：合法/非法各自分立，互不牵连', () => {
    const r = buildRegistry([scan('good'), { dirName: 'bad', manifestText: '{' }, scan('good2')])
    expect(r.map(x => x.state)).toEqual(['ok', 'invalid', 'ok'])
  })
})

describe('违规记账（拍板二：10 次/24h 滚动窗口）', () => {
  const T0 = 1_000_000_000

  it('连续记账累计，达阈返 tripped', () => {
    let ledger = {}
    let tripped = false
    let total = 0
    for (let i = 0; i < VIOLATION_LIMIT; i++) {
      const r = recordViolation(ledger, 'mod-x', T0 + i)
      ledger = r.ledger
      total = r.total
      tripped = r.tripped
    }
    expect(total).toBe(VIOLATION_LIMIT)
    expect(tripped).toBe(true)
  })

  it('窗口外自动重开新窗口（旧违规不作数）', () => {
    let ledger = {}
    for (let i = 0; i < VIOLATION_LIMIT - 1; i++) {
      ledger = recordViolation(ledger, 'mod-x', T0 + i).ledger
    }
    // 24h 后再犯一次：新窗口计数从 1 起
    const r = recordViolation(ledger, 'mod-x', T0 + VIOLATION_WINDOW_MS + 1)
    expect(r.total).toBe(1)
    expect(r.tripped).toBe(false)
  })

  it('手动启用清零（防死状态）', () => {
    let ledger = recordViolation({}, 'mod-x', T0).ledger
    ledger = recordViolation(ledger, 'mod-x', T0 + 1).ledger
    ledger = clearViolations(ledger, 'mod-x')
    expect(violationCount(ledger, 'mod-x', T0 + 2)).toBe(0)
  })

  it('窗口过期后计数按 0 读', () => {
    const ledger = recordViolation({}, 'mod-x', T0).ledger
    expect(violationCount(ledger, 'mod-x', T0 + 1)).toBe(1)
    expect(violationCount(ledger, 'mod-x', T0 + VIOLATION_WINDOW_MS + 1)).toBe(0)
  })

  it('各模块违规互不串账', () => {
    let ledger = recordViolation({}, 'mod-a', T0).ledger
    ledger = recordViolation(ledger, 'mod-b', T0).ledger
    ledger = recordViolation(ledger, 'mod-b', T0 + 1).ledger
    expect(violationCount(ledger, 'mod-a', T0 + 2)).toBe(1)
    expect(violationCount(ledger, 'mod-b', T0 + 2)).toBe(2)
  })
})
