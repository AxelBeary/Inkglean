// DSK-10 回归：「记一笔」submit 必须真上 busy 锁——await addOrder 期间连点「落账」不得重复落账。
// 挂载兜底：desktop 测试栈未装 @vue/test-utils，用 createApp + nextTick 直挂 happy-dom 节点
// （与 home-mode.test.ts / home-mainview.test.ts 同款）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'
import LedgerPanel from '../panels/LedgerPanel.vue'
import { useLocalLedgerStore } from '../stores/localLedger'
import type { LocalOrder } from '../stores/localLedger'

let app: App | null = null
let root: HTMLElement | null = null

afterEach(() => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  vi.restoreAllMocks()
})

/** 等微任务 + 一次渲染刷新落定 */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

/**
 * 挂载面板：预置 ledger 为「桌面可用但空账」态（loaded=true 使 onMounted 跳过 loadAll，
 * 否则浏览器环境下 loadAll 会置 unavailable=true 把整个表单 v-else 分支藏掉）。
 */
async function mountPanel(): Promise<{ pinia: Pinia; ledger: ReturnType<typeof useLocalLedgerStore> }> {
  root = document.createElement('div')
  document.body.appendChild(root)
  const pinia = createPinia()
  const ledger = useLocalLedgerStore(pinia)
  ledger.loaded = true
  ledger.unavailable = false
  ledger.orders = []
  app = createApp(LedgerPanel)
  app.use(pinia)
  app.mount(root)
  await flush()
  return { pinia, ledger }
}

/** 展开「记一笔」内联表单并填客户名，返回落账按钮 */
async function openFormWithClient(name = '张三'): Promise<HTMLButtonElement> {
  const addBtn = root!.querySelector<HTMLButtonElement>('.add')
  expect(addBtn, '应先看到「＋ 记一笔」按钮').toBeTruthy()
  addBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
  const client = root!.querySelector<HTMLInputElement>('.f-client')
  expect(client, '表单应已展开').toBeTruthy()
  client!.value = name
  client!.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  const ok = root!.querySelector<HTMLButtonElement>('.ok')
  expect(ok, '应看到「落账」按钮').toBeTruthy()
  return ok!
}

function fakeRow(id: number): LocalOrder {
  return { id, client_name: '张三', title: '', price: 0, deadline: null, status: 'draft', created_at: '', updated_at: '' }
}

describe('DSK-10：记一笔 busy 上锁，连点不重复落账', () => {
  it('await addOrder 期间连点两次「落账」，只落账一次', async () => {
    const { ledger } = await mountPanel()

    // deferred：把 addOrder 挂起，模拟网络/写库未回期间的连点窗口
    let resolveAdd!: (v: LocalOrder | null) => void
    const addSpy = vi.spyOn(ledger, 'addOrder')
      .mockImplementation(() => new Promise<LocalOrder | null>(res => { resolveAdd = res }))

    const ok = await openFormWithClient()

    // 同一 tick 内连点两次（第二次时 DOM 尚未重渲染成 disabled，靠 busy 守卫拦）
    ok.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    ok.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(addSpy).toHaveBeenCalledTimes(1) // 核心断言：第二次被 busy 守卫挡下
    // 落账期间按钮应被禁用（:disabled="busy"）
    expect(root!.querySelector<HTMLButtonElement>('.ok')!.disabled).toBe(true)

    // 收尾：让挂起的 addOrder 落定，busy 应经 finally 复位
    resolveAdd(fakeRow(1))
    await flush()
    expect(root!.querySelector('.add-form')).toBeNull() // 成功落账后表单收起
  })

  it('落账完成后 busy 复位，可再次记一笔（未被卡死）', async () => {
    const { ledger } = await mountPanel()

    let resolveAdd!: (v: LocalOrder | null) => void
    const addSpy = vi.spyOn(ledger, 'addOrder')
      .mockImplementation(() => new Promise<LocalOrder | null>(res => { resolveAdd = res }))

    const ok = await openFormWithClient()
    ok.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    resolveAdd(fakeRow(1))
    await flush()

    // 第一轮结束后重新展开表单再点一次，应能正常触发第二次 addOrder（busy 已复位）
    const ok2 = await openFormWithClient('李四')
    expect(ok2.disabled).toBe(false)
    ok2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    resolveAdd(fakeRow(2))
    await flush()

    expect(addSpy).toHaveBeenCalledTimes(2)
  })

  it('addOrder 返回 null（落账失败）时 busy 复位、表单保留可重试', async () => {
    const { ledger } = await mountPanel()

    let resolveAdd!: (v: LocalOrder | null) => void
    vi.spyOn(ledger, 'addOrder')
      .mockImplementation(() => new Promise<LocalOrder | null>(res => { resolveAdd = res }))

    const ok = await openFormWithClient()
    ok.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(ok.disabled).toBe(true)

    resolveAdd(null) // 失败：客户名空/写库失败，store 返 null
    await flush()

    // 失败不收起表单（原口径），且 busy 复位、按钮恢复可点，用户可就地重试
    expect(root!.querySelector('.add-form')).not.toBeNull()
    expect(root!.querySelector<HTMLButtonElement>('.ok')!.disabled).toBe(false)
  })
})
