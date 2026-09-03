// 档②波17 四件测试：沙箱帧与桥协议纯函数（信封校验/帧 HTML/视图供给口径哨兵）。
import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import {
  verifyEnvelope, buildModuleHtml, buildFrameSrc, MODULE_CSP,
  isBridgeType, newToken
} from '../modules/frame'
import { buildViewData } from '../modules/viewData'
import type { ViewSources } from '../modules/viewData'
import type { LocalOrder } from '../stores/localLedger'
import { moduleRenderable } from '../modules/registry'
import type { ModuleEntry } from '../modules/registry'

describe('verifyEnvelope（消息信封）', () => {
  const TOKEN = 'tok-123'

  it('合法信封通过', () => {
    const env = verifyEnvelope({ id: 'm1', type: 'shihui/ready', payload: null, token: TOKEN }, TOKEN)
    expect(env?.type).toBe('shihui/ready')
  })

  it('token 不符拒认（模块无法伪造）', () => {
    expect(verifyEnvelope({ id: 'm1', type: 'x', payload: null, token: 'fake' }, TOKEN)).toBeNull()
  })

  it('形状非法拒认', () => {
    expect(verifyEnvelope(null, TOKEN)).toBeNull()
    expect(verifyEnvelope([1, 2], TOKEN)).toBeNull()
    expect(verifyEnvelope({ type: 'x' }, TOKEN)).toBeNull()
  })

  it('白名单外类型拒认', () => {
    expect(isBridgeType('shihui/ready')).toBe(true)
    expect(isBridgeType('shihui/evil')).toBe(false)
  })

  it('握手令牌每次不同', () => {
    expect(newToken()).not.toBe(newToken())
    expect(newToken()).toHaveLength(32)
  })
})

describe('buildModuleHtml / buildFrameSrc（沙箱帧形态）', () => {
  it('帧级 CSP 物理断网（connect-src none）+ 禁同源资源', () => {
    expect(MODULE_CSP).toContain("connect-src 'none'")
    expect(MODULE_CSP).toContain("default-src 'none'")
    expect(MODULE_CSP).toContain("worker-src 'none'")
  })

  it('帧 HTML 含 CSP meta + 握手脚本 + 模块代码', () => {
    const html = buildModuleHtml('console.log(1)')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain('shihui/handshake')
    expect(html).toContain('console.log(1)')
  })

  it('模块代码里的 </script> 被断开防提前闭合', () => {
    const html = buildModuleHtml('var s = "</script>"')
    // 断开后不应出现未转义的提前闭合
    expect(html.includes('"<\\/script>"')).toBe(true)
  })

  it('主题 token 注入帧内（装裱由壳统辖）', () => {
    const html = buildModuleHtml('x', '--paper:#fff;--ink:#000')
    expect(html).toContain(':root{--paper:#fff;--ink:#000}')
  })

  it('帧 src 为 data URL（opaque origin）', () => {
    expect(buildFrameSrc('x').startsWith('data:text/html;charset=utf-8,')).toBe(true)
  })

  it('握手前 send 进队列、握手后补发（竞态自卫：模块脚本先于壳握手执行）', () => {
    const html = buildModuleHtml('x')
    expect(html).toContain('pend') // 待握手队列
    expect(html).toContain('flush') // 握手后补发（补发时补 token）
    expect(html).toContain('m.token=TOKEN')
  })
})

describe('buildViewData（拍板一视图白名单）', () => {
  const ledgerRow: LocalOrder = {
    id: 1, client_name: '张三', title: '头像', price: 100, deadline: null,
    status: 'draft', created_at: '', updated_at: ''
  }
  const sources: ViewSources = {
    ledger: [ledgerRow],
    time: { today: { paint: 10, idle: 5, other: 3 }, week: [] },
    mode: 'local'
  }

  it('ledger 视图给白名单字段', () => {
    const data = buildViewData('ledger', sources) as Array<Record<string, unknown>>
    expect(data[0].client_name).toBe('张三')
    expect('created_at' in data[0]).toBe(false) // 非白名单字段不出现
  })

  it('time 视图给今日+周数据', () => {
    const data = buildViewData('time', sources) as { today: { paint: number } }
    expect(data.today.paint).toBe(10)
  })

  // 9/4 波1 冒烟实测抓到的波17 遗留缺陷：壳侧直接把 store 的响应式代理交给 postMessage，
  // 结构化克隆拒收 Proxy → DataCloneError → 模块永远等不到 time 数据 → 5 秒后灰牌。
  // 官方示例模块「稿情气象台」正好要 time 视图，所以它一直踩这个坑。
  it('回归：视图数据必须是素对象（响应式源也能过结构化克隆，否则模块灰牌）', () => {
    const reactiveSources = reactive({
      ledger: [ledgerRow],
      time: {
        today: { paint: 10, idle: 5, other: 3 },
        week: [{ date: '2026-09-01', paint: 60, idle: 12, other: 8 }]
      },
      mode: 'local'
    }) as unknown as ViewSources
    // 先证源确实是代理（否则本例无意义）
    expect(() => structuredClone(reactiveSources.time)).toThrow()
    const time = buildViewData('time', reactiveSources)
    expect(() => structuredClone(time)).not.toThrow()
    expect(time).toEqual({
      today: { paint: 10, idle: 5, other: 3 },
      week: [{ date: '2026-09-01', paint: 60, idle: 12, other: 8 }]
    })
    expect(() => structuredClone(buildViewData('ledger', reactiveSources))).not.toThrow()
  })

  it('纠形：ledger 源不是数组时返空数组不抛错', () => {
    const bad = { ...sources, ledger: { items: [] } as unknown as LocalOrder[] }
    expect(buildViewData('ledger', bad)).toEqual([])
  })

  it('云端视图本地模式返 null（H5 纪律）', () => {
    expect(buildViewData('orders', sources)).toBeNull()
    expect(buildViewData('messages', sources)).toBeNull()
  })

  it('云端模式给订单白名单字段（联系方式类永不出现）', () => {
    const data = buildViewData('orders', {
      ...sources,
      mode: 'cloud',
      orders: [{ order_no: 'A1', client_name: '张三', client_qq: '12345', status: 'wip' }]
    }) as Array<Record<string, unknown>>
    expect(data[0].order_no).toBe('A1')
    expect('client_qq' in data[0]).toBe(false)
  })

  it('未知视图返 null', () => {
    expect(buildViewData('evil-view', sources)).toBeNull()
  })
})

describe('moduleRenderable（H5 模式过滤）', () => {
  function entry(views: string[]): ModuleEntry {
    return {
      dirName: 'm',
      manifest: {
        spec: '1.0', api: 'panel@1', minHost: '0.1.0', id: 'm', name: 'm', description: '',
        version: '0.1.0', source: 'external', entry: 'panel.js',
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

  it('订了云端视图的模块本地模式不渲染', () => {
    expect(moduleRenderable(entry(['orders']), 'local')).toBe(false)
    expect(moduleRenderable(entry(['orders']), 'cloud')).toBe(true)
  })

  it('纯本地视图模块双模式可渲染', () => {
    expect(moduleRenderable(entry(['ledger']), 'local')).toBe(true)
  })

  it('非 ok 态不渲染', () => {
    const e = entry(['ledger'])
    e.state = 'invalid'
    expect(moduleRenderable(e, 'local')).toBe(false)
  })
})
