/**
 * useOrderForm — 约稿表单业务逻辑核心（R58-1）
 *
 * 将约稿表单的全部业务逻辑从页面组件中剥离，使页面只保留布局与样式。
 * R58-2 分步引导布局、以及未来的下单页多模板（小票风/杂志风等）
 * 都将共享此逻辑核心——模板只负责布局壳，逻辑零重复。
 *
 * 封装的能力：
 * - 数据加载：画师资料 / 档位 / 须知 / 流程 / 计价数据（增项+倍率）
 * - 档位选择 + 实时计价（基础价+增项+倍率，300ms 防抖调后端 calculate-price）
 * - 表单校验规则（档位必填 / QQ 必填 / 须知同意必勾）
 * - 参考图上传（文件选择 + Ctrl+V 粘贴，走相同校验）
 * - 订单提交（API 调用 + 错误 toast + loading + 成功弹窗状态）
 * - R57 表单防丢失（sessionStorage 草稿 + beforeunload 拦截 + 恢复询问）
 *
 * 用法：
 *   const formRef = ref(null)          // 模板中 el-form 的 ref
 *   const of = useOrderForm(subdomain, formRef)
 *
 * @param {string} subdomain 画师子域名（来自 route.params）
 * @param {import('vue').Ref} formRef 页面模板中 el-form 的 ref（提交时校验用）
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { artistPublicApi, orderApi, uploadApi } from '../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../utils/sanitize.js'
import { usePasteUpload } from './usePasteUpload.js'

// 增项分类元信息（图标 + 中文标签，仅 UI 展示用）
const CATEGORY_META = {
  expression: { label: '表情差分' },
  outfit: { label: '服装替换' },
  background: { label: '背景场景' },
  weapon: { label: '武器道具' },
  other: { label: '其他' }
}

export function useOrderForm(subdomain, formRef, initialQuery = {}) {
  const { t } = useI18n()

  // ─── 数据加载状态 ───
  const artist = ref(null)
  const tiers = ref([])
  const rulesContent = ref('')
  const loading = ref(true)
  const workflowStages = ref([])
  const pricingData = ref(null) // { tiers, multipliers, installments }

  // ─── v0.32 REQ-023 Phase2: 多画风状态 ───
  /** 公开画风列表（GET /public/styles/:subdomain，只含 is_active=1） */
  const styles = ref([])
  /** 画风模式：有画风数据时启用（styles.length > 0） */
  const isStyleMode = computed(() => styles.value.length > 0)
  /** 多画风：需要选画风步骤（styles.length > 1）；单画风退化为扁平模型 */
  const isMultiStyle = computed(() => styles.value.length > 1)
  /** 选中的画风 ID（单画风时自动选中唯一项） */
  const selectedStyleId = ref(null)
  const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
  /** 选中的尺寸 ID */
  const selectedSizeId = ref(null)
  const selectedSize = computed(() => selectedStyle.value?.sizes?.find(sz => sz.id === selectedSizeId.value) || null)
  /** 当前尺寸下可用增项（后端已过滤 is_hidden） */
  const availableStyleAddons = computed(() => selectedSize.value?.addons || [])
  /**
   * 增项选择状态 { [styleAddonId]: { toggled, quantity, optionLabel } }
   * switch → toggled; quantity → quantity>0; radio → optionLabel!=null
   */
  const styleAddonSelections = reactive({})
  /** 画风价格预览（calculate-style-price 响应） */
  const stylePricePreview = ref(null)
  const stylePricingExpanded = ref(false)

  // ─── v0.34 任务B：URL query 预选（主页选画风+尺寸后跳转带入） ───
  /** query 预选命中记录（restoreDraft 跳过依据 + OrderForm 初始步骤依据） */
  const queryPreselect = reactive({ styleId: null, sizeId: null })

  // ─── 表单状态 ───
  const form = reactive({
    tierId: null,
    description: '',
    clientQq: '',
    clientName: '',
    notifyEnabled: true,
    agreed: false,
    usageMultiplierId: null,
    rushMultiplierId: null,
    discountCode: '' // v0.31 F3: 折扣码（验证通过后随订单提交，后端负责真正扣减）
  })

  // ─── 校验规则 ───
  const rules = {
    tierId: [{ required: true, message: () => t('orderForm.selectTier'), trigger: 'change' }],
    clientQq: [{ required: true, message: () => t('orderForm.fillQq'), trigger: 'blur' }],
    agreed: [{
      validator: (rule, value, callback) => {
        // R24：错误文案走 order.validation 命名空间（弹窗与行内提示一致）
        if (rulesContent.value && !value) callback(new Error(t('order.validation.agreeRequired')))
        else callback()
      },
      trigger: 'change'
    }]
  }

  // ─── 提交 / 成功状态 ───
  const submitting = ref(false)
  const showSuccess = ref(false)
  const resultNo = ref('')

  // ─── 参考图上传 ───
  const refFileList = ref([])
  const uploadedRefs = ref([])
  const refUidMap = ref(new Map())

  // ─── 价格计算器状态 ───
  const addonSelections = reactive({}) // addonId → quantity
  const addonToggles = reactive({})    // addonId → boolean
  const pricePreview = ref(null)
  const pricingExpanded = ref(false)   // R14: 详细计价展开状态

  // ─── 计算属性 ───
  const sanitizedRules = computed(() => sanitizeHtml(rulesContent.value))

  // R14: 当前选中档位（摘要行用）
  const selectedTier = computed(() => tiers.value.find(tier => tier.id === form.tierId) || null)

  const availableAddons = computed(() => {
    if (!form.tierId || !pricingData.value) return []
    const tier = pricingData.value.tiers.find(item => item.id === form.tierId)
    return tier?.addons || []
  })

  // R14: 有增项、倍率或折扣码时才显示"详细计价"入口（v0.31 F3: 折扣码输入区在 price-preview 内）
  const hasPricingExtras = computed(() =>
    availableAddons.value.length > 0 || usageMultipliers.value.length > 0 || rushMultipliers.value.length > 0 || discountEnabled.value
  )

  // 增项分组（按 category 折叠）
  const addonGroups = computed(() => {
    const groups = {}
    for (const a of availableAddons.value) {
      if (!groups[a.category]) {
        const meta = CATEGORY_META[a.category] || { label: a.category }
        groups[a.category] = { category: a.category, ...meta, collapsed: false, items: [] }
      }
      groups[a.category].items.push(a)
    }
    return Object.values(groups)
  })

  const usageMultipliers = computed(() =>
    (pricingData.value?.multipliers || []).filter(m => m.type === 'usage')
  )
  const rushMultipliers = computed(() =>
    (pricingData.value?.multipliers || []).filter(m => m.type === 'rush')
  )

  function formatAddonPrice(a) {
    if (a.select_mode === 'inquiry') return '面议'
    if (a.price_type === 'percent') return `+${Math.round(a.price_value * 100)}%`
    return `¥${a.price_value}/个`
  }

  function onTierChange() {
    // 清空之前的增项选择
    for (const key of Object.keys(addonSelections)) delete addonSelections[key]
    for (const key of Object.keys(addonToggles)) delete addonToggles[key]
    form.usageMultiplierId = null
    form.rushMultiplierId = null
    pricePreview.value = null
    pricingExpanded.value = false // R14: 切换档位重置展开状态
  }

  // ─── 实时价格计算（防抖） ───
  let calcTimer = null
  function scheduleCalc() {
    if (calcTimer) clearTimeout(calcTimer)
    calcTimer = setTimeout(doCalc, 300)
  }

  /** 构建已选增项列表（计价与提交共用，避免两处重复逻辑漂移） */
  function buildSelectedAddons() {
    const addons = []
    for (const a of availableAddons.value) {
      if (a.select_mode === 'quantity' && addonSelections[a.id] > 0) {
        addons.push({ addonId: a.id, quantity: addonSelections[a.id] })
      } else if (a.select_mode === 'toggle' && addonToggles[a.id]) {
        addons.push({ addonId: a.id, quantity: 1 })
      } else if (a.select_mode === 'inquiry' && addonToggles[a.id]) {
        addons.push({ addonId: a.id, quantity: 1 })
      }
    }
    return addons
  }

  async function doCalc() {
    if (!form.tierId) { pricePreview.value = null; return }
    try {
      pricePreview.value = await artistPublicApi.calculatePrice({
        subdomain,
        tierId: form.tierId,
        addons: buildSelectedAddons(),
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId
      })
    } catch {
      pricePreview.value = null
    }
  }

  // 监听选择变化 → 触发计算
  watch([() => form.tierId, () => form.usageMultiplierId, () => form.rushMultiplierId], scheduleCalc)
  watch(addonSelections, scheduleCalc, { deep: true })
  watch(addonToggles, scheduleCalc, { deep: true })

  // 增项默认值初始化：el-input-number 的 v-model 不接受 undefined，
  // 展开详细计价前须确保所有增项键已存在（quantity → 0，toggle/inquiry → false）
  watch(availableAddons, (addons) => {
    for (const a of addons) {
      if (a.select_mode === 'quantity') {
        if (addonSelections[a.id] === undefined) addonSelections[a.id] = 0
      } else if (addonToggles[a.id] === undefined) {
        addonToggles[a.id] = false
      }
    }
  }, { immediate: true })

  // ─── v0.31 F3: 折扣码（验证 → 预估折扣展示 → 提交时传码，后端真正扣减） ───
  /** 画师是否开启折扣功能（getPricing 返回 discountEnabled） */
  const discountEnabled = computed(() => !!pricingData.value?.discountEnabled)
  /** 验证结果 { discountType: 'percent'|'fixed', discountValue: number } | null */
  const discountResult = ref(null)
  const discountError = ref('')
  const discountValidating = ref(false)

  /** 验证折扣码（公开 API，需 subdomain） */
  async function validateDiscountCode() {
    const code = form.discountCode.trim()
    if (!code) return
    discountValidating.value = true
    discountError.value = ''
    try {
      const res = await artistPublicApi.validateDiscount({ subdomain, code })
      discountResult.value = { discountType: res.discountType, discountValue: res.discountValue }
      // v0.32: 画风模式下验证通过后立即重算价格（calculate-style-price 含折扣）
      if (isStyleMode.value && selectedSizeId.value) scheduleStyleCalc()
    } catch (err) {
      discountResult.value = null
      discountError.value = err.message
    } finally {
      discountValidating.value = false
    }
  }

  /** 清除折扣码（修改码/切换档位时调用） */
  function clearDiscount() {
    discountResult.value = null
    discountError.value = ''
    // v0.32: 画风模式下折扣码变化需重算价格（calculate-style-price 含折扣）
    if (isStyleMode.value && selectedSizeId.value) scheduleStyleCalc()
  }

  // 输入框内容变化 → 清除旧验证结果（防止码改了但折扣还挂着）
  watch(() => form.discountCode, clearDiscount)

  /**
   * 预估折扣金额（元）。先倍率后折扣（REQ-023 已定）：
   * pricePreview.totalPrice 已含倍率，折扣在此基础上计算。
   * 前端仅做展示估算，实际扣减由后端下单时计算。
   */
  const discountPreviewYuan = computed(() => {
    const total = pricePreview.value?.totalPrice
    if (!discountResult.value || total == null || total <= 0) return 0
    const { discountType, discountValue } = discountResult.value
    if (discountType === 'percent') return total * discountValue / 100
    if (discountType === 'fixed') return Math.min(discountValue, total)
    return 0
  })

  /** 折扣后预估总价（元） */
  const discountedTotalYuan = computed(() => {
    const total = pricePreview.value?.totalPrice ?? 0
    return Math.max(0, total - discountPreviewYuan.value)
  })

  // ─── v0.32 REQ-023 Phase2: 画风选择 + 计价 + 提交 ───

  /** 选择画风（多画风步骤 1） */
  function selectStyle(id) {
    if (selectedStyleId.value === id) return
    selectedStyleId.value = id
    // 切换画风时重置尺寸和增项
    selectedSizeId.value = null
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    stylePricePreview.value = null
    stylePricingExpanded.value = false
  }

  /** 选择尺寸（步骤 2） */
  function selectSize(id) {
    if (selectedSizeId.value === id) return
    selectedSizeId.value = id
    // 切换尺寸时重置增项选择（不同尺寸可用增项不同）
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    stylePricePreview.value = null
    initStyleAddonDefaults()
    scheduleStyleCalc()
  }

  /**
   * v0.34 任务B：应用 URL query 预选（?styleId=&sizeId=）
   * 主页画风展示柜选好画风+尺寸后跳转带入，用户无需重新点选。
   * 无效/已停用 ID 静默忽略，走正常流程。优先于草稿恢复。
   */
  function applyQueryPreselect() {
    const q = initialQuery || {}
    const qStyleId = Number(q.styleId)
    const qSizeId = Number(q.sizeId)
    // 画风：styleId 有效 → 直接选中（多画风跳过重新点选）
    if (Number.isInteger(qStyleId) && styles.value.some(s => s.id === qStyleId)) {
      selectedStyleId.value = qStyleId
      queryPreselect.styleId = qStyleId
    }
    // 尺寸：在当前已选画风（query 选中或单画风自动选中）的 sizes 里有效才预选
    if (Number.isInteger(qSizeId) && selectedStyleId.value != null) {
      const style = styles.value.find(s => s.id === selectedStyleId.value)
      const size = (style?.sizes || []).find(sz => sz.id === qSizeId)
      if (size) {
        selectedSizeId.value = qSizeId
        initStyleAddonDefaults()
        scheduleStyleCalc()
        queryPreselect.sizeId = qSizeId
      }
    }
  }

  /** 初始化增项默认值（el-input-number 不接受 undefined） */
  function initStyleAddonDefaults() {
    for (const a of availableStyleAddons.value) {
      if (!styleAddonSelections[a.id]) {
        styleAddonSelections[a.id] = { toggled: false, quantity: 0, optionLabel: null }
      }
    }
  }

  /** 构建已选增项列表（计价与提交共用） */
  function buildStyleAddons() {
    const addons = []
    for (const a of availableStyleAddons.value) {
      const sel = styleAddonSelections[a.id]
      if (!sel) continue
      if (a.control_type === 'switch' && sel.toggled) {
        addons.push({ styleAddonId: a.id })
      } else if (a.control_type === 'quantity' && sel.quantity > 0) {
        addons.push({ styleAddonId: a.id, quantity: sel.quantity })
      } else if (a.control_type === 'radio' && sel.optionLabel) {
        addons.push({ styleAddonId: a.id, optionLabel: sel.optionLabel })
      }
    }
    return addons
  }

  /** 画风价格计算（防抖 300ms，全走后端 API） */
  let styleCalcTimer = null
  function scheduleStyleCalc() {
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
    styleCalcTimer = setTimeout(doStyleCalc, 300)
  }

  async function doStyleCalc() {
    if (!selectedSizeId.value) { stylePricePreview.value = null; return }
    try {
      stylePricePreview.value = await artistPublicApi.calculateStylePrice({
        subdomain,
        styleSizeId: selectedSizeId.value,
        addons: buildStyleAddons(),
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId,
        discountCode: form.discountCode.trim() || null
      })
    } catch {
      stylePricePreview.value = null
    }
  }

  // 监听增项/倍率/折扣变化 → 触发画风计价
  watch(styleAddonSelections, scheduleStyleCalc, { deep: true })
  watch([() => form.usageMultiplierId, () => form.rushMultiplierId], () => {
    if (isStyleMode.value && selectedSizeId.value) scheduleStyleCalc()
  })

  /** 解析 radio 选项 JSON（安全回退空数组） */
  function parseAddonOptions(optionsJson) {
    if (!optionsJson) return []
    try {
      const parsed = JSON.parse(optionsJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  /** 画风模式展示价（优先后端计价结果，未计价时回退尺寸基础价） */
  const styleDisplayPrice = computed(() =>
    stylePricePreview.value?.totalPrice ?? selectedSize.value?.base_price ?? 0
  )

  /** 画风模式是否有计价增项（控制"详细计价"展开入口） */
  const hasStylePricingExtras = computed(() =>
    availableStyleAddons.value.length > 0 || usageMultipliers.value.length > 0 || rushMultipliers.value.length > 0
  )

  // ─── R57: 表单防丢失（beforeunload 拦截 + sessionStorage 草稿） ───
  const DRAFT_KEY = `orderForm_draft_${subdomain}`

  /** 表单是否有内容（任一字段非空）——决定 beforeunload 拦截与草稿保存 */
  const hasDraftContent = computed(() =>
    form.tierId != null
    // v0.33: 画风状态算内容。多画风下"用户主动选了画风"即算；
    // 单画风自动选中不算（否则刚进页面就拦截离开+弹恢复框，见 restoreDraft 幂等要求）
    || (isMultiStyle.value && selectedStyleId.value != null)
    || selectedSizeId.value != null
    || !!form.description.trim()
    || !!form.clientQq.trim()
    || !!form.clientName.trim()
    || Object.values(addonSelections).some(v => v > 0)
    || Object.values(addonToggles).some(Boolean)
    || Object.values(styleAddonSelections).some(s => s && (s.toggled || s.quantity > 0 || s.optionLabel != null))
  )

  function saveDraft() {
    if (!hasDraftContent.value) {
      sessionStorage.removeItem(DRAFT_KEY)
      return
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: {
          tierId: form.tierId,
          description: form.description,
          clientQq: form.clientQq,
          clientName: form.clientName,
          notifyEnabled: form.notifyEnabled,
          usageMultiplierId: form.usageMultiplierId,
          rushMultiplierId: form.rushMultiplierId
        },
        addonSelections: { ...addonSelections },
        addonToggles: { ...addonToggles },
        // v0.33: 画风三步走状态（styleId/sizeId/增项勾选），恢复时按 isStyleMode 互斥取用
        styleState: {
          styleId: selectedStyleId.value,
          sizeId: selectedSizeId.value,
          addonSelections: { ...styleAddonSelections }
        }
      }))
    } catch { /* Ignore when sessionStorage is unavailable (private mode, etc.) */ }
  }

  let draftTimer = null
  function scheduleDraftSave() {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraft, 500)
  }

  watch(
    [() => form.tierId, () => form.description, () => form.clientQq, () => form.clientName,
      () => form.notifyEnabled, () => form.usageMultiplierId, () => form.rushMultiplierId],
    scheduleDraftSave
  )
  watch(addonSelections, scheduleDraftSave, { deep: true })
  watch(addonToggles, scheduleDraftSave, { deep: true })
  // v0.33: 画风三步走状态变化也要存草稿（刷新后不丢选择）
  watch(selectedStyleId, scheduleDraftSave)
  watch(selectedSizeId, scheduleDraftSave)
  watch(styleAddonSelections, scheduleDraftSave, { deep: true })

  /**
   * 恢复草稿（styles/tiers 加载后调用）
   * v0.33: 按当前 isStyleMode 互斥恢复——画风模式恢复 styleState，旧模型恢复 tierId，
   * 不交叉污染（草稿可能同时含两组状态）。画风/尺寸/增项若已被画师删除则逐项丢弃。
   */
  function restoreDraft(draft) {
    const f = draft.form || {}

    if (isStyleMode.value) {
      // ── 画风模式：恢复三步走状态，旧模型字段置空 ──
      form.tierId = null
      for (const key of Object.keys(addonSelections)) delete addonSelections[key]
      for (const key of Object.keys(addonToggles)) delete addonToggles[key]

      const ss = draft.styleState || {}
      // v0.34 任务B：URL query 预选 > 草稿恢复——query 已预选的项不被草稿覆盖
      if (!queryPreselect.styleId && ss.styleId != null) {
        // 与单画风自动选中相同值时幂等（ref 等值赋值不触发 watcher）
        const style = styles.value.find(s => s.id === ss.styleId)
        if (style) selectedStyleId.value = ss.styleId
      }
      const currentStyle = styles.value.find(s => s.id === selectedStyleId.value)
      if (!queryPreselect.sizeId) {
        const size = currentStyle && ss.sizeId != null ? (currentStyle.sizes || []).find(sz => sz.id === ss.sizeId) : null
        if (size) {
          selectedSizeId.value = ss.sizeId
          // 增项勾选只恢复当前尺寸可用增项中存在的键（其余可能已删/已隐藏）
          const validIds = new Set((size.addons || []).map(a => a.id))
          const saved = ss.addonSelections || {}
          for (const key of Object.keys(saved)) {
            const id = Number(key)
            if (validIds.has(id)) {
              styleAddonSelections[id] = { toggled: false, quantity: 0, optionLabel: null, ...saved[key] }
            }
          }
          // 补齐其余可用增项默认值（模板 v-model 不接受 undefined）
          initStyleAddonDefaults()
          // v0.33: 倍率是共用字段，画风模式增项步骤也可选——尺寸有效时一并恢复
          form.usageMultiplierId = f.usageMultiplierId ?? null
          form.rushMultiplierId = f.rushMultiplierId ?? null
        }
      } else {
        // query 已预选尺寸：增项以 query 为准，倍率仍从草稿恢复
        form.usageMultiplierId = f.usageMultiplierId ?? null
        form.rushMultiplierId = f.rushMultiplierId ?? null
      }
      // 尺寸有效 → 重算价格预览（防抖，多次触发合并为一次）
      if (selectedSizeId.value) scheduleStyleCalc()
    } else {
      // ── 旧模型（tiers）：原逻辑保留，档位被删则丢弃该字段 ──
      const tierValid = f.tierId != null && tiers.value.some(tier => tier.id === f.tierId)
      form.tierId = tierValid ? f.tierId : null
      form.usageMultiplierId = tierValid ? (f.usageMultiplierId ?? null) : null
      form.rushMultiplierId = tierValid ? (f.rushMultiplierId ?? null) : null
      if (tierValid && draft.addonSelections) Object.assign(addonSelections, draft.addonSelections)
      if (tierValid && draft.addonToggles) Object.assign(addonToggles, draft.addonToggles)
    }

    // ── 文本字段两种模式通用 ──
    form.description = f.description || ''
    form.clientQq = f.clientQq || ''
    form.clientName = f.clientName || ''
    form.notifyEnabled = f.notifyEnabled !== false
  }

  /** beforeunload：表单有内容时拦截（浏览器原生确认弹窗） */
  function onBeforeUnload(e) {
    if (!hasDraftContent.value) return
    e.preventDefault()
    e.returnValue = ''
  }

  // ─── 参考图上传（文件选择） ───
  async function handleRefUpload({ file }) {
    if (file.size > 10 * 1024 * 1024) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      ElMessage.warning(t('orderForm.fileTooBig', { name: file.name, size: sizeMB }))
      return
    }
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      ElMessage.info(t('orderForm.typeWarning'))
    }
    try {
      const uploaded = await uploadApi.reference(file)
      uploadedRefs.value.push(uploaded.filePath)
      refUidMap.value.set(file.uid, uploaded.filePath)
    } catch (err) {
      ElMessage.error(err.message || t('common.uploadFailed'))
      throw err
    }
  }

  function handleRefRemove(file) {
    const filePath = refUidMap.value.get(file.uid)
    if (filePath) {
      const idx = uploadedRefs.value.indexOf(filePath)
      if (idx > -1) uploadedRefs.value.splice(idx, 1)
      refUidMap.value.delete(file.uid)
    }
  }

  // ─── 粘贴上传（参考图） ───
  async function handlePasteRefFiles(files) {
    for (const file of files) {
      if (refFileList.value.length >= 5) {
        ElMessage.warning(t('orderForm.refExceed'))
        return
      }
      const ext = (file.name || '').split('.').pop().toLowerCase()
      if (ext && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        ElMessage.info(t('orderForm.typeWarning'))
      }
      const uploaded = await uploadApi.reference(file)
      uploadedRefs.value.push(uploaded.filePath)
      const uid = `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`
      refUidMap.value.set(uid, uploaded.filePath)
      refFileList.value.push({ name: file.name || 'pasted-image.png', url: uploaded.url, uid, status: 'success' })
    }
  }

  const { pasteError } = usePasteUpload({
    onFiles: handlePasteRefFiles,
    maxCount: 5,
    maxSizeMB: 10
  })
  watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

  // ─── 提交 ───
  async function submit() {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return

    submitting.value = true
    try {
      // v0.32 REQ-023 Phase2: 画风模式 vs 旧模型（tiers）
      // 后端已扩展 POST /orders 接受 styleSizeId + styleAddons（8b519aa），服务端自动算价
      const isStyleSubmit = isStyleMode.value && selectedStyle.value && selectedSize.value

      const order = await orderApi.create({
        subdomain,
        tierId: isStyleSubmit ? null : form.tierId,
        // 画风模式：结构化字段（后端验证+算价+创建）
        ...(isStyleSubmit ? {
          styleSizeId: selectedSizeId.value,
          styleAddons: buildStyleAddons()
        } : {}),
        description: form.description.trim(),
        clientQq: form.clientQq.trim(),
        clientName: form.clientName.trim(),
        clientNotify: form.notifyEnabled,
        agreeRules: form.agreed,
        references: uploadedRefs.value,
        addons: isStyleSubmit ? [] : buildSelectedAddons(), // 画风模式不传旧增项
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId,
        // v0.31 F3: 折扣码传后端，后端负责验证+扣减+incrementUsage
        discountCode: form.discountCode.trim() || null
      })
      resultNo.value = order.orderNo
      showSuccess.value = true
      // R57: 提交成功清除草稿 + 解除离开拦截
      sessionStorage.removeItem(DRAFT_KEY)
      window.removeEventListener('beforeunload', onBeforeUnload)
    } catch (err) {
      ElMessage.error(err.message)
    } finally {
      submitting.value = false
    }
  }

  // ─── 初始化 ───
  onMounted(async () => {
    // R57: 表单有内容时拦截页面关闭/刷新
    window.addEventListener('beforeunload', onBeforeUnload)
    try {
      const data = await artistPublicApi.getProfile(subdomain)
      artist.value = data
      tiers.value = data.tiers || []
      rulesContent.value = data.rules || ''
      // 加载流程（静默失败不阻塞下单）
      artistPublicApi.getWorkflow(subdomain)
        .then(res => { workflowStages.value = res.stages || [] })
        .catch(() => {})
      // 加载价格数据（增项+倍率）
      artistPublicApi.getPricing(subdomain)
        .then(res => { pricingData.value = res })
        .catch(() => {})

      // v0.32 REQ-023 Phase2: 加载画风列表（await 保证步骤列表渲染前稳定；失败静默走旧模型兜底）
      try {
        const styleRes = await artistPublicApi.getPublicStyles(subdomain)
        styles.value = styleRes || []
        // 单画风自动选中（退化为扁平模型，跳过选画风步骤）
        if (styles.value.length === 1) {
          selectedStyleId.value = styles.value[0].id
        }
      } catch { /* 静默失败：走旧模型（tiers） */ }

      // v0.34 任务B：URL query 预选（优先于草稿恢复，restoreDraft 里不覆盖已预选的项）
      applyQueryPreselect()

      // R57: 草稿恢复（tiers 加载后校验档位有效性）
      let draft = null
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        if (raw) draft = JSON.parse(raw)
      } catch { /* 损坏的草稿直接丢弃 */ }
      if (draft) {
        try {
          await ElMessageBox.confirm(
            t('orderForm.draftFound'),
            t('orderForm.draftTitle'),
            {
              confirmButtonText: t('orderForm.draftRestore'),
              cancelButtonText: t('orderForm.draftDiscard'),
              type: 'info'
            }
          )
          restoreDraft(draft)
          ElMessage.success(t('orderForm.draftRestored'))
        } catch {
          sessionStorage.removeItem(DRAFT_KEY)
        }
      }
    } catch (err) {
      ElMessage.error(err.message || t('orderForm.loadFailed'))
    } finally {
      loading.value = false
    }
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (draftTimer) clearTimeout(draftTimer)
    if (calcTimer) clearTimeout(calcTimer)
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
  })

  return {
    // 数据加载
    artist, tiers, rulesContent, loading, workflowStages, pricingData,
    // 表单 + 校验
    form, rules,
    // R57 草稿状态（v0.33: 导出供测试验证画风状态是否算"有内容"）
    hasDraftContent,
    // 提交状态
    submitting, showSuccess, resultNo, submit,
    // 参考图
    refFileList, handleRefUpload, handleRefRemove,
    // 计价
    addonSelections, addonToggles, pricePreview, pricingExpanded,
    selectedTier, hasPricingExtras, availableAddons, addonGroups,
    usageMultipliers, rushMultipliers, formatAddonPrice, onTierChange,
    // 须知预览
    sanitizedRules,
    // v0.31 F3: 折扣码
    discountEnabled, discountResult, discountError, discountValidating,
    validateDiscountCode, discountPreviewYuan, discountedTotalYuan,
    // v0.32 REQ-023 Phase2: 多画风
    styles, isStyleMode, isMultiStyle,
    selectedStyleId, selectedStyle, selectedSizeId, selectedSize,
    availableStyleAddons, styleAddonSelections,
    selectStyle, selectSize, buildStyleAddons, parseAddonOptions,
    stylePricePreview, stylePricingExpanded, styleDisplayPrice, hasStylePricingExtras,
    // v0.34 任务B：URL query 预选命中记录
    queryPreselect
  }
}
