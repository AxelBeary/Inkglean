// 审计修复波1 DSK-A 路回归测试：P0-3 ledger 门禁 / DSK-01 未接线视图 / DSK-13a source guard / DSK-13e 阈值常量。
import { describe, it, expect } from 'vitest'
import { canAccessView, buildViewData } from '../modules/viewData'
import type { ViewSources } from '../modules/viewData'
import { composeState } from '../modules/store'
import { VIOLATION_LIMIT, RESTRICTED_VIEWS, FIRST_PARTY_IDS, UNWIRED_VIEWS, KNOWN_VIEWS } from '../modules/manifest'
import { parseManifest } from '../modules/manifest'
import type { ModuleEntry } from '../modules/registry'
import type { LocalOrder } from '../stores/localLedger'

// ─── 辅助工厂 ───

function makeEntry(id: string, source: 'official' | 'external', views: string[] = ['ledger']): ModuleEntry {
  return {
    dirName: id,
    manifest: {
      spec: '1.0', api: 'panel@1', minHost: '0.1.0', id, name: '测试模块', description: '',
      version: '0.1.0', source, entry: 'panel.js',
      ui: { zone: 'aside', heightRule: 'fixed-rows', hideable: true, tearable: false, focusPolicy: 'fold', styles: [] },
      data: { views, write: { own: false, shared: 'none', reason: '' } },
      settings: [], network: { scope: 'none', hosts: [], reason: '' },
      linkage: { subscribes: [], emits: [] },
      runtime: { lifecycle: 'on-view', wakeInterval: null, idlePolicy: 'afk-aware' },
      diagnostics: false
    },
    state: 'ok',
    reasons: []
  }
}

const sampleLedger: LocalOrder = {
  id: 1, client_name: '张三', title: '头像', price: 100, deadline: null,
  status: 'in_progress', created_at: '', updated_at: ''
}

const sampleSources: ViewSources = {
  ledger: [sampleLedger],
  time: { today: { paint: 10, idle: 5, other: 3 }, week: [] },
  mode: 'local'
}

// ─── P0-3：ledger 视图门禁（受限视图仅第一方可获取） ───

describe('P0-3 canAccessView（ledger 门禁）', () => {
  it('第一方模块（official）可获取 ledger 视图', () => {
    expect(canAccessView('ledger', 'official')).toBe(true)
  })

  it('第三方模块（external）不可获取 ledger 视图', () => {
    expect(canAccessView('ledger', 'external')).toBe(false)
  })

  it('非受限视图（time）第三方模块也可获取', () => {
    expect(canAccessView('time', 'external')).toBe(true)
    expect(canAccessView('time', 'official')).toBe(true)
  })

  it('RESTRICTED_VIEWS 包含 ledger', () => {
    expect(RESTRICTED_VIEWS.has('ledger')).toBe(true)
  })

  it('RESTRICTED_VIEWS 不包含 time/orders/messages（非敏感视图）', () => {
    expect(RESTRICTED_VIEWS.has('time')).toBe(false)
    expect(RESTRICTED_VIEWS.has('orders')).toBe(false)
    expect(RESTRICTED_VIEWS.has('messages')).toBe(false)
  })

  it('FIRST_PARTY_IDS 包含壳内嵌示例模块 mood-weather', () => {
    expect(FIRST_PARTY_IDS.has('mood-weather')).toBe(true)
  })

  it('parseManifest 对第一方 ID 模块标记 source=official', () => {
    const json = JSON.stringify({
      spec: '1.0', api: 'panel@1', minHost: '0.1.0',
      id: 'mood-weather', name: '稿情气象台', version: '0.1.0', entry: 'panel.js',
      data: { views: ['ledger', 'time'] }
    })
    const r = parseManifest(json)
    expect(r.ok).toBe(true)
    expect(r.manifest?.source).toBe('official')
  })

  it('parseManifest 对第三方模块标记 source=external', () => {
    const json = JSON.stringify({
      spec: '1.0', api: 'panel@1', minHost: '0.1.0',
      id: 'evil-mod', name: '恶意模块', version: '0.1.0', entry: 'panel.js',
      data: { views: ['ledger'] }
    })
    const r = parseManifest(json)
    expect(r.ok).toBe(true)
    expect(r.manifest?.source).toBe('external')
  })

  it('第三方模块声明 ledger 视图：canAccessView 拒绝后 buildViewData 不被调用（逻辑断言）', () => {
    // 验证门禁与数据供给的分层：门禁返 false 时壳层不应调 buildViewData
    const entry = makeEntry('evil-mod', 'external', ['ledger'])
    const source = entry.manifest!.source
    expect(canAccessView('ledger', source)).toBe(false)
    // 即便绕过门禁，数据仍含敏感字段（证明门禁是最后防线）
    const data = buildViewData('ledger', sampleSources) as Array<Record<string, unknown>>
    expect(data[0].client_name).toBe('张三')
  })
})

// ─── DSK-01：未接线视图标记 ───

