// OrderForm 测试共享夹具（b2 清扫：stepnav/summary 两测试文件原 ~60 行重复收敛于此）
// 提供：ResizeObserver polyfill + 画风 fixture + useOrderForm 可控 mock 构造器
import { ref, reactive, computed } from 'vue'
import { vi } from 'vitest'

/** happy-dom 无 ResizeObserver，Element Plus 内部可能用到，补齐 */
export function polyfillResizeObserver() {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

/** 画风 mock 数据（结构与 getPublicStyles 公开契约一致） */
export const STYLE_A = {
  id: 11, name: '厚涂', description: null, cover_image: null, sort_order: 1,
  sizes: [{ id: 111, name: '头像', base_price: 80, sort_order: 1, addons: [] }]
}
export const STYLE_B = {
  id: 12, name: '线稿', description: null, cover_image: null, sort_order: 2,
  sizes: [{ id: 121, name: '头像', base_price: 50, sort_order: 1, addons: [] }]
}

/**
 * 构造 useOrderForm 可控 mock：mode = 'single' | 'multi' | 'empty'（无画风配置）
 * 与真实 composable 暴露面一致（SPEC-PRICE-2 新 API 面）
 */
export function buildMockComposable(mode) {
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
