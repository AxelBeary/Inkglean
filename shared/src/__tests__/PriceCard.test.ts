// F3 约稿条哑组件挂载测试（shared-824 搬家批）
// 口径对齐 web 既有挂载测试：happy-dom + canvas Proxy stub；t 桩带回显参数；
// pickerEnabled=true、artworks 桩数组
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceCard from '../components/PriceCard.vue'
import type { PriceCardDraft, ImportedTier } from '../index'

// happy-dom 无 canvas 2d：统一 stub（口径照抄 web 现有挂载测试）
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
})

/** t 桩：无参回 key，带参回 key:JSON（方便断言 importOk/importTruncated/contactLine 的参数） */
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

/** 作品库桩：5 张，src 为宿主组好的可直载地址 */
const artworks = [1, 2, 3, 4, 5].map(id => ({ id, title: `作品${id}`, src: `https://cdn.test/a${id}.png` }))

function mountCard(props: Record<string, unknown> = {}) {
  return mount(PriceCard, { props: { t, pickerEnabled: true, artworks, ...props } })
}

/** 组件 expose 面（最小必要断言） */
interface PriceCardExposed {
  buildCanvas: () => Promise<HTMLCanvasElement | null>
  applyImportedTiers: (tiers: ImportedTier[]) => void
}

function lastDraft(wrapper: ReturnType<typeof mountCard>): PriceCardDraft {
  const evts = wrapper.emitted('draft-change')
  expect(evts, 'draft-change 应已发出').toBeTruthy()
  return evts![evts!.length - 1][0] as PriceCardDraft
}

function notifies(wrapper: ReturnType<typeof mountCard>): Array<{ kind: string; text: string }> {
  return (wrapper.emitted('notify') ?? []).map(e => e[0] as { kind: string; text: string })
}

