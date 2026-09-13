// 撤销条 UndoToast（9/13 波2 · 路B）自检。
// 从 schedule-timeline-drag.test.ts 拆出来单独成文：一个测试文件里挂两个组件会触发
// eslint 的 vue/one-component-per-file（桌面门禁口径是 0 错 0 警），拆开后各挂各的，
// 顺带让「撤销条」这件独立组件有独立用例面（它不只服务时间条，列表拖排也共用）。
// 覆盖：显隐与 role=status、文案不 HTML 化（禁 v-html 注入口）、label 可覆盖、
//       到 duration 自动 timeout（默认 5000ms）、一次性锁（连点只发一次）、
//       visible 翻转解锁、文案原地更新重起时钟、卸载清定时器。
// 挂载姿势：测试栈未装 @vue/test-utils，照 home-mainview.test.ts 用 createApp + nextTick 直挂；
//       撤销条要走 visible/message 翻转，rootProps 一次给死不够用，故套一层最小宿主 render。
// 每条用例尾的「牙：」写明实现在哪种错法下会让这条变红。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import type { App } from 'vue'
import UndoToast from '../components/schedule/UndoToast.vue'

interface UndoProps { visible: boolean; message: string; label?: string; duration?: number }

let app: App | null = null
let root: HTMLElement | null = null

/** 排空一次渲染 + 一次宏任务（Vue Transition 的收尾走 setTimeout，光 nextTick 不够） */
async function settle(): Promise<void> {
  await nextTick()
  await new Promise(r => setTimeout(r, 20))
  await nextTick()
}

afterEach(async () => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  // Teleport 到 body 的撤销条若因过渡没走完而残留，手动清干净（不用 innerHTML 赋值，避免解析 HTML）
  for (const node of [...document.querySelectorAll('.undo-toast')]) node.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await settle()
})

async function mountUndo(initial: UndoProps) {
  const p = reactive<UndoProps>({ label: undefined, duration: undefined, ...initial })
  const onUndo = vi.fn()
  const onTimeout = vi.fn()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(UndoToast, {
      visible: p.visible, message: p.message, label: p.label, duration: p.duration,
      onUndo, onTimeout
    })
  })
  app.mount(root)
  await nextTick()
  return { p, onUndo, onTimeout }
}
function toastEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.undo-toast')
}
function undoBtn(): HTMLButtonElement {
  const btn = toastEl()?.querySelector('button') as HTMLButtonElement | undefined
  expect(btn, '撤销条里没渲染出按钮').toBeTruthy()
  return btn!
}

describe('UndoToast 撤销条', () => {
  it('visible=false 不挂到 body；转 true 才出现，且带 role=status（读屏能念）', async () => {
    const { p } = await mountUndo({ visible: false, message: '截稿日改到 2026-09-20' })
    expect(toastEl()).toBeNull()
    p.visible = true
    await nextTick()
    const el = toastEl()
    expect(el).toBeTruthy()
    expect(el!.getAttribute('role')).toBe('status')
    expect(el!.textContent).toContain('截稿日改到')
    // 牙：v-if 写反（或整件常挂）→ 首句红；漏 role="status" → 读屏断言红。
  })

  it('文案走文本插值：带标签的 message 不会被解析成节点（禁 v-html）', async () => {
    const raw = '<b>加粗</b><img src=x onerror=alert(1)>'
    await mountUndo({ visible: true, message: raw })
    const msg = toastEl()!.querySelector('.ut-msg') as HTMLElement
    expect(msg.textContent).toBe(raw)
    expect(toastEl()!.querySelector('img')).toBeNull()
    expect(toastEl()!.querySelector('b')).toBeNull()
    // 牙：改用 v-html → img/b 变成真节点，后两句红（message 里有客户名与后端回串，是注入口）。
  })

  it('按钮默认文案「撤销」、type=button（不在表单里误提交）；label 可覆盖', async () => {
    const { p } = await mountUndo({ visible: true, message: 'm' })
    const btn = undoBtn()
    expect(btn.type).toBe('button')
    expect(btn.textContent?.trim()).toBe('撤销')
    p.label = '撤回这次改期'
    await nextTick()
    expect(undoBtn().textContent?.trim()).toBe('撤回这次改期')
    // 牙：label 默认值漏给（渲染成空白按钮）→ 第一句红。
  })

  it('到 duration 自动发 timeout（默认 5000ms），未到点不发', async () => {
    vi.useFakeTimers()
    const { onTimeout } = await mountUndo({ visible: true, message: 'm' })
    await vi.advanceTimersByTimeAsync(4999)
    expect(onTimeout).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    // 牙：默认时长被改（如 2600 与宿主普通 toast 混用）→ 4999/1 两句红；重复起表 → 次数红。
  })

  it('自定义 duration 生效（宿主可给更短的窗）', async () => {
    vi.useFakeTimers()
    const { onTimeout } = await mountUndo({ visible: true, message: 'm', duration: 1200 })
    await vi.advanceTimersByTimeAsync(1199)
    expect(onTimeout).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    // 牙：没读 props.duration（写死 5000）→ 红。
  })

  it('点撤销：emit 一次 undo，按钮立即禁用，连点不再 emit 第二次（一次性锁）', async () => {
    const { onUndo } = await mountUndo({ visible: true, message: 'm' })
    const btn = undoBtn()
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(onUndo).toHaveBeenCalledTimes(1)
    // 牙：只有 :disabled 的视觉、onUndo 里没上锁（脚本照样能派发 click），或锁在 emit 之后才置位
    //     → 第二次点击仍 emit，撤销被写两遍（第二遍必吃 409）。
  })

  it('visible 转 false 解锁；再次弹出可重新撤销（锁不跨提示生命周期）', async () => {
    const { p, onUndo } = await mountUndo({ visible: true, message: '第一单' })
    undoBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(onUndo).toHaveBeenCalledTimes(1)
    p.visible = false // 宿主取走 undoTarget（撤销成功 / 换了目标）
    await settle()
    expect(toastEl()).toBeNull()
    p.visible = true
    p.message = '第二单'
    await settle()
    const btn2 = undoBtn()
    expect(btn2.disabled).toBe(false)
    btn2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(onUndo).toHaveBeenCalledTimes(2)
    // 牙：翻转 visible 不解锁 → 第二次操作的按钮永远点不动（假按钮），中间那句 disabled 红。
  })

  it('文案原地更新（连续拖两条）会重起倒计时并解锁', async () => {
    vi.useFakeTimers()
    const { p, onTimeout } = await mountUndo({ visible: true, message: 'A' })
    await vi.advanceTimersByTimeAsync(4000)
    p.message = 'B' // 宿主不换 visible，只换文案
    await vi.advanceTimersByTimeAsync(4000)
    expect(onTimeout).not.toHaveBeenCalled() // 新的 5000ms 还没走满
    await vi.advanceTimersByTimeAsync(1000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    // 牙：watch 只盯 visible → 第二条会在 1000ms 时被上一条剩余的时钟吞掉（画师还没看清就没了）。
  })

  it('卸载清定时器：unmount 后不再挂着的提示（防幽灵回调）', async () => {
    vi.useFakeTimers()
    const { onTimeout } = await mountUndo({ visible: true, message: 'm' })
    app!.unmount()
    app = null
    await vi.advanceTimersByTimeAsync(6000)
    expect(onTimeout).not.toHaveBeenCalled()
    expect(toastEl()).toBeNull()
    // 牙：onBeforeUnmount 漏清 timer → 组件已死仍回调（父实例被持有；这里以节点已摘为证）。
  })
})
