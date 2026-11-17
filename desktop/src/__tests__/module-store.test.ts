// 档②波17 三件测试：模块 store 四态合成与偏好归一（口径哨兵）。
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { composeSource, composeState, useModulesStore } from '../modules/store'
import type { ModuleEntry } from '../modules/registry'

const T0 = 1_000_000_000

function entry(id: string, state: 'ok' | 'invalid' = 'ok'): ModuleEntry {
  return {
    dirName: id,
    manifest: state === 'ok'
      ? {
          spec: '1.0', api: 'panel@1', minHost: '0.1.0', id, name: '模块', description: '',
          version: '0.1.0', source: 'external', entry: 'panel.js',
          ui: { zone: 'aside', heightRule: 'fixed-rows', hideable: true, tearable: false, focusPolicy: 'fold', styles: [] },
          data: { views: [], write: { own: false, shared: 'none', reason: '' } },
          settings: [], network: { scope: 'none', hosts: [], reason: '' },
          linkage: { subscribes: [], emits: [] },
          runtime: { lifecycle: 'on-view', wakeInterval: null, idlePolicy: 'afk-aware' },
          diagnostics: false
        }
      : null,
    state,
    reasons: state === 'invalid' ? ['manifest 非法'] : []
  }
}

beforeEach(() => localStorage.clear())

describe('composeState（四态合成）', () => {
  it('正常模块 → ok', () => {
    expect(composeState(entry('a'), new Set(), {}, T0)).toBe('ok')
  })

  it('画师停用 → disabled', () => {
    expect(composeState(entry('a'), new Set(['a']), {}, T0)).toBe('disabled')
  })

  it('违规达阈 → disabled（单独停用触发点）', () => {
    const violations = { a: { count: 10, firstAt: T0 } }
    expect(composeState(entry('a'), new Set(), violations, T0 + 1)).toBe('disabled')
  })

  it('违规窗口过期 → 回 ok', () => {
    const violations = { a: { count: 10, firstAt: T0 } }
    expect(composeState(entry('a'), new Set(), violations, T0 + 24 * 60 * 60 * 1000 + 1)).toBe('ok')
  })

  it('失效态不因偏好回活（待更新/移除，不自动恢复）', () => {
    expect(composeState(entry('bad', 'invalid'), new Set(), {}, T0)).toBe('invalid')
  })
})

describe('模块 store 偏好', () => {
  it('停用后启用：违规账清零（防死状态）', () => {
    setActivePinia(createPinia())
    const store = useModulesStore()
    store.reportViolation('mod-a')
    store.setEnabled('mod-a', false)
    expect(store.prefs.disabled).toContain('mod-a')
    store.setEnabled('mod-a', true)
    expect(store.prefs.disabled).not.toContain('mod-a')
    expect(store.prefs.violations['mod-a']).toBeUndefined()
  })

  it('reportViolation 达阈返 true', () => {
    setActivePinia(createPinia())
    const store = useModulesStore()
    let tripped = false
    for (let i = 0; i < 10; i++) tripped = store.reportViolation('mod-a')
    expect(tripped).toBe(true)
  })

  it('设置项读写', () => {
    setActivePinia(createPinia())
    const store = useModulesStore()
    expect(store.getSetting('m', 'days', '3')).toBe('3')
    store.setSetting('m', 'days', '7')
    expect(store.getSetting('m', 'days', '3')).toBe('7')
  })

  it('坏偏好数据落默认（归一化纪律）', () => {
    localStorage.setItem('shihui-module-prefs-v1', '{这不是json')
    setActivePinia(createPinia())
    const store = useModulesStore()
    expect(store.prefs.disabled).toEqual([])
    expect(store.prefs.settings).toEqual({})
  })

  it('移除口径提示指向模块文件夹（F1 哲学：壳不删文件）', () => {
    setActivePinia(createPinia())
    const store = useModulesStore()
    expect(store.openModulesDirHint()).toContain('modules')
  })
})

describe('来源判定（壳判定，不采信模块自报）', () => {
  const record = { manifestDigest: 'aaa', entryDigest: 'bbb', installedAt: '2026-11-17T00:00:00Z', findings: 0 }

  it('官方模块恒为 official（即使装过包）', () => {
    const e = entry('mood-weather')
    e.manifest!.source = 'official' // parseManifest 对第一方 ID 钉死的结果
    expect(composeSource(e, record, { manifest: 'aaa', entry: 'bbb' })).toBe('official')
  })

  it('没装包账 → local', () => {
    expect(composeSource(entry('a'), undefined, { manifest: 'aaa', entry: 'bbb' })).toBe('local')
  })

  it('装包账与当前指纹一致 → pack；不一致 → edited', () => {
    const e = entry('a')
    expect(composeSource(e, record, { manifest: 'aaa', entry: 'bbb' })).toBe('pack')
    expect(composeSource(e, record, { manifest: 'aaa', entry: 'ccc' })).toBe('edited')
    expect(composeSource(e, record, { manifest: 'zzz', entry: 'bbb' })).toBe('edited')
  })

  it('装过包但指纹算不出（读文件失败）→ edited（保守）', () => {
    expect(composeSource(entry('a'), record, undefined)).toBe('edited')
  })

  it('store.markPackInstalled 落账后 sourceOf 认导入包', () => {
    setActivePinia(createPinia())
    const store = useModulesStore()
    const e = entry('packed-mod')
    // 直接注入指纹（等价于 scan 后的结果），避免依赖桥
    store.fingerprints['packed-mod'] = { manifest: 'aaa', entry: 'bbb', short: 'aaa' }
    expect(store.sourceOf(e)).toBe('local')
    store.markPackInstalled('packed-mod', { manifest: 'aaa', entry: 'bbb' }, 0)
    expect(store.sourceOf(e)).toBe('pack')
  })
})
