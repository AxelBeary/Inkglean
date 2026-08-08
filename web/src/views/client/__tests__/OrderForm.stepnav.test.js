// OrderForm 步骤导航组件测试（F1：增项步骤"下一步"跳过写需求修复的回归守卫）
// SPEC-PRICE-2：画风模型唯一——单画风(4步) / 多画风(5步) + 无配置空态
// 步骤导航逻辑（stepDefs/step/各步骤号 computed）在本组件内、不在 useOrderForm 里，故 mock composable 控制模式
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

// ThemePicker（经 ClientFloatingActions import 链带入）依赖 i18n 单例与 pinia，mock 隔离
vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { locale: { value: 'zh-CN' } } },
  setLocale: vi.fn(),
  default: { global: { locale: { value: 'zh-CN' } } }
}))

// 提升容器：useOrderForm mock 每次返回可控实例（h.current），模式由 h.mode 决定
const h = vi.hoisted(() => ({ mode: 'multi', current: null, build: null }))

vi.mock('../../../composables/useOrderForm.js', () => ({
  useOrderForm: () => (h.current = h.build(h.mode))
}))

import OrderForm from '../OrderForm.vue'

// ─── 画风 mock 数据（结构与 getPublicStyles 公开契约一致） ───
const STYLE_A = {
  id: 11, name: '厚涂', description: null, cover_image: null, sort_order: 1,
  sizes: [{ id: 111, name: '头像', base_price: 80, sort_order: 1, addons: [] }]
}
const STYLE_B = {
  id: 12, name: '线稿', description: null, cover_image: null, sort_order: 2,
  sizes: [{ id: 121, name: '头像', base_price: 50, sort_order: 1, addons: [] }]
}

/** 构造 useOrderForm 可控 mock：mode = 'single' | 'multi' | 'empty'（无画风配置） */
function buildMockComposable(mode) {
  const styleMode = mode !== 'empty'
  const multi = mode === 'multi'
  const form = reactive({
    description: '', clientQq: '', clientName: '',
    notifyEnabled: false, discountCode: '', agreed: false
  })
  const styles = ref(styleMode ? (multi ? [STYLE_A, STYLE_B] : [STYLE_A]) : [])
  // 单画风自动选中唯一画风（与真实 composable 行为一致）
  const selectedStyleId = ref(styleMode && !multi ? STYLE_A.id : null)
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
    isMultiStyle: computed(() => multi),
    selectedStyleId,
    selectedStyle,
    selectedSizeId,
    selectedSize,
    availableStyleAddons,
    // SPEC-PRICE-2 增项三区
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

// ─── 挂载与 DOM 工具 ───

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
      // ThemePicker 依赖 pinia store，与本测试无关，stub 隔离
      stubs: { ClientFloatingActions: true }
    }
  })
  await flushPromises()
  return wrapper
}

/** 当前可见的步骤面板（其余面板被 v-show 隐藏） */
function activePanel(wrapper) {
  return wrapper.findAll('form > div').find(
    d => d.element.style.display !== 'none' && d.find('.step-title').exists()
  )
}

function activeTitle(wrapper) {
  const panel = activePanel(wrapper)
  return panel ? panel.find('.step-title').text() : null
}

/** 点击当前可见面板 step-nav 里的按钮（按 i18n key 文案定位），并断言按钮可用 */
async function clickNav(wrapper, labelKey) {
  const panel = activePanel(wrapper)
  expect(panel, `未找到可见步骤面板（找按钮 ${labelKey}）`).toBeTruthy()
  const btn = panel.findAll('.step-nav button').find(
    b => b.text().replace(/\s+/g, '') === labelKey
  )
  expect(btn, `当前面板无"${labelKey}"按钮`).toBeTruthy()
  expect(btn.element.disabled).toBe(false)
  await btn.trigger('click')
  await nextTick()
}

// ─── 测试 ───

