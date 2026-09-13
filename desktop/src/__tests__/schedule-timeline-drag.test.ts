// 桌面时间条「横条拖拽改期」+ 撤销条（9/13 波2 · 路B）自检。
// 覆盖六组（施工图 §五）：
//   ① affordance：端柄只给 movable && canDragBar 的行（本地行/终态单/在途写一个都不留）
//   ② 端柄键盘等价（ArrowLeft/ArrowRight 一次一天；Enter 与无关键无操作）
//   ③ orderId 取自 orders prop 的真实数字 id（多行时也不取错行）
//   ④ 除零自卫：happy-dom 里 getBoundingClientRect().width 恒 0，正好当「量不到分母」的用例——
//      必须不 emit、不抛错、样式里不出现 NaN，同时键盘路径不吃几何（仍可按天增减）
//   ⑤ pointer 三态：条身=move / 左柄=start / 右柄=end，且吸附不足一天与 pointercancel 都不发请求
//   ⑥ 撤销条：已拆到同目录 undo-toast.test.ts（一个文件挂两个组件会触 vue/one-component-per-file）
// 挂载姿势：测试栈未装 @vue/test-utils，照 home-mainview.test.ts 用 createApp(组件, rootProps) 直挂
// happy-dom 节点；emit 走 rootProps 上的 onMove / onUndo（Vue 的 emit 就是查 vnode props 里的 onXxx）。
// 每条用例尾的「牙：」写明实现在哪种错法下会让这条变红。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import ScheduleTimeline from '../components/schedule/ScheduleTimeline.vue'
import type { DragEdge } from '../schedule/drag'
import type { SchedOrder } from '../schedule/types'

interface MovePayload {
  orderId: number
  edge: DragEdge
  deltaDays: number
}

// ─── 夹具 ───
/** 本地零点起 offsetDays 天的 YYYY-MM-DD（与 band.ts 日级口径同源，避开 UTC 差一天） */
function iso(offsetDays: number): string {
  const n = new Date()
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 云端可拖行：有 version + 非终态 + 两端日期齐（三者缺一即 canDragBar 判 false） */
function cloud(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 12, key: 'cloud-12', who: '桃桃', what: 'OC立绘', status: 'wip', zone: 'formal',
    startDate: iso(1), deadline: iso(6), createdAt: null, done: false, version: 3, ...p
  }
}

/** 本地记账行：无 version、startDate 恒 null（靠 createdAt 回退才进得了时间条）→ 绝不可拖 */
function local(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 7, key: 'local-7', who: '阿墨', what: '头像', status: 'in_progress', zone: 'formal',
    startDate: null, deadline: iso(5), createdAt: iso(1), done: false, ...p
  }
}

// ─── 挂载与事件工具 ───
let app: App | null = null
let root: HTMLElement | null = null

const originalRect = Element.prototype.getBoundingClientRect

/** 伪造布局宽度：happy-dom 不做布局，所有 rect 宽为 0。正向换算用例必须自己给分母。 */
function stubRectWidth(px: number): void {
  Element.prototype.getBoundingClientRect = (): DOMRect => ({
    x: 0, y: 0, top: 0, left: 0, right: px, bottom: 16, width: px, height: 16,
    toJSON: () => ({})
  })
}

/** 排空一次渲染 + 一次宏任务（Vue Transition 的收尾走 setTimeout，光 nextTick 不够） */
async function settle(): Promise<void> {
  await nextTick()
  await new Promise(r => setTimeout(r, 20))
  await nextTick()
}

function requireTarget(x: EventTarget | null): asserts x is EventTarget {
  if (!x) throw new Error('fixture element missing')
}

afterEach(async () => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  // Teleport 到 body 的撤销条若因过渡没走完而残留，手动清干净（不用 innerHTML 赋值，避免解析 HTML）
  for (const node of [...document.querySelectorAll('.undo-toast')]) node.remove()
  Element.prototype.getBoundingClientRect = originalRect
  vi.useRealTimers()
  vi.restoreAllMocks()
  await settle()
})

