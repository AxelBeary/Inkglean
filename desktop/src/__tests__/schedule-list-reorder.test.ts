// 波2 拖排（9/13 批 · 路A）自检：ScheduleList 的拖拽可供性 + 两条等价路径（鼠标 / Alt+方向键）。
// 覆盖施工图 §五 六条：
//   ① 可拖态才给可供性（draggable=true / tabindex=0 / ⠿ 走 CSS 类），且绝不新增 grip 节点；
//   ② 鼠标路径 emit 的 orderedIds 是**整段正式区新序**（缓冲区一条都不许混进去）；
//   ③ 键盘路径 Alt+↑/↓ 与鼠标共用同一条 emit 腿（载荷逐字段同款），首行 Alt+↑ 不动；
//   ④ reorderable=false：零可供性 + 模拟拖拽不 emit；
//   ⑤ 混合区（正式 2 + 缓冲 1）只有正式区两行可拖，缓冲区既不进数组也不当落点；
//   ⑥ 反向验证意识：整段长度/无重无漏/不含缓冲 id 三处都有硬断言——把数组算成"只含被拖那一条"
//      或"顺手把缓冲区混进去"，②⑤ 的用例立刻变红（详见交付报告）。
// 挂载兜底：测试栈未装 @vue/test-utils（本批禁加依赖），用 createApp + h() + nextTick 直挂 happy-dom 节点。
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, nextTick, h } from 'vue'
import type { App } from 'vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import ScheduleList from '../components/schedule/ScheduleList.vue'
import { reorderIds } from '../schedule/drag'
import type { SchedOrder } from '../schedule/types'

/** 组件 emit 的载荷形状（与 ScheduleList 的 defineEmits 逐字段对齐） */
interface ReorderPayload {
  orderedIds: number[]
  oldIndex: number
  newIndex: number
}

// ─── 夹具 ───

/** 云端正式区行（带 version＝可拖）；zone / version / 文案都可覆写，用以造缓冲区行与本地记账行 */
function cloud(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 1, key: 'cloud-1', who: '桃桃', what: 'OC立绘', status: 'wip',
    zone: 'formal', startDate: null, deadline: '2026-09-20', createdAt: null,
    done: false, version: 1, ...p
  }
}

// ─── 挂载工具（只挂本组件，传 props；不挂整页，页级用例归 schedule-view.test.ts）───
let app: App | null = null
let host: HTMLElement | null = null

afterEach(() => {
  if (app) { app.unmount(); app = null }
  if (host) { host.remove(); host = null }
})

async function mountList(opts: {
  orders: SchedOrder[]
  reorderable: boolean
  slotText?: string
}): Promise<{ root: HTMLElement; emitted: ReorderPayload[] }> {
  const emitted: ReorderPayload[] = []
  const root = document.createElement('div')
  document.body.appendChild(root)
  const instance = createApp({
    render: () => h(ScheduleList, {
      orders: opts.orders,
      slotText: opts.slotText ?? '',
      reorderable: opts.reorderable,
      onReorder: (p: ReorderPayload) => { emitted.push(p) }
    })
  })
  instance.mount(root)
  await nextTick()
  app = instance
  host = root
  return { root, emitted }
}

// ─── DOM / 事件兜底 ───

// draggable 既可能被 Vue 写成属性，也可能因测试内核把 IDL property 一施了之（不反射成属性），
// 两种都认（与 home-mainview.test.ts 的 isInert 同款理由），否则这条断言测了等于没测。
function draggableOf(el: Element): string | null {
  const attr = el.getAttribute('draggable')
  if (attr !== null) return attr
  const prop = (el as HTMLElement).draggable
  if (typeof prop === 'boolean') return String(prop)
  if (typeof prop === 'string') return prop
  return null
}

/** DataTransfer 替身：happy-dom 不保证有 DataTransfer，自建一个把 setData 记账下来——
 *  只有这样才能真断言「dragstart 有没有按 8/25 实测口径 setData + 标 effectAllowed」。 */
function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    store,
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (fmt: string, val: string) => { store[fmt] = val },
    getData: (fmt: string) => store[fmt] ?? '',
    setDragImage: () => undefined
  }
}
type DataTransferLike = ReturnType<typeof makeDataTransfer>

/** 派发拖拽事件：用 MouseEvent 造壳（happy-dom 到处都有），再把 dataTransfer 钉上去。
 *  组件只认 e.dataTransfer / e.preventDefault，不认事件构造函数，故真拖与假壳同一条代码。 */
