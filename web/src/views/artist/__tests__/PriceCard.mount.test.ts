// 价目分享卡挂载测试（812 工具波 B ④）
// shared-824 路 B 适配：表单/复制内部已迁入 @inkglean/shared 哑组件，
// 内部状态断言改经 wrapper.findComponent(PriceCardCore).vm 取子组件 vm（断言语义不变）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceCard from '../PriceCard.vue'
import { PriceCard as PriceCardCore } from '@inkglean/shared'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// oimimo 吸纳批三：组件新增 store/api 依赖，挂载测试补 mock（行为断言不变）
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ subdomain: 'alice' })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: { getArtworks: () => Promise.resolve([]) },
  artistPublicApi: { getPricing: () => Promise.resolve({ styles: [] }) }
}))

// happy-dom 无 canvas 2d 实现：统一 stub，避免预览/导出路径抛错
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

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
  localStorage.clear()
})

/** 微任务/宏任务冲刷：宿主事件处理器（剪贴板/取数）为异步，等链路落定再断言 */
const flushAsync = () => new Promise(r => setTimeout(r, 0))

// 共享哑组件内部面（经 VTU vm 代理透出 script-setup setupState）
interface PriceCardCoreVM {
  form: {
    title: string
    tiers: { name: string; priceYuan: number }[]
  }
  copyText: () => void
}

function mountPriceCard() {
  const wrapper = mount(PriceCard, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $tm: () => []
      }
    }
  })
  // 内部状态住在共享子组件：经 findComponent 取子组件 vm
  const vm = wrapper.findComponent(PriceCardCore).vm as unknown as PriceCardCoreVM
  return { wrapper, vm }
}

describe('PriceCard 价目分享卡', () => {
  it('挂载后渲染标题与默认 3 行档位', () => {
    const { wrapper } = mountPriceCard()
    expect(wrapper.find('.od-page-title').text()).toBe('priceCard.title')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
  })

  it('档位行可加至 12 行、至少保留 3 行（oimimo 吸纳批三：上限 6→12，导入真实档位常超 6）', async () => {
    const { wrapper } = mountPriceCard()
    const addBtn = wrapper.find('.pc-btn--ghost')
    for (let i = 0; i < 9; i++) {
      await addBtn.trigger('click')
    }
    expect(wrapper.findAll('.pc-tier')).toHaveLength(12)
    expect(addBtn.attributes('disabled')).toBeDefined()

    await wrapper.findAll('.pc-mini-btn')[0].trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(11)
  })

  it('从 localStorage 恢复草稿标题', async () => {
    localStorage.setItem('huiyue_price_card_draft', JSON.stringify({
      title: '头像 · 立绘价目',
      contact: 'QQ 123456',
      tiers: [
        { id: 'a', name: '头像', priceYuan: 80, note: '大头' },
        { id: 'b', name: '半身', priceYuan: 160, note: '' },
        { id: 'c', name: '全身', priceYuan: 300, note: '含背景' }
      ],
      exampleThumb: ''
    }))
    const { wrapper } = mountPriceCard()
    await wrapper.vm.$nextTick()
    expect((wrapper.find('#pc-title').element as HTMLInputElement).value).toBe('头像 · 立绘价目')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
  })

  it('复制纯文字版使用 formatYuan 金额格式', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const { vm } = mountPriceCard()
    vm.form.title = '头像价目'
    vm.form.tiers[0].name = '头像'
    vm.form.tiers[0].priceYuan = 120
    vm.form.tiers[1].name = '半身'
    vm.form.tiers[1].priceYuan = 200
    vm.form.tiers[2].name = '全身'
    vm.form.tiers[2].priceYuan = 350
    await vm.copyText()
    await flushAsync() // 宿主侧剪贴板写入为异步，等链路落定

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('头像价目')
    expect(text).toContain('¥120.00')
    expect(text).toContain('¥350.00')
  })

  // 宿主接线断言：表单变更 → 共享组件 draft-change → 宿主写 localStorage（STORAGE_KEY 不变）
  it('draft-change 经宿主写回 localStorage（接线）', async () => {
    const { vm, wrapper } = mountPriceCard()
    vm.form.title = '宿主接线测试'
    await wrapper.vm.$nextTick()
    const saved = JSON.parse(localStorage.getItem('huiyue_price_card_draft')!) as { title: string; layout: string; tiers: unknown[] }
    expect(saved.title).toBe('宿主接线测试')
    expect(saved.layout).toBe('A')
    expect(saved.tiers).toHaveLength(3)
  })
})