describe('OrderForm 步骤导航——画风模型步骤链回归（SPEC-PRICE-2）', () => {
  describe('多画风（5 步：选画风→选尺寸→选增项→写需求→联系方式）', () => {
    it('步骤指示器渲染 5 步，起始于选画风', async () => {
      const wrapper = await mountForm('multi')
      expect(wrapper.findAll('.step-item')).toHaveLength(5)
      expect(wrapper.vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.styleStepTitle')
    })

    it('正向全链路：1→2→3→4→5 逐步移动无跳步', async () => {
      const wrapper = await mountForm('multi')

      h.current.selectedStyleId.value = 11
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(2)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')

      h.current.selectedSizeId.value = 111
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(3)
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(4)
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')

      // D 软提示：填描述后可直接进入联系方式步骤
      h.current.form.description = '想要一个酷酷的头像'
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(5)
      expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
    })

    it('反向全链路：联系方式→写需求→增项→尺寸→画风', async () => {
      const wrapper = await mountForm('multi')
      wrapper.vm.step = 5
      await nextTick()

      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(activeTitle(wrapper)).toBe('orderForm.styleStepTitle')
      expect(wrapper.vm.step).toBe(1)
    })
  })

  describe('单画风（4 步：选尺寸→选增项→写需求→联系方式，无选画风步）', () => {
    it('步骤指示器渲染 4 步，起始于选尺寸', async () => {
      const wrapper = await mountForm('single')
      expect(wrapper.findAll('.step-item')).toHaveLength(4)
      expect(wrapper.vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')
    })

    it('正向全链路：1→2→3→4 逐步移动无跳步', async () => {
      const wrapper = await mountForm('single')

      h.current.selectedSizeId.value = 111
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(2)
      expect(activeTitle(wrapper)).toBe('orderForm.addonStepTitle')

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(3)
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')

      // D 软提示：填描述后可直接进入联系方式步骤
      h.current.form.description = '想要一个酷酷的头像'
      await nextTick()
      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(4)
      expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
    })

    it('反向全链路；选尺寸步无"上一步"按钮', async () => {
      const wrapper = await mountForm('single')
      wrapper.vm.step = 4
      await nextTick()

      await clickNav(wrapper, 'orderForm.prevStep')
      expect(wrapper.vm.step).toBe(3)
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(wrapper.vm.step).toBe(2)
      await clickNav(wrapper, 'orderForm.prevStep')
      expect(wrapper.vm.step).toBe(1)
      expect(activeTitle(wrapper)).toBe('orderForm.sizeStepTitle')

      // 选尺寸是单画风第一步：导航区只有"下一步"一个按钮
      expect(activePanel(wrapper).findAll('.step-nav button')).toHaveLength(1)
    })
  })

  describe('无画风配置空态（SPEC-PRICE-2：旧档位模型已退役）', () => {
    it('无画风 → 无可见步骤面板，渲染空态提示 + 返回主页按钮', async () => {
      const wrapper = await mountForm('empty')
      expect(activePanel(wrapper)).toBeUndefined()
      expect(wrapper.text()).toContain('orderForm.noStylesHint')
    })
  })

  describe('D 软提示：空描述点下一步 → 弹确认框；取消留下、确认放行', () => {
    it('多画风写需求步：取消留在本步，确认放行到联系方式', async () => {
      const { ElMessageBox } = await import('element-plus')
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
      try {
        const wrapper = await mountForm('multi')
        wrapper.vm.step = 4
        await nextTick()

        // 需求描述留空点下一步 → 弹软提示（用户取消）→ 留在本步
        confirmSpy.mockRejectedValueOnce('cancel')
        await clickNav(wrapper, 'orderForm.nextStep')
        expect(confirmSpy).toHaveBeenCalled()
        expect(wrapper.vm.step).toBe(4)

        // 确认「继续」→ 放行到联系方式步骤
        confirmSpy.mockResolvedValueOnce('confirm')
        await clickNav(wrapper, 'orderForm.nextStep')
        await flushPromises()
        expect(wrapper.vm.step).toBe(5)
        expect(activeTitle(wrapper)).toBe('orderForm.step3Title')
      } finally {
        confirmSpy.mockRestore()
      }
    })
  })

  describe('F1 回归专项：增项步骤"下一步"必须到写需求', () => {
    it('多画风：增项步(3)下一步 → 写需求(4)，不得跳到联系方式(5)', async () => {
      const wrapper = await mountForm('multi')
      wrapper.vm.step = 3
      await nextTick()

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(4) // detailStep，而非 contactStep=5
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
    })

    it('单画风：增项步(2)下一步 → 写需求(3)，不得跳到联系方式(4)', async () => {
      const wrapper = await mountForm('single')
      wrapper.vm.step = 2
      await nextTick()

      await clickNav(wrapper, 'orderForm.nextStep')
      expect(wrapper.vm.step).toBe(3) // detailStep，而非 contactStep=4
      expect(activeTitle(wrapper)).toBe('orderForm.step2Title')
    })
  })
})