describe('PriceCard 约稿条哑组件（shared）', () => {
  it('挂载渲染标题与默认 3 行档位', () => {
    const wrapper = mountCard()
    expect(wrapper.find('.od-page-title').text()).toBe('priceCard.title')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
  })

  it('档位行可加至 12 行、减至 3 行钳制', async () => {
    const wrapper = mountCard()
    const addBtn = () => wrapper.findAll('.pc-tier-actions .pc-btn--ghost')[0]
    for (let i = 0; i < 9; i++) await addBtn().trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(12)
    expect(addBtn().attributes('disabled')).toBeDefined()
    await addBtn().trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(12) // 上限钳制

    for (let i = 0; i < 9; i++) await wrapper.find('.pc-tier-main .pc-mini-btn').trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
    await wrapper.find('.pc-tier-main .pc-mini-btn').trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3) // 下限钳制
  })

  it('applyImportedTiers 三态：空集警告不动表单 / 正常落值 / 超 12 截断', async () => {
    // 空集
    const w1 = mountCard()
    const vm1 = w1.vm as unknown as PriceCardExposed
    vm1.applyImportedTiers([])
    await w1.vm.$nextTick()
    expect(w1.findAll('.pc-tier')).toHaveLength(3)
    expect(notifies(w1).some(n => n.kind === 'warning' && n.text === 'priceCard.importEmpty')).toBe(true)

    // 正常：2 档落值（名称/价格/分组标签进 DOM）
    const w2 = mountCard()
    const vm2 = w2.vm as unknown as PriceCardExposed
    vm2.applyImportedTiers([
      { name: '大头', priceYuan: 180, note: '简单背景', group: '头像' },
      { name: '全身', priceYuan: 600 }
    ])
    await w2.vm.$nextTick()
    expect(w2.findAll('.pc-tier')).toHaveLength(2)
    const inputs = w2.findAll('.pc-tier-main .pc-input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('大头')
    expect((inputs[1].element as HTMLInputElement).value).toBe('180')
    expect(w2.find('.pc-tier-group').text()).toBe('头像')
    expect(notifies(w2).some(n => n.kind === 'success' && n.text === 'priceCard.importOk:{"n":2}')).toBe(true)

    // 超 12 截断：14 → 12
    const w3 = mountCard()
    const vm3 = w3.vm as unknown as PriceCardExposed
    vm3.applyImportedTiers(Array.from({ length: 14 }, (_, i) => ({ name: `档${i + 1}`, priceYuan: 100 + i })))
    await w3.vm.$nextTick()
    expect(w3.findAll('.pc-tier')).toHaveLength(12)
    expect(notifies(w3).some(n => n.kind === 'info' && n.text === 'priceCard.importTruncated:{"n":12}')).toBe(true)
  })

  it('点「挑作品」发 request-artworks 并开弹窗，网格渲染 props.artworks', async () => {
    const wrapper = mountCard()
    await wrapper.find('.pc-example .pc-btn--file').trigger('click')
    expect(wrapper.emitted('request-artworks')).toHaveLength(1)
    expect(wrapper.find('.pc-modal-mask').exists()).toBe(true)
    expect(wrapper.findAll('.pc-picker-item')).toHaveLength(5)
  })

  it('弹窗内勾选 5 张只进 4 张（上限）且可移除，src 直用宿主地址', async () => {
    const wrapper = mountCard()
    await wrapper.find('.pc-example .pc-btn--file').trigger('click')
    for (const btn of wrapper.findAll('.pc-picker-item')) await btn.trigger('click')

    expect(wrapper.findAll('.pc-thumb')).toHaveLength(4) // 第 5 张被上限拦下
    expect(notifies(wrapper).some(n => n.kind === 'warning' && n.text === 'priceCard.pickLimit')).toBe(true)
    expect(lastDraft(wrapper).picks[0].src).toBe('https://cdn.test/a1.png') // 不再拼 /uploads

    await wrapper.find('.pc-picks .pc-mini-btn').trigger('click')
    expect(wrapper.findAll('.pc-thumb')).toHaveLength(3)
  })

  it('request-import 带出 hasContent：空表单 false，预填后 true', async () => {
    const wrapper = mountCard()
    const importBtn = () => wrapper.findAll('.pc-tier-actions .pc-btn--ghost')[1]
    await importBtn().trigger('click')
    expect(wrapper.emitted('request-import')![0][0]).toEqual({ hasContent: false })

    const tierInputs = wrapper.findAll('.pc-tier-main .pc-input')
    await tierInputs[0].setValue('头像')
    await tierInputs[1].setValue('180')
    await importBtn().trigger('click')
    const evts = wrapper.emitted('request-import')!
    expect(evts[evts.length - 1][0]).toEqual({ hasContent: true })
  })

  it('布局分段 A↔B 切换并入 draft-change', async () => {
    const wrapper = mountCard()
    expect(wrapper.findAll('.pc-seg-btn')[0].attributes('aria-pressed')).toBe('true')
    await wrapper.findAll('.pc-seg-btn')[1].trigger('click')
    expect(lastDraft(wrapper).layout).toBe('B')
    await wrapper.findAll('.pc-seg-btn')[0].trigger('click')
    expect(lastDraft(wrapper).layout).toBe('A')
  })

  it('copy-text 文本含标题/分组/¥金额/联系行', async () => {
    const wrapper = mountCard()
    const vm = wrapper.vm as unknown as PriceCardExposed
    vm.applyImportedTiers([
      { name: '大头', priceYuan: 120, group: '水彩' },
      { name: '半身', priceYuan: 200, group: '水彩' },
      { name: '全身', priceYuan: 350, note: '含背景', group: '水彩' }
    ])
    await wrapper.vm.$nextTick()
    await wrapper.find('#pc-title').setValue('头像价目')
    await wrapper.find('#pc-contact').setValue('QQ 123')
    await wrapper.findAll('.pc-actions button')[1].trigger('click')

    const evts = wrapper.emitted('copy-text')
    expect(evts).toBeTruthy()
    const { text } = evts![0][0] as { text: string }
    expect(text).toContain('头像价目')
    expect(text).toContain('【水彩】')
    expect(text).toContain('¥120.00')
    expect(text).toContain('¥350.00')
    expect(text).toContain('QQ 123')
  })
})
