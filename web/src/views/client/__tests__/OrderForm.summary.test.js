// OrderForm 摘要卡客户信息回显测试（REQ-022 F3：昵称 + 需求描述补齐）
// 覆盖：空值整块隐藏 / 填写后实时回显 / 只填一项时另一行不显示
// SPEC-PRICE-2：画风模型唯一，复用 stepnav 同款 mock 方案
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref, reactive, computed } from 'vue'
import ElementPlus from 'element-plus'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到，补齐
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: {} }),
  useRouter: () => ({ push: () => {} }),
  onBeforeRouteLeave: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { locale: { value: 'zh-CN' } } },
  setLocale: vi.fn(),
  default: { global: { locale: { value: 'zh-CN' } } }
}))

const h = vi.hoisted(() => ({ mode: 'single', current: null, build: null }))

vi.mock('../../../composables/useOrderForm.js', () => ({
  useOrderForm: () => (h.current = h.build(h.mode))
}))

import OrderForm from '../OrderForm.vue'

const STYLE_A = {
  id: 11, name: '厚涂', description: null, cover_image: null, sort_order: 1,
  sizes: [{ id: 111, name: '头像', base_price: 80, sort_order: 1, addons: [] }]
}

/** 构造 useOrderForm 可控 mock（SPEC-PRICE-2 新 API 面） */
function buildMockComposable(mode) {
  const styleMode = mode !== 'empty'
  const form = reactive({
    description: '', clientQq: '', clientName: '',
    notifyEnabled: false, discountCode: '', agreed: false
  })
  const styles = ref(styleMode ? [STYLE_A] : [])
  const selectedStyleId = ref(styleMode ? STYLE_A.id : null)
  const selectedSizeId = ref(null)
  const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
  const selectedSize = computed(() => selectedStyle.value?.sizes?.find(sz => sz.id === selectedSizeId.value) || null)
  const availableStyleAddons = computed(() => selectedSize.value?.addons || [])

  return {
    artist: ref({ name: 'Alice', notifyEnabled: false, revisionNote: '' }),
    rulesContent: ref(''),
    loading: ref(false),
    workflowStages: ref([]),
    form,
    rules: {},
    submitting: ref(false),
    showSuccess: ref(false),
    resultNo: ref(''),
    submit: vi.fn(),
    refFileList: ref([]),
    handleRefUpload: vi.fn(),
    handleRefRemove: vi.fn(),
    sanitizedRules: ref(''),
    discountEnabled: ref(false),
    discountResult: ref(null),
    discountError: ref(''),
    discountValidating: ref(false),
    validateDiscountCode: vi.fn(),
    styles,
    isStyleMode: computed(() => styleMode),
    isMultiStyle: computed(() => false),
    selectedStyleId,
    selectedStyle,
    selectedSizeId,
    selectedSize,
    availableStyleAddons,
    regularAddons: computed(() => availableStyleAddons.value.filter(a => a.category === 'add')),
    usageAddons: computed(() => availableStyleAddons.value.filter(a => a.category === 'usage')),
    rushAddons: computed(() => availableStyleAddons.value.filter(a => a.category === 'rush')),
    styleAddonSelections: reactive({}),
    selectedUsageId: ref(null),
    selectedRushId: ref(null),
    selectStyle: vi.fn(),
    selectSize: vi.fn(),
    toggleUsage: vi.fn(),
    toggleRush: vi.fn(),
    styleAddonPriceText: (a) => `¥${a.price}`,
    stylePricePreview: ref(null),
    styleDisplayPrice: ref(0),
    installmentPreview: ref([]),
    queryPreselect: reactive({ styleId: null, sizeId: null }),
    preselectBannerText: computed(() => '')
  }
}
h.build = buildMockComposable

async function mountForm(mode) {
  h.mode = mode
  h.current = null
  const wrapper = mount(OrderForm, {
    global: {
      plugins: [ElementPlus],
      mocks: {
        $t: (key) => key,
        $tm: (key) => [key],
        $router: { push: () => {} }
      },
      stubs: { ClientFloatingActions: true }
    }
  })
  await flushPromises()
  return wrapper
}

describe('OrderForm 摘要卡客户信息回显（REQ-022 F3）', () => {
  it('昵称与描述均为空时，客户信息区整体不渲染（无占位灰字）', async () => {
    const wrapper = await mountForm('single')
    const card = wrapper.find('.summary-card')
    expect(card.find('.summary-client').exists()).toBe(false)
    expect(card.text()).not.toContain('orderForm.summaryNickname')
    expect(card.text()).not.toContain('orderForm.summaryDescription')
  })

  it('填写昵称与描述后，摘要卡实时回显两行', async () => {
    const wrapper = await mountForm('single')
    h.current.form.clientName = '小鱼'
    h.current.form.description = '想要一张头像'
    await nextTick()

    const card = wrapper.find('.summary-card')
    const client = card.find('.summary-client')
    expect(client.exists()).toBe(true)
    expect(client.text()).toContain('orderForm.summaryNickname')
    expect(client.text()).toContain('小鱼')
    expect(client.text()).toContain('orderForm.summaryDescription')
    expect(client.text()).toContain('想要一张头像')
  })

  it('只填昵称不填描述：仅昵称行渲染，描述行不渲染', async () => {
    const wrapper = await mountForm('single')
    h.current.form.clientName = '小鱼'
    await nextTick()

    const client = wrapper.find('.summary-client')
    expect(client.exists()).toBe(true)
    expect(client.text()).toContain('小鱼')
    expect(client.find('.summary-desc').exists()).toBe(false)
  })

  it('只填描述不填昵称：仅描述行渲染，昵称行不渲染', async () => {
    const wrapper = await mountForm('single')
    h.current.form.description = '想要一张头像'
    await nextTick()

    const client = wrapper.find('.summary-client')
    expect(client.exists()).toBe(true)
    expect(client.text()).toContain('想要一张头像')
    expect(client.text()).not.toContain('orderForm.summaryNickname')
  })

  it('纯空白昵称/描述视为空，客户信息区不渲染', async () => {
    const wrapper = await mountForm('single')
    h.current.form.clientName = '   '
    h.current.form.description = '  \n '
    await nextTick()

    expect(wrapper.find('.summary-client').exists()).toBe(false)
  })

  it('选中尺寸后摘要卡渲染画风/尺寸与价格区（回显不破坏既有结构）', async () => {
    const wrapper = await mountForm('single')
    h.current.selectedSizeId.value = 111
    h.current.form.clientName = '大鱼'
    h.current.form.description = '想要一张全身立绘'
    await nextTick()

    const card = wrapper.find('.summary-card')
    expect(card.find('.summary-client').exists()).toBe(true)
    expect(card.text()).toContain('大鱼')
    expect(card.text()).toContain('想要一张全身立绘')
    expect(card.find('.summary-tier').text()).toBe('厚涂')
  })
})
