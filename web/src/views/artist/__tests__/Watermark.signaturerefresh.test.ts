// F0304: Watermark 完稿图签名刷新接线——定时换签 / @error 按图兜底 / 当前预览 src 同步回写
// mock 面参照 Watermark.race.test.ts；真 composable + 假时钟续签断言参照 PreviewPanel.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { DEFAULT_INTERVAL_MS } from '../../../composables/useSignatureRefresh'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const h = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllOrders: vi.fn(),
  getArtworks: vi.fn(),
  refreshSignatures: vi.fn(),
  compose: vi.fn(),
  loadImage: vi.fn()
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ profile: { id: 1 }, artistName: '画师A' })
}))

// useSignatureRefresh 默认 request 引用同一 artistApi 模块 → refreshSignatures 一并走 mock（不 mock composable 本体）
vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOrder: h.getOrder,
    getAllOrders: h.getAllOrders,
    getArtworks: h.getArtworks,
    refreshSignatures: h.refreshSignatures
  }
}))

vi.mock('../../../utils/watermark.js', () => ({
  WM_POSITIONS: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
  WM_POSITION_CORNERS: 'corners',
  loadImage: h.loadImage,
  composeWatermarked: h.compose
}))

vi.mock('../../../utils/storage.js', () => ({
  safeGetItem: () => null,
  safeSetItem: () => {}
}))

import Watermark from '../Watermark.vue'

interface DeliverableRow {
  id: number
  url: string
  original_name?: string | null
}

// vm 暴露面以局部 interface 描述（script setup 顶层绑定经 proxy 可读写，口径同 Watermark.race.test.ts）
interface WatermarkVM {
  sourceType: string
  src: string
  deliverables: DeliverableRow[]
  selectedDeliverableId: number | null
  onOrderChange: (id: number | null) => Promise<void>
  pickDeliverable: (d: DeliverableRow) => void
  pickArtwork: (art: { id: number; image_path: string }) => void
}

const URL_A_OLD = '/uploads/deliverables/1/a.png?sig=old'
const URL_B_OLD = '/uploads/deliverables/1/b.png?sig=old'
const URL_A_NEW = '/uploads/deliverables/1/a.png?sig=new'
const URL_B_NEW = '/uploads/deliverables/1/b.png?sig=new'
const PATH_A = 'deliverables/1/a.png'
const PATH_B = 'deliverables/1/b.png'

function deliverablesOf(id1: number, id2: number): DeliverableRow[] {
  return [
    { id: id1, url: URL_A_OLD, original_name: 'a.png' },
    { id: id2, url: URL_B_OLD, original_name: 'b.png' }
  ]
}

