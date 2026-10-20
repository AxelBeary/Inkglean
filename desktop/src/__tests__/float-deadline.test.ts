// U45 回归：本地模式下「截稿倒计时」悬浮卡不得把「取不到数据」渲染成「近期无截稿」。
// desktop 测试栈无 @vue/test-utils，照 ledger-panel-submit.test.ts 的 createApp + createPinia + flush 直挂。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'
import FloatDeadline from '../components/home/FloatDeadline.vue'
import { useLocalLedgerStore } from '../stores/localLedger'
import type { LocalOrder } from '../stores/localLedger'
import { fetchDeadlineSoon } from '../api/artist'

vi.mock('../api/artist', () => ({
  fetchDeadlineSoon: vi.fn(async () => ({ items: [] }))
}))

type LedgerStore = ReturnType<typeof useLocalLedgerStore>

let app: App | null = null
let root: HTMLElement | null = null

beforeEach(() => {
  vi.mocked(fetchDeadlineSoon).mockResolvedValue({ items: [] })
})

afterEach(() => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  vi.restoreAllMocks()
})

/** 等微任务 + 一次渲染刷新落定（onMounted 里的 await 链在此排空） */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

/**
 * 挂载悬浮截稿卡：prepare 在 store 建好之后、组件挂载之前执行，
 * 用于预置 ledger 状态（loaded/unavailable/orders）或装 spy；
 * 传入既有 pinia 即模拟「同一悬浮窗重挂载」（store 状态延续）。
 */
async function mountDeadline(
  prepare: (ledger: LedgerStore) => void,
  opts: { mode?: 'cloud' | 'local'; pinia?: Pinia } = {}
): Promise<{ ledger: LedgerStore; pinia: Pinia }> {
  root = document.createElement('div')
  document.body.appendChild(root)
  const pinia = opts.pinia ?? createPinia()
  const ledger = useLocalLedgerStore(pinia)
  prepare(ledger)
  app = createApp(FloatDeadline, { mode: opts.mode ?? 'local' })
  app.use(pinia)
  app.mount(root)
  await flush()
  return { ledger, pinia }
}

function text(): string {
  return root?.textContent ?? ''
}

function fakeOrder(p: Partial<LocalOrder> = {}): LocalOrder {
  return {
    id: p.id ?? 1,
    client_name: p.client_name ?? '张三',
    title: p.title ?? '头像',
    price: p.price ?? 0,
    deadline: p.deadline ?? null,
    status: p.status ?? 'in_progress',
    created_at: '',
    updated_at: ''
  }
}

/** 本地日历日 +days 的截稿时刻（中午定锚，避开时区把日期推过界） */
function deadlineAfter(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

describe('U45 · 本地模式说真话（不渲染假空态）', () => {
  it('loaded=true + unavailable=true：显示「暂时取不到截稿」，不显示「近期无截稿」', async () => {
    await mountDeadline((ledger) => {
      ledger.loaded = true
      ledger.unavailable = true
      ledger.orders = []
    })

    expect(text()).toContain('暂时取不到截稿')
    expect(text()).not.toContain('近期无截稿')
  })

  it('loaded=true + unavailable=false + 空账：仍显示「近期无截稿，从容落笔」', async () => {
    await mountDeadline((ledger) => {
      ledger.loaded = true
      ledger.unavailable = false
      ledger.orders = []
    })

    expect(text()).toContain('近期无截稿，从容落笔')
    expect(text()).not.toContain('暂时取不到截稿')
  })

  it('有一条 3 天内截稿单：显示客户名与该档位文案「剩 3 天」', async () => {
    await mountDeadline((ledger) => {
      ledger.loaded = true
      ledger.unavailable = false
      ledger.orders = [fakeOrder({ id: 7, client_name: '阿七', deadline: deadlineAfter(3) })]
    })

    expect(text()).toContain('阿七')
    expect(text()).toContain('剩 3 天')
    expect(root!.querySelector('.fdl-due')!.classList.contains('hq')).toBe(true)
  })

  it('U45 缺陷链回归：组件走只读通道 loadAll(true)，store 吞异常只置 unavailable 时仍说真话', async () => {
    let loadArgs: unknown[] = []
    await mountDeadline((ledger) => {
      ledger.loaded = false
      ledger.unavailable = false
      // 复刻 store 真实语义：内部 catch 吞掉建表 ACL 失败，只置 unavailable（不外抛）
      vi.spyOn(ledger, 'loadAll').mockImplementation(async (...args: unknown[]) => {
        loadArgs = args
        ledger.unavailable = true
        ledger.loaded = true
      })
    })

    expect(loadArgs).toEqual([true]) // 只读投影窗必须走只读入口
    expect(text()).toContain('暂时取不到截稿')
    expect(text()).not.toContain('近期无截稿')
  })

  it('同窗重挂载（loaded 已真、unavailable 已真）不再 loadAll，仍显示「暂时取不到截稿」', async () => {
    const { pinia } = await mountDeadline((l) => {
      l.loaded = true
      l.unavailable = true
      l.orders = []
    })
    // 销毁后同一 pinia 重挂载，模拟悬浮窗关掉再撕开
    app!.unmount()
    root!.remove()
    app = null
    root = null

    let loadCalls = 0
    await mountDeadline((l) => {
      vi.spyOn(l, 'loadAll').mockImplementation(async () => { loadCalls += 1 })
    }, { pinia })

    expect(loadCalls).toBe(0)
    expect(text()).toContain('暂时取不到截稿')
  })
})

describe('U45 · 云端模式行为不变', () => {
  it('云端走 fetchDeadlineSoon，渲染客户名与档位文案，不碰本地记账', async () => {
    vi.mocked(fetchDeadlineSoon).mockResolvedValue({
      items: [{ id: 1, orderNo: 'AC-1', clientName: '林阿七', deadline: '', daysLeft: 1 }]
    })

    const { ledger } = await mountDeadline(() => {}, { mode: 'cloud' })

    expect(fetchDeadlineSoon).toHaveBeenCalledWith(14, 6)
    // 云端分支不碰本地记账：真调过 loadAll 会把 loaded 翻真（浏览器环境还会置 unavailable）
    expect(ledger.loaded).toBe(false)
    expect(ledger.unavailable).toBe(false)
    expect(text()).toContain('林阿七')
    expect(text()).toContain('明天截稿')
  })
})