async function mountTimeline(orders: SchedOrder[], movable: boolean) {
  const onMove = vi.fn()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(ScheduleTimeline, { orders, movable, onMove })
  app.mount(root)
  await nextTick()
  return { host: root!, onMove }
}

/** Pointer Events 夹具：happy-dom 无 PointerEvent 构造器，用 MouseEvent 承载坐标 + 冒泡，
 *  再补 pointerId/pointerType（组件只读这四个字段，与真实浏览器行为一致）。 */
function firePointer(target: EventTarget | null, type: string, clientX: number): void {
  requireTarget(target)
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 0, button: 0 })
  Object.assign(ev, { pointerId: 1, pointerType: 'mouse' })
  target.dispatchEvent(ev)
}

/** 拖出一次位移（move 之后必须排渲染，才能看到条身跟着手指走的证据） */
async function dragTo(target: EventTarget | null, clientX: number): Promise<void> {
  firePointer(target, 'pointermove', clientX)
  await nextTick()
}

function fireKey(target: EventTarget | null, key: string): void {
  requireTarget(target)
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

function barOf(host: HTMLElement, index = 0): HTMLElement {
  const bar = host.querySelectorAll('.tl-bar')[index] as HTMLElement | undefined
  expect(bar, `第 ${index} 行横条没渲染出来（夹具日期没落进窗口？）`).toBeTruthy()
  return bar!
}
function styleOf(bar: HTMLElement): string {
  return bar.getAttribute('style') ?? ''
}
function payloadOf(spy: ReturnType<typeof vi.fn>, call = 0): MovePayload {
  const calls = spy.mock.calls as unknown as MovePayload[][]
  return calls[call][0]
}

// ══════════════════════════════════════════════════════════════
// ① affordance：端柄只给可拖行
// ══════════════════════════════════════════════════════════════
describe('ScheduleTimeline 拖拽 affordance（端柄只给可拖行）', () => {
  it('movable=true + 云端可拖行：左右各一个端柄，role/tabindex/aria-label 齐备', async () => {
    const { host } = await mountTimeline([cloud()], true)
    const start = host.querySelector('.tl-handle--start') as HTMLElement
    const end = host.querySelector('.tl-handle--end') as HTMLElement
    expect(start).toBeTruthy()
    expect(end).toBeTruthy()
    expect(host.querySelectorAll('.tl-handle')).toHaveLength(2)
    for (const hdl of [start, end]) {
      expect(hdl.getAttribute('role')).toBe('button')
      expect(hdl.getAttribute('tabindex')).toBe('0')
    }
    expect(start.getAttribute('aria-label')).toContain('开工日')
    expect(end.getAttribute('aria-label')).toContain('截稿日')
    // grab 把手与端柄同源出现（否则「看着能拖其实拖不动」）
    expect(barOf(host).classList.contains('tl-bar--movable')).toBe(true)
    // 牙：端柄无条件渲染（不看 movable/canDragBar）→ 本地模式也长出把手，本条红；
    //     端柄不带 tabindex/aria-label → 键盘与读屏拿不到改期能力，本条红。
  })

  it('movable=false（本地模式 / 在途写）：一个端柄都没有，也不给 grab 光标', async () => {
    const { host } = await mountTimeline([cloud()], false)
    expect(host.querySelectorAll('.tl-handle')).toHaveLength(0)
    expect(barOf(host).classList.contains('tl-bar--movable')).toBe(false)
    // 牙：把 movable 只当视觉开关（端柄照渲、pointerdown 照接）→ 这里会数到 2 个端柄。
  })

  it('本地行（无 version）与终态单（done/cancelled）都不可拖——判定一律走 canDragBar', async () => {
    const { host } = await mountTimeline(
      [
        local(),
        cloud({ key: 'cloud-21', id: 21, status: 'done', done: true }),
        cloud({ key: 'cloud-22', id: 22, status: 'cancelled' }),
        cloud() // 唯一的可拖行
      ],
      true
    )
    const bars = [...host.querySelectorAll('.tl-bar')]
    expect(bars.length).toBeGreaterThanOrEqual(4) // 四行都进了时间条，差别只在能不能拖
    expect(host.querySelectorAll('.tl-handle')).toHaveLength(2) // 只有 cloud-12 长出一对
    expect(bars.filter(b => b.classList.contains('tl-bar--movable'))).toHaveLength(1)
    // 牙：组件里自己抄一份终态名单（漏掉 cancelled 或 delivered）、或对本地行放宽 version 判定
    //     → 端柄数会多出来；反过来若在这里把 done 行整行裁掉不渲染 → 第一句行数断言红。
  })

  it('缺任一日期端（canDragBar 的「两端齐」）：本来就不该出现手柄', async () => {
    const { host } = await mountTimeline(
      [
        cloud({ key: 'cloud-31', id: 31, deadline: null }),
        cloud({ key: 'cloud-32', id: 32, startDate: null, createdAt: null })
      ],
      true
    )
    expect(host.querySelectorAll('.tl-bar')).toHaveLength(0) // 缺端子的单不进时间条（诚实缺席）
    expect(host.querySelectorAll('.tl-handle')).toHaveLength(0)
    // 牙：若有人放开 timeline.ts 的缺席口径、又放开 canDragBar，端柄会挂在一条没有起点的条上。
  })
})

// ══════════════════════════════════════════════════════════════
// ② 端柄键盘等价
// ══════════════════════════════════════════════════════════════
describe('端柄键盘等价（一次一天，与吸附粒度同口径）', () => {
  it('右端柄 ArrowRight → {edge:"end", deltaDays:1}；左端柄 ArrowLeft → {edge:"start", deltaDays:-1}', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true)
    fireKey(host.querySelector('.tl-handle--end'), 'ArrowRight')
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(payloadOf(onMove)).toEqual({ orderId: 12, edge: 'end', deltaDays: 1 })

    fireKey(host.querySelector('.tl-handle--start'), 'ArrowLeft')
    expect(onMove).toHaveBeenCalledTimes(2)
    expect(payloadOf(onMove, 1)).toEqual({ orderId: 12, edge: 'start', deltaDays: -1 })
    // 牙：两柄共用一个 handler 且 edge 写死 → 第二条断言的 edge 会是 'end'；
    //     把「一天」写成像素粒度（deltaDays: 8 之类）→ 数值断言红。
  })

  it('Enter / 上下一类无关键 / 字母键：不发请求（键盘路径不接受半成品意图）', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true)
    const end = host.querySelector('.tl-handle--end')
    for (const key of ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Tab', 'a']) {
      fireKey(end, key)
    }
    expect(onMove).not.toHaveBeenCalled()
    // 牙：把 Enter 当「确认改期」、或分支漏了 return → 这里会多出请求。
  })

  it('量不到分母（track 宽 0）时键盘照常工作：自卫只挡像素换算，不挡键盘', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true) // 刻意不 stub rect
    fireKey(host.querySelector('.tl-handle--start'), 'ArrowRight')
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(payloadOf(onMove).deltaDays).toBe(1)
    // 牙：把除零自卫写在 rowDraggable / emit 入口（而不是只写在像素换算那条路上）→ 键盘一起被闸死。
  })
})

