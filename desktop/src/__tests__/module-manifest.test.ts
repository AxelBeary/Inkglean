// 档②波17 测试：manifest 解析与校验（规范 v0.3 §四加载强制点的口径哨兵）。
import { describe, it, expect } from 'vitest'
import {
  parseManifest, semverCompare,
  VIOLATION_LIMIT, VIOLATION_WINDOW_MS, MODULE_STORAGE_QUOTA_BYTES,
  HEARTBEAT_INTERVAL_MS, HEARTBEAT_MISS_LIMIT, LOAD_TIMEOUT_MS,
  HOST_VERSION, SUPPORTED_SPECS
} from '../modules/manifest'

/** 合法基准 manifest（规范 §二 示例形状） */
const VALID = JSON.stringify({
  spec: '1.0', api: 'panel@1', minHost: '0.1.0',
  id: 'mood-weather', name: '稿情气象台', description: '把今日排期画成天气',
  version: '0.1.0', entry: 'panel.js',
  ui: { zone: 'aside', heightRule: 'stretch', hideable: true, tearable: true, focusPolicy: 'fold' },
  data: { views: ['orders', 'stats'], write: { own: true, shared: 'none', reason: '' } },
  network: { scope: 'none', hosts: [], reason: '' }
})

describe('拍板数字常量哨兵（改动须同步拍板记录）', () => {
  it('10次·24h·5MB·5s×3 + 加载超时 5s', () => {
    expect(VIOLATION_LIMIT).toBe(10)
    expect(VIOLATION_WINDOW_MS).toBe(86400000)
    expect(MODULE_STORAGE_QUOTA_BYTES).toBe(5 * 1024 * 1024)
    expect(HEARTBEAT_INTERVAL_MS).toBe(5000)
    expect(HEARTBEAT_MISS_LIMIT).toBe(3)
    expect(LOAD_TIMEOUT_MS).toBe(5000)
  })
})

describe('semverCompare', () => {
  it('常规比较', () => {
    expect(semverCompare('0.1.0', '0.1.0')).toBe(0)
    expect(semverCompare('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(semverCompare('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(semverCompare('1.0', '1.0.0')).toBe(0)
  })

  it('非法版本按 0.0.0', () => {
    expect(semverCompare('', '0.0.1')).toBeLessThan(0)
    expect(semverCompare('abc', '0.0.0')).toBe(0)
  })
})

describe('parseManifest（加载强制点）', () => {
  it('合法包过校验；tearable 壳压 false；source 壳判 external', () => {
    const r = parseManifest(VALID)
    expect(r.ok).toBe(true)
    expect(r.manifest?.id).toBe('mood-weather')
    expect(r.manifest?.ui.tearable).toBe(false) // 模块自报 true 被壳压掉
    expect(r.manifest?.source).toBe('external')
  })

  it('未知视图剔除并记原因，已知视图保留', () => {
    const r = parseManifest(VALID)
    expect(r.manifest?.data.views).toEqual(['orders']) // stats 未知被剔
    expect(r.reasons.some(x => x.includes('stats'))).toBe(true)
  })

  it('容忍 BOM', () => {
    expect(parseManifest('\uFEFF' + VALID).ok).toBe(true)
  })

  it('非标准 JSON / 非对象 / 缺必填 → 拒载给原因', () => {
    expect(parseManifest('not-json').ok).toBe(false)
    expect(parseManifest('[1,2]').ok).toBe(false)
    const r = parseManifest(JSON.stringify({ spec: '1.0' }))
    expect(r.ok).toBe(false)
    expect(r.reasons[0]).toContain('缺少必填字段')
  })

  it('spec 区间外 / api 非法 / entry 非 panel.js → 拒载', () => {
    const withSpec = (spec: string) => parseManifest(VALID.replace('"spec":"1.0"', `"spec":"${spec}"`))
    expect(withSpec('2.0').ok).toBe(false)
    const withApi = VALID.replace('"api":"panel@1"', '"api":"grid@9"')
    expect(parseManifest(withApi).ok).toBe(false)
    const withEntry = VALID.replace('"entry":"panel.js"', '"entry":"main.js"')
    expect(parseManifest(withEntry).ok).toBe(false)
  })

  it('minHost 高于宿主 → 拒载（单独失效触发点）', () => {
    const r = parseManifest(VALID.replace('"minHost":"0.1.0"', '"minHost":"9.9.9"'))
    expect(r.ok).toBe(false)
    expect(r.reasons[0]).toContain('低于模块要求')
  })

  it('留门字段归一：write.shared rw→none；resident 认字段不拒载', () => {
    const rw = parseManifest(VALID.replace('"shared":"none"', '"shared":"rw"'))
    expect(rw.manifest?.data.write.shared).toBe('none')
    // 尾括号前插入 runtime（VALID 整体以 } 结尾）
    const resident = parseManifest(VALID.slice(0, -1) + ',"runtime":{"lifecycle":"resident","wakeInterval":"15m"}}')
    expect(resident.ok).toBe(true)
    expect(resident.manifest?.runtime.lifecycle).toBe('resident')
    expect(resident.manifest?.runtime.wakeInterval).toBe('15m')
  })

  it('长字符串限长（不可信输入纪律）', () => {
    const longName = '名'.repeat(200)
    const r = parseManifest(VALID.replace('稿情气象台', longName))
    expect(r.manifest?.name.length).toBeLessThanOrEqual(40)
  })

  it('宿主版本区间常量口径', () => {
    expect(SUPPORTED_SPECS).toContain('1.0')
    expect(semverCompare(HOST_VERSION, '0.1.0')).toBe(0)
  })
})