function mountWatermark() {
  const wrapper = shallowMount(Watermark, {
    global: {
      mocks: { $t: (key: string) => key },
      directives: { loading: () => {} }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as WatermarkVM }
}

/** 挂载 → 切到完稿页签 → 载入指定订单完稿图（getOrder 返回值由各用例自行 mock） */
async function mountOnDeliverableTab(orderId: number) {
  const mounted = mountWatermark()
  mounted.vm.sourceType = 'deliverable'
  await flushPromises() // sourceType watcher → loadOrders（getAllOrders 走 mock）
  await mounted.vm.onOrderChange(orderId)
  await flushPromises()
  return mounted
}

describe('Watermark 完稿图签名刷新（F0304）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.getOrder.mockReset()
    h.getAllOrders.mockReset().mockResolvedValue([])
    h.getArtworks.mockReset().mockResolvedValue([])
    h.refreshSignatures.mockReset().mockResolvedValue({ urls: {} })
    h.compose.mockReset()
    h.loadImage.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('定时换签：3 分钟到点按完稿路径批量换新，缩略图 url 与当前预览 src 同步写回', async () => {
    h.getOrder.mockResolvedValue({ id: 1, deliverables: deliverablesOf(11, 12) })
    h.refreshSignatures.mockResolvedValue({ urls: { [PATH_A]: URL_A_NEW, [PATH_B]: URL_B_NEW } })
    const { wrapper, vm } = await mountOnDeliverableTab(1)
    expect(vm.deliverables.map(d => d.id)).toEqual([11, 12])

    vm.pickDeliverable(vm.deliverables[0])
    expect(vm.selectedDeliverableId).toBe(11)
    expect(vm.src).toBe(URL_A_OLD)
    expect(h.refreshSignatures).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
    await flushPromises()

    expect(h.refreshSignatures).toHaveBeenCalledTimes(1)
    expect(h.refreshSignatures).toHaveBeenCalledWith([PATH_A, PATH_B])
    expect(vm.deliverables.map(d => d.url)).toEqual([URL_A_NEW, URL_B_NEW])
    // F0304 最大风险点：当前选中预览不得停留在旧签名
    expect(vm.src).toBe(URL_A_NEW)
    wrapper.unmount()
  })

  it('@error 兜底：单张缩略图 403 → 300ms 防抖后按图换签，选中预览 src 同步换新', async () => {
    h.getOrder.mockResolvedValue({ id: 1, deliverables: deliverablesOf(11, 12) })
    h.refreshSignatures.mockResolvedValue({ urls: { [PATH_A]: URL_A_NEW } })
    const { wrapper, vm } = await mountOnDeliverableTab(1)
    vm.pickDeliverable(vm.deliverables[0])
    expect(vm.src).toBe(URL_A_OLD)

    // 第一张缩略图加载失败（签名过期 403）→ 只按该图路径换签，不带动另一张
    await wrapper.findAll('img')[0].trigger('error')
    expect(h.refreshSignatures).not.toHaveBeenCalled() // 防抖窗口内未发
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    expect(h.refreshSignatures).toHaveBeenCalledTimes(1)
    expect(h.refreshSignatures).toHaveBeenCalledWith([PATH_A])
    expect(vm.deliverables[0].url).toBe(URL_A_NEW)
    expect(vm.deliverables[1].url).toBe(URL_B_OLD) // 未出错的图不被带动
    expect(vm.src).toBe(URL_A_NEW)
    wrapper.unmount()
  })

  it('弃选守卫：预览切到作品图后，定时换签只换缩略图，不得把 src 回写成旧完稿图', async () => {
    h.getOrder.mockResolvedValue({ id: 1, deliverables: deliverablesOf(11, 12) })
    h.refreshSignatures.mockResolvedValue({ urls: { [PATH_A]: URL_A_NEW, [PATH_B]: URL_B_NEW } })
    const { wrapper, vm } = await mountOnDeliverableTab(1)
    vm.pickDeliverable(vm.deliverables[0])
    vm.pickArtwork({ id: 5, image_path: 'gallery/x.png' })
    expect(vm.src).toBe('/uploads/gallery/x.png')
    expect(vm.selectedDeliverableId).toBeNull()

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
    await flushPromises()

    // 完稿页签仍停留 → 缩略图照常换新签名
    expect(h.refreshSignatures).toHaveBeenCalledTimes(1)
    expect(vm.deliverables.map(d => d.url)).toEqual([URL_A_NEW, URL_B_NEW])
    // 但当前预览是作品图（裸路径无签名），不得被回写
    expect(vm.src).toBe('/uploads/gallery/x.png')
    wrapper.unmount()
  })

  it('非完稿页签零请求：sourceType 切回新传图后定时器空转，不发换签请求', async () => {
    h.getOrder.mockResolvedValue({ id: 1, deliverables: deliverablesOf(11, 12) })
    const { wrapper, vm } = await mountOnDeliverableTab(1)
    vm.sourceType = 'new'
    await flushPromises()

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
    await flushPromises()
    expect(h.refreshSignatures).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('切单弃选：换订单后旧选中 id 不再作为回写依据（新单换签后预览保持空）', async () => {
    h.getOrder.mockResolvedValueOnce({ id: 1, deliverables: deliverablesOf(11, 12) })
    h.getOrder.mockResolvedValueOnce({
      id: 2,
      deliverables: [{ id: 21, url: '/uploads/deliverables/1/c.png?sig=old2', original_name: 'c.png' }]
    })
    const { wrapper, vm } = await mountOnDeliverableTab(1)
    vm.pickDeliverable(vm.deliverables[0])
    expect(vm.selectedDeliverableId).toBe(11)

    await vm.onOrderChange(2)
    await flushPromises()
    expect(vm.selectedDeliverableId).toBeNull()
    expect(vm.src).toBe('')

    // 新订单完稿图定时换签：picked 查不到（id=null）→ 预览 src 保持空，不被旧 id 回写
    h.refreshSignatures.mockResolvedValue({ urls: { 'deliverables/1/c.png': '/uploads/deliverables/1/c.png?sig=n2' } })
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
    await flushPromises()
    expect(h.refreshSignatures).toHaveBeenCalledWith(['deliverables/1/c.png'])
    expect(vm.deliverables[0].url).toBe('/uploads/deliverables/1/c.png?sig=n2')
    expect(vm.src).toBe('')
    wrapper.unmount()
  })
})