// ══════════════════════════════════════════════════════════════
// ③ orderId 来源
// ══════════════════════════════════════════════════════════════
describe('orderId 取自 orders prop（不切 row.key 字符串）', () => {
  it('payload.orderId 是数字 id（12），不是 "cloud-12"', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true)
    fireKey(host.querySelector('.tl-handle--end'), 'ArrowRight')
    const p = payloadOf(onMove)
    expect(typeof p.orderId).toBe('number')
    expect(p.orderId).toBe(12)
    // 牙：拿 key.slice('cloud-'.length) 凑 id（哪怕 Number() 过一遍）→ 这条仍能红在下一句：
    //     见下面「本地行 local-7」用例，切字符串会把本地单也 emit 出 id 7。
  })

  it('两行都在时，第二行的端柄只 emit 自己的 id（防「永远取第一条」）', async () => {
    const { host, onMove } = await mountTimeline(
      [cloud(), cloud({ id: 31, key: 'cloud-31', who: '阿绫', startDate: iso(8), deadline: iso(12) })],
      true
    )
    const endHandles = host.querySelectorAll('.tl-handle--end')
    expect(endHandles).toHaveLength(2)
    fireKey(endHandles[1], 'ArrowRight')
    expect(payloadOf(onMove).orderId).toBe(31)
    // 牙：handler 闭包捕获了 rows[0]、或用了模块级「当前单」变量 → 这里 emit 的是 12。
  })

  it('orders 里回不去的行（本地行 local-7）不产生任何可拖面，pointer 拖也不 emit', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([local()], true)
    expect(host.querySelectorAll('.tl-handle')).toHaveLength(0)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(window, 260)
    firePointer(window, 'pointerup', 260)
    expect(onMove).not.toHaveBeenCalled()
    // 牙：id 从 key 上切（'local-7'.slice(6) → 7）＋不看 version → 会给本地单发云端写请求（必 404/403）。
  })
})