function fireDrag(el: Element, type: string, dt: DataTransferLike, clientY = 0): Event {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientY })
  Object.defineProperty(ev, 'dataTransfer', { value: dt })
  el.dispatchEvent(ev)
  return ev
}

function fireKey(el: Element, key: string, alt: boolean): Event {
  const ev = new KeyboardEvent('keydown', { key, altKey: alt, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

/** 按区头认行（正式区/缓冲区），不依赖"哪区先渲染"这种实现细节 */
function rowsOfZone(root: HTMLElement, zoneText: string): HTMLElement[] {
  const zones = [...root.querySelectorAll('.list-zone')]
  const zone = zones.find(z => (z.querySelector('.zh')?.textContent ?? '').includes(zoneText))
  return zone ? [...zone.querySelectorAll('.q-item')] as HTMLElement[] : []
}

// ══════════════════════════════════════════════════════════════
// ① 可拖态的可供性
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 拖排：可拖态才给可供性', () => {
  it('reorderable=true 且正式区≥2行：整行 draggable=true + tabindex=0 + 可拖类 + 读屏按键提示', async () => {
    const { root } = await mountList({
      orders: [cloud({ id: 11, key: 'cloud-11' }), cloud({ id: 12, key: 'cloud-12', version: 2 })],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(draggableOf(r)).toBe('true')
      expect(r.getAttribute('tabindex')).toBe('0')
      // ⠿ 是 CSS 伪元素（.q-item--movable::before），类在＝点位在；不新增 grip 节点
      expect(r.classList.contains('q-item--movable')).toBe(true)
      expect(r.getAttribute('aria-label')).toContain('Alt')
    }
    expect(root.querySelector('.grip')).toBeNull()
  })

  it('读屏文案逐字段为真：位次 + 客户·档位 + 截稿日（走文本插值，不硬编码在模板里）', async () => {
    const { root } = await mountList({
      orders: [
        cloud({ id: 11, key: 'cloud-11', who: '阿桃', what: '半身', deadline: '2026-09-20' }),
        cloud({ id: 12, key: 'cloud-12', version: 2, who: '小满', what: '立绘', deadline: '2026-09-28' })
      ],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    expect(rows[0].getAttribute('aria-label')).toBe('第 1 位，阿桃·半身，截稿 2026-09-20，按住 Alt 加上下方向键改顺序')
    expect(rows[1].getAttribute('aria-label')).toBe('第 2 位，小满·立绘，截稿 2026-09-28，按住 Alt 加上下方向键改顺序')
  })
})

// ══════════════════════════════════════════════════════════════
// ② 鼠标路径（原生 HTML5 dnd）
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 拖排：鼠标 dragstart→dragover→drop', () => {
  it('把首行拖到末行：emit 整段正式区新序，oldIndex/newIndex 与 orderedIds 同源同一次计算', async () => {
    const { root, emitted } = await mountList({
      orders: [
        cloud({ id: 11, key: 'cloud-11', version: 1 }),
        cloud({ id: 12, key: 'cloud-12', version: 2 }),
        cloud({ id: 13, key: 'cloud-13', version: 3 })
      ],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    const dt = makeDataTransfer()

    fireDrag(rows[0], 'dragstart', dt)
    // 8/25 实测坑：WebView2 下不 setData / 不标 effectAllowed 就起不了拖
    expect(dt.store['text/plain']).toBe('11')
    expect(dt.effectAllowed).toBe('move')

    const over = fireDrag(rows[2], 'dragover', dt)
    expect(over.defaultPrevented).toBe(true) // 不放行，浏览器根本不会给 drop
    fireDrag(rows[2], 'drop', dt)

    expect(emitted).toHaveLength(1)
    const p = emitted[0]
    expect(p.oldIndex).toBe(0)
    expect(p.newIndex).toBe(2)
    expect(p.orderedIds).toEqual([12, 13, 11])
    // 三段必须出自同一次 reorderIds()：任何一处单独拼凑都会让这条变红
    expect(p.orderedIds).toEqual(reorderIds([11, 12, 13], p.oldIndex, p.newIndex))
    // 整段（不是被拖那一条）：长度与集合都跟原序一致，无重无漏
    expect(p.orderedIds).toHaveLength(3)
    expect([...p.orderedIds].sort((a, b) => a - b)).toEqual([11, 12, 13])
    expect(new Set(p.orderedIds).size).toBe(3)
  })

  it('下移一格与向上拖到首格都按目标格落位（落点＝dragover 记下的那行下标）', async () => {
    const { root, emitted } = await mountList({
      orders: [
        cloud({ id: 21, key: 'cloud-21' }),
        cloud({ id: 22, key: 'cloud-22', version: 2 }),
        cloud({ id: 23, key: 'cloud-23', version: 3 })
      ],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    fireDrag(rows[0], 'dragstart', makeDataTransfer())
    fireDrag(rows[1], 'dragover', makeDataTransfer())
    fireDrag(rows[1], 'drop', makeDataTransfer())
    expect(emitted[0]).toEqual({ orderedIds: [22, 21, 23], oldIndex: 0, newIndex: 1 })

    emitted.length = 0
    fireDrag(rows[2], 'dragstart', makeDataTransfer())
    fireDrag(rows[0], 'dragover', makeDataTransfer())
    fireDrag(rows[0], 'drop', makeDataTransfer())
    expect(emitted[0]).toEqual({ orderedIds: [23, 21, 22], oldIndex: 2, newIndex: 0 })
  })

  it('拖回自己头上＝序没变：不 emit（不发白写的请求），且拖拽态类清干净', async () => {
    const { root, emitted } = await mountList({
      orders: [cloud({ id: 31, key: 'cloud-31' }), cloud({ id: 32, key: 'cloud-32', version: 2 })],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    const dt = makeDataTransfer()
    fireDrag(rows[0], 'dragstart', dt)
    fireDrag(rows[0], 'dragover', dt)
    await nextTick()
    expect(rows[0].classList.contains('q-item--dragging')).toBe(true) // 拖中本行有反馈
    fireDrag(rows[0], 'drop', dt)
    await nextTick()
    expect(emitted).toHaveLength(0)
    for (const r of rows) {
      expect(r.classList.contains('q-item--dragging')).toBe(false)
      expect(r.classList.contains('q-item--over')).toBe(false)
    }
  })

  it('拖过别的行会抬起落点线；中途放弃（只 dragend 不 drop）不写、视觉态归零', async () => {
    const { root, emitted } = await mountList({
      orders: [cloud({ id: 41, key: 'cloud-41' }), cloud({ id: 42, key: 'cloud-42', version: 2 })],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    const dt = makeDataTransfer()
    fireDrag(rows[0], 'dragstart', dt)
    fireDrag(rows[1], 'dragover', dt)
    await nextTick()
    expect(rows[1].classList.contains('q-item--over')).toBe(true)
    expect(rows[0].classList.contains('q-item--over')).toBe(false) // 拖到自己头上不画线

    fireDrag(rows[0], 'dragend', dt)
    fireDrag(rows[1], 'drop', dt) // 状态已清，这记 drop 不该再写第二次
    await nextTick()
    expect(emitted).toHaveLength(0)
    expect(rows[1].classList.contains('q-item--over')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// ③ 键盘等价路径
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 拖排：Alt + ↑/↓ 键盘等价', () => {
  function orders(): SchedOrder[] {
    return [
      cloud({ id: 51, key: 'cloud-51', version: 1 }),
      cloud({ id: 52, key: 'cloud-52', version: 2 }),
      cloud({ id: 53, key: 'cloud-53', version: 3 })
    ]
  }

  it('Alt+ArrowDown 把该行下移一位：载荷与鼠标路径逐字段同款', async () => {
    const { root, emitted } = await mountList({ orders: orders(), reorderable: true })
    const rows = rowsOfZone(root, '正式区')
    const ev = fireKey(rows[0], 'ArrowDown', true)
    expect(ev.defaultPrevented).toBe(true) // 拦下默认滚动，否则按一次滚半页
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual({ orderedIds: [52, 51, 53], oldIndex: 0, newIndex: 1 })

    // 同款口径：把 51 拖到 52 那一格，应产出完全一样的三段载荷
    const { root: r2, emitted: byMouse } = await mountList({ orders: orders(), reorderable: true })
    const rows2 = rowsOfZone(r2, '正式区')
    const dt = makeDataTransfer()
    fireDrag(rows2[0], 'dragstart', dt)
    fireDrag(rows2[1], 'dragover', dt)
    fireDrag(rows2[1], 'drop', dt)
    expect(byMouse).toHaveLength(1)
    expect(byMouse[0]).toEqual(emitted[0])
  })

  it('首行 Alt+ArrowUp / 末行 Alt+ArrowDown：越界被吞，不 emit（序列没变＝不写）', async () => {
    const { root, emitted } = await mountList({ orders: orders(), reorderable: true })
    const rows = rowsOfZone(root, '正式区')
    fireKey(rows[0], 'ArrowUp', true)
    fireKey(rows[2], 'ArrowDown', true)
    expect(emitted).toHaveLength(0)
  })

  it('中间行 Alt+ArrowUp 上移一位；不带 Alt 的方向键不改序（不抢正常翻行）', async () => {
    const { root, emitted } = await mountList({ orders: orders(), reorderable: true })
    const rows = rowsOfZone(root, '正式区')
    fireKey(rows[1], 'ArrowUp', true)
    expect(emitted[0]).toEqual({ orderedIds: [52, 51, 53], oldIndex: 1, newIndex: 0 })
    emitted.length = 0
    fireKey(rows[1], 'ArrowDown', false)
    fireKey(rows[1], 'PageDown', true)
    expect(emitted).toHaveLength(0)
  })

  it('不可拖态下行上按 Alt+↓：既不 emit 也不 preventDefault（键盘路径同样零可供性）', async () => {
    const { root, emitted } = await mountList({
      orders: [cloud({ id: 54, key: 'cloud-54' }), cloud({ id: 55, key: 'cloud-55', version: 2 })],
      reorderable: false
    })
    const rows = rowsOfZone(root, '正式区')
    const ev = fireKey(rows[0], 'ArrowDown', true)
    expect(emitted).toHaveLength(0)
    expect(ev.defaultPrevented).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// ④ 不可拖态（本地模式 / 在途写 / 只有一行）
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 拖排：reorderable=false 零可供性', () => {
  it('两行也不给拖：无 draggable=true、无 tabindex、无 ⠿ 类，模拟拖拽不 emit', async () => {
    const { root, emitted } = await mountList({
      orders: [cloud({ id: 61, key: 'cloud-61' }), cloud({ id: 62, key: 'cloud-62', version: 2 })],
      reorderable: false
    })
    const rows = rowsOfZone(root, '正式区')
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(draggableOf(r)).toBe('false')
      expect(r.hasAttribute('tabindex')).toBe(false)
      expect(r.classList.contains('q-item--movable')).toBe(false)
      expect(r.getAttribute('aria-label')).not.toContain('Alt')
    }
    const dt = makeDataTransfer()
    fireDrag(rows[0], 'dragstart', dt)
    fireDrag(rows[1], 'dragover', dt)
    fireDrag(rows[1], 'drop', dt)
    expect(emitted).toHaveLength(0)
    expect(dt.store['text/plain']).toBeUndefined() // 连拖都没让起
  })

  it('本地记账行（无 version）即便宿主误开 reorderable 也不可拖：整段认不全就整段禁', async () => {
    const { root, emitted } = await mountList({
      orders: [
        cloud({ id: 71, key: 'local-71', version: undefined }),
        cloud({ id: 72, key: 'local-72', version: undefined })
      ],
      reorderable: true
    })
    const rows = rowsOfZone(root, '正式区')
    for (const r of rows) {
      expect(draggableOf(r)).toBe('false')
      expect(r.classList.contains('q-item--movable')).toBe(false)
    }
    const dt = makeDataTransfer()
    fireDrag(rows[0], 'dragstart', dt)
    fireDrag(rows[1], 'dragover', dt)
    fireDrag(rows[1], 'drop', dt)
    expect(emitted).toHaveLength(0)
  })

  it('正式区只剩一行：没什么可拖，不给可供性', async () => {
    const { root } = await mountList({ orders: [cloud({ id: 81, key: 'cloud-81' })], reorderable: true })
    const rows = rowsOfZone(root, '正式区')
    expect(rows).toHaveLength(1)
    expect(draggableOf(rows[0])).toBe('false')
    expect(rows[0].hasAttribute('tabindex')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// ⑤ 混合区：缓冲区既不进数组，也不当落点
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 拖排：正式区 2 行 + 缓冲区 1 行', () => {
  function mixed(): SchedOrder[] {
    return [
      cloud({ id: 91, key: 'cloud-91', version: 1 }),
      cloud({ id: 92, key: 'cloud-92', version: 2 }),
      cloud({ id: 93, key: 'cloud-93', version: 3, zone: 'buffer', who: '候补', what: '档期' })
    ]
  }

  it('只有正式区两行可拖，缓冲区行零可供性', async () => {
    const { root } = await mountList({ orders: mixed(), reorderable: true })
    const formal = rowsOfZone(root, '正式区')
    const buffer = rowsOfZone(root, '缓冲区')
    expect(formal).toHaveLength(2)
    expect(buffer).toHaveLength(1)
    for (const r of formal) expect(draggableOf(r)).toBe('true')
    expect(draggableOf(buffer[0])).toBe('false')
    expect(buffer[0].hasAttribute('tabindex')).toBe(false)
    expect(buffer[0].classList.contains('q-item--movable')).toBe(false)
  })

  it('emit 的 orderedIds 里没有缓冲区 id，长度只等于正式区', async () => {
    const { root, emitted } = await mountList({ orders: mixed(), reorderable: true })
    const formal = rowsOfZone(root, '正式区')
    const dt = makeDataTransfer()
    fireDrag(formal[0], 'dragstart', dt)
    fireDrag(formal[1], 'dragover', dt)
    fireDrag(formal[1], 'drop', dt)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual({ orderedIds: [92, 91], oldIndex: 0, newIndex: 1 })
    expect(emitted[0].orderedIds).not.toContain(93)
    expect(emitted[0].orderedIds).toHaveLength(2)
  })

  it('把缓冲区行当落点（拖到缓冲区上方松手）：不落正式区行＝不写', async () => {
    const { root, emitted } = await mountList({ orders: mixed(), reorderable: true })
    const formal = rowsOfZone(root, '正式区')
    const buffer = rowsOfZone(root, '缓冲区')
    const dt = makeDataTransfer()
    fireDrag(formal[0], 'dragstart', dt)
    fireDrag(buffer[0], 'dragover', dt)
    fireDrag(buffer[0], 'drop', dt)
    expect(emitted).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// ⑥ 静态红线哨兵（视觉纪律是硬约束，行为测试测不到 CSS 里的硬编码色与野生圆角）
// ══════════════════════════════════════════════════════════════
describe('ScheduleList 视觉纪律（直接读 SFC 源码，不跑样式）', () => {
  // 路径算法刻意不用 new URL(..., import.meta.url)：happy-dom 把自己的 URL 挂成全局，
  // 相对路径会被它按 http://localhost:3000 解析掉（实测），拿不到真实磁盘路径。
  const sfcPath = resolve(
    dirname(fileURLToPath(import.meta.url)), '../components/schedule/ScheduleList.vue'
  )
  const sfc = readFileSync(sfcPath, 'utf8')

  it('版式一列不加、行高一像素不改：grid-template-columns 与 --row 保持 827/828 终验值', () => {
    expect(sfc.match(/grid-template-columns:/g)).toHaveLength(1)
    expect(sfc).toContain('grid-template-columns: 14px minmax(0, 1fr) auto auto;')
    expect(sfc).toContain('height: var(--row, 52px)')
  })

  it('⠿ 只走 CSS 伪元素压在 14px 点色列上，且只在可拖行出现', () => {
    expect(sfc).toContain('.q-item--movable::before')
    expect(sfc).toContain("content: '⠿'")
    expect(sfc).toContain('opacity: 0;') // 默认不露脸
    expect(sfc).not.toContain('class="grip"')
  })

  it('颜色只取 token：无 #hex、无硬编码墨值、无 white/black 关键字；圆角只用既有变量', () => {
    const css = sfc.slice(sfc.indexOf('<style'))
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba\(\s*38\s*,/)
    expect(css).not.toMatch(/(color|background|border-color)\s*:\s*(white|black)\b/)
    expect(css).not.toMatch(/border-radius:\s*\d+(\.\d+)?px/)
    expect(css).toContain('rgba(var(--ink-rgb)') // 暗色靠它翻转
  })

  it('文案全走插值，无 v-html；未引入第三方拖拽库（纯函数仍从 schedule/drag import）', () => {
    expect(sfc).not.toContain('v-html')
    expect(sfc).not.toMatch(/vuedraggable|sortablejs|Sortable/)
    expect(sfc).toContain("from '../../schedule/drag'")
  })
})