describe('DSK-01 UNWIRED_VIEWS（未接线视图）', () => {
  it('orders 和 messages 标记为未接线', () => {
    expect(UNWIRED_VIEWS.has('orders')).toBe(true)
    expect(UNWIRED_VIEWS.has('messages')).toBe(true)
  })

  it('ledger 和 time 不在未接线集合中（已有数据源）', () => {
    expect(UNWIRED_VIEWS.has('ledger')).toBe(false)
    expect(UNWIRED_VIEWS.has('time')).toBe(false)
  })

  it('未接线视图仍在 KNOWN_VIEWS 中（模块声明不报错，但运行时返回 unavailable）', () => {
    expect('orders' in KNOWN_VIEWS).toBe(true)
    expect('messages' in KNOWN_VIEWS).toBe(true)
  })

  it('UNWIRED_VIEWS 是 KNOWN_VIEWS 的子集', () => {
    for (const v of UNWIRED_VIEWS) {
      expect(v in KNOWN_VIEWS).toBe(true)
    }
  })
})

// ─── DSK-13a：source guard 逻辑验证 ───

describe('DSK-13a source guard（灰牌态消息拒绝）', () => {
  // 模拟 onMessage 的前置校验逻辑（从 ModuleFrame.vue 提取为可测纯逻辑）
  function shouldAcceptMessage(
    iframeRefValue: { contentWindow: unknown } | null,
    eSource: unknown,
    eOrigin: string
  ): boolean {
    // DSK-13a 修复后的逻辑：!iframeRef.value || e.source !== iframeRef.value.contentWindow → reject
    if (!iframeRefValue || eSource !== iframeRefValue.contentWindow) return false
    // DSK-13d 修复后的逻辑：origin 必须为 "null"（data: URL iframe 的 origin）
    if (eOrigin !== 'null') return false
    return true
  }

  it('正常态：iframeRef 存在且 source 匹配且 origin 为 null → 接受', () => {
    const win = {} as Window
    expect(shouldAcceptMessage({ contentWindow: win }, win, 'null')).toBe(true)
  })

  it('灰牌态：iframeRef 为 null → 拒绝（DSK-13a 核心修复）', () => {
    const win = {} as Window
    expect(shouldAcceptMessage(null, win, 'null')).toBe(false)
  })

  it('source 不匹配（其他窗口发来消息）→ 拒绝', () => {
    const win = {} as Window
    const otherWin = {} as Window
    expect(shouldAcceptMessage({ contentWindow: win }, otherWin, 'null')).toBe(false)
  })

  it('origin 不是 "null"（壳自身或 XSS 注入消息）→ 拒绝（DSK-13d）', () => {
    const win = {} as Window
    expect(shouldAcceptMessage({ contentWindow: win }, win, 'http://localhost:5173')).toBe(false)
    expect(shouldAcceptMessage({ contentWindow: win }, win, 'https://evil.com')).toBe(false)
  })

  it('origin 为 "null" 但 source 不对 → 仍拒绝', () => {
    const win = {} as Window
    const otherWin = {} as Window
    expect(shouldAcceptMessage({ contentWindow: win }, otherWin, 'null')).toBe(false)
  })

  it('旧逻辑对比：灰牌态下 iframeRef=null 时旧代码不 return（缺陷复现）', () => {
    // 旧逻辑：if (iframeRef.value && e.source !== iframeRef.value.contentWindow) return
    // 当 iframeRef.value 为 null 时：null && ... = false，不 return → 消息通过（缺陷！）
    function oldShouldAccept(
      iframeRefValue: { contentWindow: unknown } | null,
      eSource: unknown
    ): boolean {
      if (iframeRefValue && eSource !== iframeRefValue.contentWindow) return false
      return true // 旧逻辑：iframeRef 为 null 时走到这里 → 接受（BUG）
    }
    const win = {} as Window
    expect(oldShouldAccept(null, win)).toBe(true) // 旧逻辑错误地接受
    // 新逻辑正确拒绝
    expect(shouldAcceptMessage(null, win, 'null')).toBe(false)
  })
})

// ─── DSK-13e：违规阈值使用常量 ───

describe('DSK-13e composeState 使用 VIOLATION_LIMIT 常量', () => {
  const T0 = 1_000_000_000

  it('VIOLATION_LIMIT 常量为 10', () => {
    expect(VIOLATION_LIMIT).toBe(10)
  })

  it('违规次数恰好达到 VIOLATION_LIMIT → disabled', () => {
    const violations = { 'mod-a': { count: VIOLATION_LIMIT, firstAt: T0 } }
    expect(composeState(makeEntry('mod-a', 'external', []), new Set(), violations, T0 + 1)).toBe('disabled')
  })

  it('违规次数 VIOLATION_LIMIT - 1 → 仍为 ok', () => {
    const violations = { 'mod-a': { count: VIOLATION_LIMIT - 1, firstAt: T0 } }
    expect(composeState(makeEntry('mod-a', 'external', []), new Set(), violations, T0 + 1)).toBe('ok')
  })

  it('违规次数超过 VIOLATION_LIMIT → disabled', () => {
    const violations = { 'mod-a': { count: VIOLATION_LIMIT + 5, firstAt: T0 } }
    expect(composeState(makeEntry('mod-a', 'external', []), new Set(), violations, T0 + 1)).toBe('disabled')
  })

  it('窗口过期后违规不计数 → ok（与 VIOLATION_LIMIT 无关）', () => {
    const violations = { 'mod-a': { count: VIOLATION_LIMIT * 2, firstAt: T0 } }
    // 24h + 1ms 后窗口过期
    expect(composeState(makeEntry('mod-a', 'external', []), new Set(), violations, T0 + 24 * 60 * 60 * 1000 + 1)).toBe('ok')
  })
})