// ══════════════════════════════════════════════════════════════
// ④ 除零自卫（happy-dom 默认 track 宽 0）
// ══════════════════════════════════════════════════════════════
describe('量不到 track 宽时的除零自卫', () => {
  it('trackWidth=0：拖 160px 不 emit、不抛错、样式里没有 NaN，松手后条回原位', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    expect(() => {
      firePointer(bar, 'pointerdown', 100)
      firePointer(bar, 'pointermove', 260)
      firePointer(bar, 'pointerup', 260)
    }).not.toThrow()
    await nextTick()
    expect(onMove).not.toHaveBeenCalled()
    expect(styleOf(bar)).not.toContain('NaN')
    expect(styleOf(bar)).not.toContain('Infinity')
    expect(styleOf(bar)).not.toContain('translateX') // 松手即回原位（吸附 0 天＝不发假请求）
    // 牙：自己写 deltaPx / (width / days) 而不走 pxToDays → 0 除出 Infinity/NaN 并被 emit
    //     （且条身留下 NaNpx 的样式）→ 三处断言全红。
  })

  it('拖中（未松手）同样不许出现 NaN；pointercancel 收尾也不 emit', async () => {
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(bar, 260)
    expect(styleOf(bar)).not.toContain('NaN')
    firePointer(bar, 'pointercancel', 260)
    await nextTick()
    expect(onMove).not.toHaveBeenCalled()
    expect(styleOf(bar)).not.toContain('translateX')
    // 牙：pointercancel 当 pointerup 处理（按位移发请求）→ 触摸被打断时会写出一笔画师没做的改期。
  })
})

