// 价目分享卡 oimimo 吸纳批三测试：导入真实档位 / 作品库例图 / 双布局持久化
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceCard from '../PriceCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

const getPricing = vi.fn()
const getArtworks = vi.fn()
vi.mock('../../../api/index.js', () => ({
  artistApi: { getArtworks: (...args: unknown[]) => getArtworks(...args) },
  artistPublicApi: { getPricing: (...args: unknown[]) => getPricing(...args) }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ subdomain: 'alice' })
}))

const msgBoxConfirm = vi.fn(() => Promise.resolve('confirm'))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  // 参数不消费（断言只看调用与结果），避开宽类型透传
  ElMessageBox: { confirm: () => msgBoxConfirm() }
}))

// happy-dom 无 canvas 2d 实现：统一 stub（与既有挂载测试同口径）
function canvasContextStub() {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'canvas') return { width: 0, height: 0 }
      return () => undefined
    },
    set() {
      return true
    }
  })
}

interface TierLike { name: string; priceYuan: number | null; note: string; group: string }
interface PickLike { kind: string; artworkId?: number; src: string }
interface PriceCardVM {
  form: { title: string; layout: string; tiers: TierLike[] }
  picks: PickLike[]
  importPricing: () => Promise<void>
  openPicker: () => Promise<void>
  togglePick: (art: { id: number; image_path: string }) => void
  removePick: (i: number) => void
  pickedArtworkIds: Set<number>
}

function mountPriceCard() {
  const wrapper = mount(PriceCard, {
    global: { mocks: { $t: (key: string) => key, $tm: () => [] } }
  })
  return { wrapper, vm: wrapper.vm as unknown as PriceCardVM }
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  localStorage.clear()
  vi.clearAllMocks()
  msgBoxConfirm.mockResolvedValue('confirm')
})

describe('PriceCard oimimo 吸纳批三', () => {
  it('TC-PL3-01: 导入真实档位——按画风分组带出，showcase 尺寸不进价目', async () => {
    getPricing.mockResolvedValue({
      styles: [
        {
          name: '头像', sizes: [
            { name: '大头', base_price: 180, description: '简单背景', display_status: 'visible' },
            { name: '内部档', base_price: 999, description: null, display_status: 'showcase' }
          ]
        },
        { name: '立绘', sizes: [{ name: '全身', base_price: 600, description: '拆件', display_status: 'visible' }] }
      ]
    })
    const { vm } = mountPriceCard()
    await vm.importPricing()

    expect(getPricing).toHaveBeenCalledWith('alice')
    expect(vm.form.tiers).toHaveLength(2)
    expect(vm.form.tiers[0]).toMatchObject({ name: '大头', priceYuan: 180, note: '简单背景', group: '头像' })
    expect(vm.form.tiers[1]).toMatchObject({ name: '全身', priceYuan: 600, group: '立绘' })
  })

  it('TC-PL3-02: 已有内容导入需两步确认——取消则不覆盖', async () => {
    getPricing.mockResolvedValue({ styles: [{ name: '头像', sizes: [{ name: '大头', base_price: 180, description: null, display_status: 'visible' }] }] })
    const { vm } = mountPriceCard()
    // 预填 3 行内容（触发确认分支）
    vm.form.tiers[0].name = '私设'
    vm.form.tiers[0].priceYuan = 100

    msgBoxConfirm.mockRejectedValueOnce(new Error('cancel'))
    await vm.importPricing()
    expect(vm.form.tiers[0]).toMatchObject({ name: '私设', priceYuan: 100 })

    msgBoxConfirm.mockResolvedValueOnce('confirm')
    await vm.importPricing()
    expect(vm.form.tiers[0]).toMatchObject({ name: '大头', priceYuan: 180, group: '头像' })
  })

  it('TC-PL3-03: 作品库例图勾选最多 4 张，可移除', async () => {
    getArtworks.mockResolvedValue(
      [1, 2, 3, 4, 5].map(id => ({ id, image_path: `images/a${id}.png`, title: `作品${id}`, size_tag_ids: [] }))
    )
    const { vm } = mountPriceCard()
    await vm.openPicker()
    expect(getArtworks).toHaveBeenCalledTimes(1)

    for (const id of [1, 2, 3, 4, 5]) {
      vm.togglePick({ id, image_path: `images/a${id}.png` })
    }
    expect(vm.picks).toHaveLength(4) // 第 5 张被上限拦下
    expect(vm.pickedArtworkIds.has(4)).toBe(true)
    expect(vm.pickedArtworkIds.has(5)).toBe(false)
    expect(vm.picks[0].src).toBe('/uploads/images/a1.png')

    vm.removePick(0)
    expect(vm.picks).toHaveLength(3)
  })

  it('TC-PL3-04: 布局切换随草稿持久化（B 画风卡片）', async () => {
    const { vm, wrapper } = mountPriceCard()
    expect(vm.form.layout).toBe('A')
    vm.form.layout = 'B'
    // watch 深监听 → 同步 saveDraft（无防抖）
    await wrapper.vm.$nextTick()
    const saved = JSON.parse(localStorage.getItem('huiyue_price_card_draft')!) as { layout: string }
    expect(saved.layout).toBe('B')
  })
})
