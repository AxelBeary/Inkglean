// U090: 拼图 Canvas 横坐标必须按前面每张的真实宽度累加。
// 旧实现 x0 + ci*(it.w+GAP) 等于假设同行每张都与「当前这张」等宽——异宽是常态，
// 第 2 张起重叠/留白；而画布宽度 canvasW 走的是真累加（rowWidths），
// 于是画布尺寸对、内容错，导出成品破损且无任何报错。
// 本用例构造两行、每行 3 张不同宽高比的假图，直接断言 drawImage 的 x 坐标与画布总宽。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  getAllOrders: vi.fn(),
  getOrder: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getAllOrders: h.getAllOrders,
    getOrder: h.getOrder
  }
}))

import PuzzlePage from '../PuzzlePage.vue'

// 与组件内常量同口径（组件未导出，只能就地复写；数字变了本用例应当红）
const TARGET_H = 400
const GAP = 8

// 宽度 = TARGET_H × (naturalWidth/naturalHeight)：500 / 400 / 300 与 350 / 250 / 450
// 第一行 500+400+300 再加第 4 张会超 MAX_ROW_WIDTH(1500) → 折成两行
const IMAGE_DIMS: Record<string, { w: number; h: number }> = {
  'a.png': { w: 1250, h: 1000 }, // 500
  'b.png': { w: 1000, h: 1000 }, // 400
  'c.png': { w: 750, h: 1000 }, // 300
  'd.png': { w: 875, h: 1000 }, // 350
  'e.png': { w: 625, h: 1000 }, // 250
  'f.png': { w: 1125, h: 1000 } // 450
}

/** happy-dom 不真加载图片：按 src 查表回填尺寸后同步触发 onload（组件先挂 onload 再赋 src） */
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  naturalWidth = 0
  naturalHeight = 0
  private _src = ''
  set src(v: string) {
    this._src = v
    const d = IMAGE_DIMS[v]
    if (!d) {
      this.onerror?.()
      return
    }
    this.naturalWidth = d.w
    this.naturalHeight = d.h
    this.onload?.()
  }
  get src() {
    return this._src
  }
}

interface PickLike {
  key: string
  kind: 'deliverable' | 'reference'
  name: string
  url: string
}

interface PuzzlePageVM {
  onOrderChange: (id: number) => Promise<void>
  buildCanvas: (imgs: PickLike[]) => Promise<HTMLCanvasElement | null>
}

function pickItems(urls: string[]): PickLike[] {
  return urls.map((u, i) => ({ key: 'd-' + i, kind: 'deliverable' as const, name: u, url: u }))
}

async function mountWithOrder() {
  h.getAllOrders.mockResolvedValue([{ id: 1, order_no: 'A', tier_name: 'T', client_name: 'x' }])
  h.getOrder.mockResolvedValue({ id: 1, order_no: 'A', deliverables: [], references: [] })
  const wrapper = shallowMount(PuzzlePage, {
    global: { mocks: { $t: (key: string) => key, $tm: () => [] } }
  })
  await flushPromises()
  const vm = wrapper.vm as unknown as PuzzlePageVM
  // 选中订单后模板才渲染 <canvas ref="previewCanvas">（buildCanvas 依赖该模板 ref）
  await vm.onOrderChange(1)
  await flushPromises()
  return { wrapper, vm }
}

describe('PuzzlePage 拼图横坐标（U090）', () => {
  let ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    h.getAllOrders.mockReset()
    h.getOrder.mockReset()
    vi.stubGlobal('Image', FakeImage)
    ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('同行异宽：每张 x = 前序宽度累加 + 间隔数 × GAP，画布宽按真实累加', async () => {
    const { vm } = await mountWithOrder()
    const items = pickItems(['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png'])

    const canvas = await vm.buildCanvas(items)
    expect(canvas).not.toBeNull()

    // 画布宽取两行里更宽的那行：500+400+300 + 2×8 = 1216
    expect(canvas!.width).toBe(1216)
    expect(canvas!.height).toBe(2 * TARGET_H + GAP)

    const calls = ctx.drawImage.mock.calls
    expect(calls).toHaveLength(6)

    // 第一行 1216 宽占满画布 → x0 = 0；第二行 1066 宽居中 → x0 = (1216-1066)/2 = 75
    const expected = [
      { x: 0, y: 0 }, // a 500
      { x: 508, y: 0 }, // +400+8
      { x: 916, y: 0 }, // +300+8
      { x: 75, y: 408 }, // d 350
      { x: 433, y: 408 }, // +250+8
      { x: 691, y: 408 } // +450+8
    ]
    expected.forEach((e, i) => {
      expect(calls[i][1]).toBe(e.x)
      expect(calls[i][2]).toBe(e.y)
    })

    // 每张都按自身宽度绘制（宽高比不被拉伸）
    expect(calls.map((c) => c[3])).toEqual([500, 400, 300, 350, 250, 450])
    expect(calls.every((c) => c[4] === TARGET_H)).toBe(true)
    // 末张右边缘不越过行宽
    expect(expected[2].x + 300).toBe(1216)
    expect(expected[5].x + 450).toBe(75 + 1066)
  })
})