// ══════════════════════════════════════════════════════════════
// ⑤ pointer 三态（分母给真值：track 600px ÷ 窗口 30 天 = 20px/天）
// ══════════════════════════════════════════════════════════════
describe('横条 pointer 拖拽（600px ÷ 30 天 ⇒ 20px/天）', () => {
  it('条身拖 +100px → 整条平移 edge="move" deltaDays=5，且拖中有实时视觉位移', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(bar, 200)
    expect(styleOf(bar)).toMatch(/translateX\(100px\)/) // 条跟着手指走（不是松手才跳）
    expect(bar.classList.contains('tl-bar--drag')).toBe(true)
    expect(onMove).not.toHaveBeenCalled() // 拖中一个请求都不发
    firePointer(bar, 'pointerup', 200)
    await nextTick()
    expect(payloadOf(onMove)).toEqual({ orderId: 12, edge: 'move', deltaDays: 5 })
    expect(bar.classList.contains('tl-bar--drag')).toBe(false)
    // 牙：拖中就 emit（每移一像素打两次 PUT）→ 「拖中不发请求」红；
    //     只有松手才跳（无本地位移）→ translateX 红；把条身拖当成 end 改期 → edge 红。
  })

  it('右端柄拖 +60px → edge="end" deltaDays=3（只改宽度：左端不动、不整条平移）', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const end = host.querySelector('.tl-handle--end') as HTMLElement
    const bar = barOf(host)
    const leftBefore = (styleOf(bar).match(/left:\s*([^;]+)/) ?? [])[1]
    firePointer(end, 'pointerdown', 100)
    await dragTo(end, 160)
    expect(styleOf(bar)).not.toContain('translateX') // 改期不是平移
    expect((styleOf(bar).match(/left:\s*([^;]+)/) ?? [])[1]).toBe(leftBefore) // 左端钉住
    expect(styleOf(bar)).toContain('calc(') // 宽度按位移补
    firePointer(end, 'pointerup', 160)
    await nextTick()
    expect(payloadOf(onMove)).toEqual({ orderId: 12, edge: 'end', deltaDays: 3 })
    // 牙：端柄 pointerdown 不挡冒泡 → 条身的 move 分支二次接管，emit 出 edge:'move'（本条红）；
    //     端柄复用 transform → translateX 与 left 变化两处红。
  })

  it('左端柄拖 -40px → edge="start" deltaDays=-2，且拖中 left 与 width 反向补偿', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const start = host.querySelector('.tl-handle--start') as HTMLElement
    const bar = barOf(host)
    firePointer(start, 'pointerdown', 300)
    await dragTo(start, 260)
    // 视觉位移在松手前就已落进样式（百分比与像素相加，绝不出现「百分比 × 长度」）
    expect(styleOf(bar)).toContain('calc(')
    expect(styleOf(bar)).not.toMatch(/\d%\s*\*/)
    expect(styleOf(bar)).not.toContain('translateX')
    firePointer(start, 'pointerup', 260)
    await nextTick()
    expect(payloadOf(onMove)).toEqual({ orderId: 12, edge: 'start', deltaDays: -2 })
    // 牙：符号算反（往左拖当成往后推）→ deltaDays 变 +2 红；
    //     用 calc(N% * ratio) 这类非法乘法语义（9/4 波1 的坑）→ 乘法规则断言红。
  })

  it('吸附不足半天（+5px < 10px 阈值）→ 不 emit，条弹回原位', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(bar, 105)
    expect(styleOf(bar)).toMatch(/translateX\(5px\)/) // 拖中照跟手（视觉不吞小位移）
    firePointer(bar, 'pointerup', 105)
    await nextTick()
    expect(onMove).not.toHaveBeenCalled()
    expect(styleOf(bar)).not.toContain('translateX')
    // 牙：只要 dx !== 0 就 emit（不做日级吸附）→ 手抖 1px 也发两次 PUT + 抬 version → 红。
  })

  it('鼠标右/中键按下不开拖（button!==0 直接拒），后续 move/up 也不发请求', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, button: 2 })
    Object.assign(down, { pointerId: 1, pointerType: 'mouse' })
    bar.dispatchEvent(down)
    await dragTo(bar, 300)
    firePointer(bar, 'pointerup', 300)
    await nextTick()
    expect(onMove).not.toHaveBeenCalled()
    expect(styleOf(bar)).not.toContain('translateX')
    // 牙：不看 e.button → Windows 上右键长按/中键拖动会被当成改期写。
  })

  it('一次拖拽只 emit 一次，emit 后本地位移即清零（重复 up 不吃第二下）', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], true)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(bar, 220)
    firePointer(bar, 'pointerup', 220)
    firePointer(bar, 'pointerup', 220) // 重复松手（真实浏览器会：捕获丢失补发一次 up）
    await nextTick()
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(payloadOf(onMove).deltaDays).toBe(6)
    // 牙：收尾不摘 window 监听 → 第二次 up 仍进 onDragEnd，同一天被写两遍（第二遍必吃 409）。
  })

  it('movable=false 时 pointer 拖一条也不发请求（总闸门真的闸住）', async () => {
    stubRectWidth(600)
    const { host, onMove } = await mountTimeline([cloud()], false)
    const bar = barOf(host)
    firePointer(bar, 'pointerdown', 100)
    await dragTo(bar, 300)
    firePointer(bar, 'pointerup', 300)
    await nextTick()
    expect(onMove).not.toHaveBeenCalled()
    expect(styleOf(bar)).not.toContain('translateX')
    // 牙：beginDrag 少一句 rowDraggable 自卫（只靠「没渲染端柄」）→ 条身仍能起拖，红。
  })
})

// ⑥ 撤销条 UndoToast 的用例已拆到同目录 undo-toast.test.ts（一个测试文件挂两个组件会触
//    vue/one-component-per-file，桌面门禁口径是 0 错 0 警；拆开后撤销件有独立用例面）。
