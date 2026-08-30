/**
 * useOrderForm — 约稿表单业务逻辑核心（R58-1；SPEC-PRICE-2 v50 统一价格模型）
 *
 * 将约稿表单的全部业务逻辑从页面组件中剥离，使页面只保留布局与样式。
 * 分步引导布局、以及未来的下单页多模板（小票风/杂志风等）
 * 都将共享此逻辑核心——模板只负责布局壳，逻辑零重复。
 *
 * SPEC-PRICE-2 唯一计价公式（与后端 calculate-style-price 严格一致）：
 *   最终价 = (基础价 + Σ固定增项 + Σ百分比增项[只按基础价]) × 用途 × 加急 − 折扣
 * 增项三类（后端 category 真实维度）：
 *   - add 普通增项：多选共存（开关类/个数类，支持 ¥ 或 %）
 *   - usage 用途：顾客最多选一个
 *   - rush 加急：顾客最多选一个
 *
 * 封装的能力：
 * - 数据加载：画师资料 / 画风与尺寸 / 须知 / 流程 / 折扣开关与分期比例
 * - 画风 → 尺寸 → 增项三步选择 + 实时计价（300ms 防抖调后端 calculate-style-price）
 * - 表单校验规则（QQ 必填 / 须知同意必勾）
 * - 参考图上传（文件选择 + Ctrl+V 粘贴，走相同校验）
 * - 订单提交（API 调用 + 错误 toast + loading + 成功弹窗状态）
 * - R57 表单防丢失（sessionStorage 草稿 + beforeunload 拦截 + 恢复询问）
 *
 * 用法：
 *   const formRef = ref(null)          // 模板中 el-form 的 ref
 *   const of = useOrderForm(subdomain, formRef)
 *
 * @param subdomain 画师子域名（来自 route.params）
 * @param formRef 页面模板中 el-form 的 ref（提交时校验用）
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { artistPublicApi, orderApi } from '../api/index'
import type { ApiError } from '../api/index'
import { fetchArtistPublicProfile } from './useArtistPublicProfile'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../utils/sanitize'
import { usePasteUpload } from './usePasteUpload'
import { formatAddonPrice, yuanToCents } from '../utils/money'
import { getAnonToken } from '../utils/track'
import { uploadReferenceWithAnonToken, AnonTokenUnavailableError } from '../utils/anonUpload'
import { MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_IMAGE_MB } from '../constants/upload'
import type {
  ArtistPublicProfile, PublicArtStyle, PublicStyleAddon, PublicPricingResult,
  StylePriceResult, StyleAddonSelection, WorkflowStageDTO
} from '../api/types'
import type { DiscountResult, RefFileItem, InstallmentItem } from '../views/client/order-form/types'

/** 普通增项选择状态记录（{ [styleAddonId]: { toggled, quantity } }） */
interface AddonSelRecord {
  toggled: boolean
  quantity: number
  optionLabel?: string | undefined
}

/** sessionStorage 草稿形状（JSON.parse 产物，字段全部宽松） */
interface OrderFormDraft {
  form?: { description?: unknown; clientQq?: unknown; clientName?: unknown; notifyEnabled?: unknown }
  styleState?: {
    styleId?: number | null
    sizeId?: number | null
    addonSelections?: Record<string, { toggled?: boolean; quantity?: number }>
    usageId?: number | null
    rushId?: number | null
  }
}

/** el-form ref 最小结构（提交时只做 validate） */
interface OrderFormRefLike {
  validate: () => Promise<unknown>
}

export function useOrderForm(subdomain: string, formRef: Ref<OrderFormRefLike | null>, initialQuery: Record<string, unknown> = {}) {
  const { t } = useI18n()

  // ─── 数据加载状态 ───
  const artist = ref<ArtistPublicProfile | null>(null)
  const rulesContent = ref('')
  const loading = ref(true)
  const workflowStages = ref<WorkflowStageDTO[]>([])
  /** 公开报价元数据（getPricing：installments 分期比例 + discountEnabled） */
  const pricingData = ref<PublicPricingResult | null>(null)

  // ─── 画风/尺寸状态（SPEC-PRICE-2 唯一下单模型） ───
  /** 公开画风列表（GET /public/styles/:subdomain，只含 is_active=1） */
  const styles = ref<PublicArtStyle[]>([])
  /** 画风模式：有画风数据时可用（styles.length > 0） */
  const isStyleMode = computed(() => styles.value.length > 0)
  /** 多画风：需要选画风步骤（styles.length > 1）；单画风退化为扁平模型 */
  const isMultiStyle = computed(() => styles.value.length > 1)
  /** 选中的画风 ID（单画风时自动选中唯一项） */
  const selectedStyleId = ref<number | null>(null)
  const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
  /** 选中的尺寸 ID */
  const selectedSizeId = ref<number | null>(null)
  const selectedSize = computed(() => selectedStyle.value?.sizes?.find(sz => sz.id === selectedSizeId.value) || null)
  /** 当前尺寸下可用增项（后端已过滤 is_hidden；含 category 维度） */
  const availableStyleAddons = computed(() => selectedSize.value?.addons || [])
  /** 普通增项（多选共存） */
  const regularAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'add'))
  /** 用途可选项（顾客最多选一个） */
  const usageAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'usage'))
  /** 加急可选项（顾客最多选一个） */
  const rushAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'rush'))
  /**
   * 普通增项选择状态 { [styleAddonId]: { toggled, quantity } }
   * switch → toggled; quantity → quantity>0
   */
  const styleAddonSelections = reactive<Record<string, AddonSelRecord>>({})
  /** 用途/加急单选（styleAddonId；null = 不选） */
  const selectedUsageId = ref<number | null>(null)
  const selectedRushId = ref<number | null>(null)
  /** 画风价格预览（calculate-style-price 响应，全整数分口径） */
  const stylePricePreview = ref<StylePriceResult | null>(null)
  /** K1-3：计价失败错误文案（走 discountError 同款页内错误态，禁止静默消失） */
  const styleCalcError = ref('')
  const stylePricingExpanded = ref(false)

  // ─── v0.34 任务B：URL query 预选（主页选画风+尺寸后跳转带入） ───
  /** query 预选命中记录（restoreDraft 跳过依据 + OrderForm 初始步骤依据） */
  const queryPreselect = reactive<{ styleId: number | null; sizeId: number | null }>({ styleId: null, sizeId: null })

  /**
   * v0.35 F4: 预选摘要横幅文案（REQ-024 F4-3：预选择必须可见、可改）。
   * 入口 A（展示柜带 query）预选命中时显示；用户手动改选后自动隐藏（此时摘要卡已反映实选）。
   */
  const preselectBannerText = computed(() => {
    if (!isStyleMode.value) return ''
    const styleHit = queryPreselect.styleId != null && selectedStyleId.value === queryPreselect.styleId
    const sizeHit = queryPreselect.sizeId != null && selectedSizeId.value === queryPreselect.sizeId
    if (styleHit && sizeHit && selectedStyle.value && selectedSize.value) {
      return t('orderForm.preselectedBoth', { style: selectedStyle.value.name, size: selectedSize.value.name })
    }
    // 仅画风预选：多画风才提示（单画风无「选画风」概念，与退化逻辑一致）
    if (styleHit && isMultiStyle.value && selectedSizeId.value == null && selectedStyle.value) {
      return t('orderForm.preselectedStyle', { style: selectedStyle.value.name })
    }
    return ''
  })

  // ─── 表单状态 ───
  const form = reactive({
    description: '',
    clientQq: '',
    clientName: '',
    notifyEnabled: true,
    agreed: false,
    // REQ-042: 首单须勾选「已阅读服务条款/隐私政策」（前端门禁，未勾不可提交）
    termsAgreed: false,
    discountCode: '' // v0.31 F3: 折扣码（验证通过后随订单提交，后端负责真正扣减）
  })

  // ─── 校验规则 ───
  const rules = {
    clientQq: [{ required: true, message: () => t('orderForm.fillQq'), trigger: 'blur' }],
    agreed: [{
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        // R24：错误文案走 order.validation 命名空间（弹窗与行内提示一致）
        if (rulesContent.value && !value) callback(new Error(t('order.validation.agreeRequired')))
        else callback()
      },
      trigger: 'change'
    }],
    // REQ-042: 服务条款/隐私政策同意（恒必勾，与画师须知 agreed 相互独立）
    termsAgreed: [{
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        if (!value) callback(new Error(t('order.validation.termsRequired')))
        else callback()
      },
      trigger: 'change'
    }]
  }

  // ─── 提交 / 成功状态 ───
  const submitting = ref(false)
  const showSuccess = ref(false)
  const resultNo = ref('')
  // F1 围剿：下单成功响应一次下发客户令牌 + 完整追踪 URL（成功态展示/扫码/复制）
  const customerToken = ref('')
  const trackUrl = ref('')
  // D-2（R-9）: 下单幂等键——同一次提交意图（失败重试）复用同 key，
  // 提交成功后置空（下一次提交 = 新意图，换新 key）。后端按 scope+key 去重，
  // 防双标签页/慢渲染双击产生两个订单；服务端错误不缓存，重试不受影响。
  let submitIdemKey: string | null = null

  // ─── 参考图上传 ───
  const refFileList = ref<RefFileItem[]>([])
  const uploadedRefs = ref<string[]>([])
  const refUidMap = ref(new Map<string | number, string>())
  /** 本次会话成功上传参考图时实际使用的匿名凭证——下单提交必须与上传同源（F-10 归属校验） */
  let refUploadToken: string | null = null

  // ─── 计算属性 ───
  const sanitizedRules = computed(() => sanitizeHtml(rulesContent.value))

  /** 增项单价展示文本（¥50 / ¥80/位 / +50%；读公开接口真实 price_mode/category） */
  function styleAddonPriceText(a: PublicStyleAddon) {
    // 813-fq-tail-shared 战役 S：单位缺省改走 i18n（styleManage.unitFallback），不再依赖 money.js 内置「位」
    return formatAddonPrice(a.price, a.price_mode, { controlType: a.control_type, unitLabel: a.unit_label || t('styleManage.unitFallback') })
  }

  // ─── 折扣码（验证 → 预估折扣展示 → 提交时传码，后端真正扣减） ───
  /** 画师是否开启折扣功能（getPricing 返回 discountEnabled） */
  const discountEnabled = computed(() => !!pricingData.value?.discountEnabled)
  /** 验证结果 { discountType: 'percent'|'fixed', discountValue: number } | null */
  const discountResult = ref<DiscountResult | null>(null)
  const discountError = ref('')
  const discountValidating = ref(false)
  // a3: 验证序号——A 码在途时改输入为 B 码，A 的晚到响应不得回写旧折扣结果
  let discountValidationSeq = 0

  /** 验证折扣码（公开 API，需 subdomain） */
  async function validateDiscountCode() {
    const code = form.discountCode.trim()
    if (!code) return
    const mySeq = ++discountValidationSeq
    discountValidating.value = true
    discountError.value = ''
    try {
      const res = await artistPublicApi.validateDiscount({ subdomain, code })
      if (mySeq !== discountValidationSeq) return
      discountResult.value = { discountType: res.discountType, discountValue: res.discountValue }
      // 验证通过后立即重算价格（calculate-style-price 含折扣）
      if (selectedSizeId.value) scheduleStyleCalc()
    } catch (err) {
      if (mySeq !== discountValidationSeq) return
      discountResult.value = null
      discountError.value = (err as ApiError).message
    } finally {
      if (mySeq === discountValidationSeq) discountValidating.value = false
    }
  }

  /** 清除折扣码（修改码时调用） */
  function clearDiscount() {
    discountResult.value = null
    discountError.value = ''
    if (selectedSizeId.value) scheduleStyleCalc()
  }

  // 输入框内容变化 → 清除旧验证结果（防止码改了但折扣还挂着）
  watch(() => form.discountCode, clearDiscount)

  /**
   * 预估折扣金额（分）。与后端 computeDiscountCents 同口径：
   * percent = floor(倍率后总价 × value/100)；fixed = min(value元, 总价)。
   */
  const discountPreviewCents = computed(() => {
    const baseCents = stylePricePreview.value?.afterMultipliersCents
    if (!discountResult.value || baseCents == null || baseCents <= 0) return 0
    const { discountType, discountValue } = discountResult.value
    if (discountType === 'percent') return Math.floor(baseCents * discountValue / 100)
    if (discountType === 'fixed') return Math.min(yuanToCents(discountValue), baseCents)
    return 0
  })

  /** 折扣后预估总价（元；展示用，整数分换算） */
  const discountedTotalYuan = computed(() => {
    const baseCents = stylePricePreview.value?.afterMultipliersCents ?? 0
    return Math.max(0, baseCents - discountPreviewCents.value) / 100
  })

  // ─── 画风选择 + 计价 + 提交 ───

  /** 选择画风（多画风步骤 1） */
  function selectStyle(id: number) {
    if (selectedStyleId.value === id) return
    selectedStyleId.value = id
    // 切换画风时重置尺寸、增项与用途/加急选择
    selectedSizeId.value = null
    resetAddonSelections()
    stylePricePreview.value = null
    styleCalcError.value = ''
    stylePricingExpanded.value = false
  }

  function resetAddonSelections() {
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    selectedUsageId.value = null
    selectedRushId.value = null
  }

  /** 选择尺寸（步骤 2）；展示态（showcase）尺寸不可选，明确提示 */
  function selectSize(id: number) {
    if (selectedSizeId.value === id) return
    const size = (selectedStyle.value?.sizes || []).find(sz => sz.id === id)
    if (!size) return
    if (size.display_status === 'showcase') {
      ElMessage.info(t('orderForm.sizeShowcaseBlocked'))
      return
    }
    selectedSizeId.value = id
    // 切换尺寸时重置增项选择（不同尺寸可用增项不同）
    resetAddonSelections()
    stylePricePreview.value = null
    styleCalcError.value = ''
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
    // 尺寸：在当前已选画风（query 选中或单画风自动选中）的 sizes 里有效才可预选（展示态除外）
    if (Number.isInteger(qSizeId) && selectedStyleId.value != null) {
      const style = styles.value.find(s => s.id === selectedStyleId.value)
      const size = (style?.sizes || []).find(sz => sz.id === qSizeId && sz.display_status !== 'showcase')
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
    for (const a of regularAddons.value) {
      if (!styleAddonSelections[a.id]) {
        styleAddonSelections[a.id] = { toggled: false, quantity: 0 }
      }
    }
  }

  /** 用途/加急单选（再点已选项 = 取消） */
  function toggleUsage(id: number) {
    selectedUsageId.value = selectedUsageId.value === id ? null : id
  }
  function toggleRush(id: number) {
    selectedRushId.value = selectedRushId.value === id ? null : id
  }

  /** 构建已选增项列表（计价与提交共用；普通增项 + 用途/加急单选） */
  function buildStyleAddons(): StyleAddonSelection[] {
    const addons: StyleAddonSelection[] = []
    for (const a of regularAddons.value) {
      const sel = styleAddonSelections[a.id]
      if (!sel) continue
      if (a.control_type === 'switch' && sel.toggled) {
        addons.push({ styleAddonId: a.id })
      } else if (a.control_type === 'quantity' && sel.quantity > 0) {
        addons.push({ styleAddonId: a.id, quantity: sel.quantity })
      }
    }
    if (selectedUsageId.value != null) addons.push({ styleAddonId: selectedUsageId.value })
    if (selectedRushId.value != null) addons.push({ styleAddonId: selectedRushId.value })
    return addons
  }

  /** 画风价格计算（防抖 300ms，全走后端 calculate-style-price） */
  let styleCalcTimer: number | null = null
  // 竞态保护：请求序号（慢请求不得覆盖快请求）
  let styleCalcSeq = 0
  function scheduleStyleCalc() {
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
    styleCalcTimer = setTimeout(doStyleCalc, 300)
  }

  async function doStyleCalc() {
    const mySeq = ++styleCalcSeq
    const sizeId = selectedSizeId.value
    if (!sizeId) { stylePricePreview.value = null; styleCalcError.value = ''; return }
    styleCalcError.value = ''
    try {
      const res = await artistPublicApi.calculateStylePrice({
        subdomain,
        styleSizeId: sizeId,
        addons: buildStyleAddons(),
        discountCode: form.discountCode.trim() || null
      })
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = res
    } catch (err) {
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = null
      styleCalcError.value = (err as Error)?.message || t('orderForm.priceCalcFailed')
    }
  }

  // 监听增项/用途/加急变化 → 触发计价
  watch(styleAddonSelections, scheduleStyleCalc, { deep: true })
  watch([selectedUsageId, selectedRushId], () => {
    if (selectedSizeId.value) scheduleStyleCalc()
  })

  /** 展示价（元）：优先后端计价结果总价，未计价时回退尺寸基础价 */
  const styleDisplayPrice = computed(() => {
    if (stylePricePreview.value?.totalCents != null) return stylePricePreview.value.totalCents / 100
    return selectedSize.value?.base_price ?? 0
  })

  /** 是否有可选增项/用途/加急（控制增项步骤内容展示） */
  const hasStylePricingExtras = computed(() => availableStyleAddons.value.length > 0)

  /**
   * 分期预估（展示用，与后端 allocateInitial 同口径：各节点 round(总价×bp/10000)，尾差归末节点）
   * 总价取当前预估（含折扣）；未计价时为空。
   */
  const installmentPreview = computed<InstallmentItem[]>(() => {
    const stages = pricingData.value?.installments || []
    const preview = stylePricePreview.value
    if (!stages.length || !preview || preview.totalCents == null) return []
    const total = preview.totalCents
    const items = stages.map(s => ({ label: s.label, amountCents: Math.round(total * s.basisPoints / 10000) }))
    // 尾差归末节点（与后端一致）
    const sum = items.reduce((acc, it) => acc + it.amountCents, 0)
    if (items.length) items[items.length - 1].amountCents += total - sum
    return items
  })

  // ─── R57: 表单防丢失（beforeunload 拦截 + sessionStorage 草稿） ───
  const DRAFT_KEY = `orderForm_draft_${subdomain}`

  /** 表单是否有内容（任一字段非空）——决定 beforeunload 拦截与草稿保存 */
  const hasDraftContent = computed(() =>
    // 多画风下"用户主动选了画风"即算；单画风自动选中不算（否则刚进页面就拦截离开+弹恢复框）
    (isMultiStyle.value && selectedStyleId.value != null)
    || selectedSizeId.value != null
    || !!form.description.trim()
    || !!form.clientQq.trim()
    || !!form.clientName.trim()
    || selectedUsageId.value != null
    || selectedRushId.value != null
    || Object.values(styleAddonSelections).some(s => s && (s.toggled || s.quantity > 0))
  )

  function saveDraft() {
    if (!hasDraftContent.value) {
      sessionStorage.removeItem(DRAFT_KEY)
      return
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: {
          description: form.description,
          clientQq: form.clientQq,
          clientName: form.clientName,
          notifyEnabled: form.notifyEnabled
        },
        // SPEC-PRICE-2: 三步走状态（画风/尺寸/普通增项勾选/用途/加急）
        styleState: {
          styleId: selectedStyleId.value,
          sizeId: selectedSizeId.value,
          addonSelections: { ...styleAddonSelections },
          usageId: selectedUsageId.value,
          rushId: selectedRushId.value
        }
      }))
    } catch { /* Ignore when sessionStorage is unavailable (private mode, etc.) */ }
  }

  let draftTimer: number | null = null
  function scheduleDraftSave() {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraft, 500)
  }

  watch(
    [() => form.description, () => form.clientQq, () => form.clientName, () => form.notifyEnabled],
    scheduleDraftSave
  )
  watch(selectedStyleId, scheduleDraftSave)
  watch(selectedSizeId, scheduleDraftSave)
  watch(styleAddonSelections, scheduleDraftSave, { deep: true })
  watch([selectedUsageId, selectedRushId], scheduleDraftSave)

  /**
   * 恢复草稿（styles 加载后调用）
   * 画风/尺寸/增项若已被画师删除或尺寸转展示态则逐项丢弃。
   * 旧版本草稿（含 tierId 等字段）静默忽略过时字段。
   */
  function restoreDraft(draft: OrderFormDraft) {
    const f = draft.form || {}
    const ss = draft.styleState || {}

    // v0.34 任务B：URL query 预选 > 草稿恢复——query 已预选的项不被草稿覆盖
    if (!queryPreselect.styleId && ss.styleId != null) {
      // 与单画风自动选中相同值时幂等（ref 等值赋值不触发 watcher）
      const style = styles.value.find(s => s.id === ss.styleId)
      if (style) selectedStyleId.value = ss.styleId
    }
    const currentStyle = styles.value.find(s => s.id === selectedStyleId.value)
    if (!queryPreselect.sizeId) {
      const size = currentStyle && ss.sizeId != null
        ? (currentStyle.sizes || []).find(sz => sz.id === ss.sizeId && sz.display_status !== 'showcase')
        : null
      if (size) selectedSizeId.value = ss.sizeId!
    }
    // a2 猎杀修复：增项/用途/加急恢复独立于尺寸恢复块——query 只预选画风+尺寸，
    // 增项不在预选范围，不该随尺寸块整体跳过（此前带 query 刷新后已填增项全部丢失）；
    // 按当前选中尺寸的可用增项过滤恢复（validIds/usageIds/rushIds 同原口径）
    if (selectedSizeId.value) {
      // 普通增项勾选只恢复当前尺寸可用普通增项中存在的键（其余可能已删/已隐藏）
      const validIds = new Set(regularAddons.value.map(a => a.id))
      const saved = ss.addonSelections || {}
      for (const key of Object.keys(saved)) {
        const id = Number(key)
        if (validIds.has(id)) {
          styleAddonSelections[id] = { toggled: false, quantity: 0, ...saved[key], optionLabel: undefined }
        }
      }
      // 补齐其余可用增项默认值（模板 v-model 不接受 undefined）
      initStyleAddonDefaults()
      // 用途/加急单选只恢复仍在可选项中的 ID
      const usageIds = new Set(usageAddons.value.map(a => a.id))
      const rushIds = new Set(rushAddons.value.map(a => a.id))
      selectedUsageId.value = typeof ss.usageId === 'number' && usageIds.has(ss.usageId) ? ss.usageId : null
      selectedRushId.value = typeof ss.rushId === 'number' && rushIds.has(ss.rushId) ? ss.rushId : null
    }
    // 尺寸有效 → 重算价格预览（防抖，多次触发合并为一次）
    if (selectedSizeId.value) scheduleStyleCalc()

    // ── 文本字段（a2 猎杀修复：形状校验——sessionStorage 被旧版本/篡改写入非字符串时不再致下游 .trim() 崩溃） ──
    form.description = typeof f.description === 'string' ? f.description : ''
    form.clientQq = typeof f.clientQq === 'string' ? f.clientQq : ''
    form.clientName = typeof f.clientName === 'string' ? f.clientName : ''
    form.notifyEnabled = f.notifyEnabled !== false
  }

  /** beforeunload：表单有内容时拦截（浏览器原生确认弹窗） */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!hasDraftContent.value) return
    e.preventDefault()
    e.returnValue = ''
  }

  // ─── 参考图上传（文件选择） ───
  async function handleRefUpload({ file }: { file: File & { uid: string | number } }) {
    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      ElMessage.warning(t('orderForm.fileTooBig', { name: file.name, size: sizeMB }))
      return
    }
    const ext = file.name.split('.').pop()!.toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      ElMessage.info(t('orderForm.typeWarning'))
    }
    try {
      // G-7（P2-13 前端侧）: 上传前 await 凭证；缓存凭证失效（INVALID_ANON_TOKEN）时
      // anonUpload 内部换新重试一次，避免公网用户被旧凭证卡死
      const { uploaded, token } = await uploadReferenceWithAnonToken(file)
      refUploadToken = token
      uploadedRefs.value.push(uploaded.filePath)
      refUidMap.value.set(file.uid, uploaded.filePath)
    } catch (err) {
      if (err instanceof AnonTokenUnavailableError) {
        ElMessage.error(t('orderForm.anonTokenRequired'))
        throw new Error(t('orderForm.anonTokenRequired'), { cause: err })
      }
      ElMessage.error((err as ApiError).message || t('common.uploadFailed'))
      throw err
    }
  }

  function handleRefRemove(file: { uid: string | number }) {
    const filePath = refUidMap.value.get(file.uid)
    if (filePath) {
      const idx = uploadedRefs.value.indexOf(filePath)
      if (idx > -1) uploadedRefs.value.splice(idx, 1)
      refUidMap.value.delete(file.uid)
    }
  }

  // ─── 粘贴上传（参考图） ───
  async function handlePasteRefFiles(files: File[]) {
    for (const file of files) {
      if (refFileList.value.length >= MAX_IMAGE_COUNT) {
        ElMessage.warning(t('orderForm.refExceed'))
        return
      }
      const ext = (file.name || '').split('.').pop()!.toLowerCase()
      if (ext && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        ElMessage.info(t('orderForm.typeWarning'))
      }
      try {
        const { uploaded, token } = await uploadReferenceWithAnonToken(file)
        refUploadToken = token
        uploadedRefs.value.push(uploaded.filePath)
        const uid = `paste-${crypto.randomUUID()}`
        refUidMap.value.set(uid, uploaded.filePath)
        refFileList.value.push({ name: file.name || 'pasted-image.png', url: uploaded.url, uid, status: 'success' })
      } catch (err) {
        if (err instanceof AnonTokenUnavailableError) {
          ElMessage.error(t('orderForm.anonTokenRequired'))
        } else {
          ElMessage.error((err as ApiError).message || t('common.uploadFailed'))
        }
      }
    }
  }

  const { pasteError } = usePasteUpload({
    onFiles: handlePasteRefFiles,
    maxCount: MAX_IMAGE_COUNT,
    maxSizeMB: MAX_IMAGE_MB
  })
  watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

  // ─── 提交 ───
  async function submit() {
    // L-9: 上锁提前到校验之前——原「先 validate 后才上锁」留双击并发窗口（两次提交同时进入，
    // 幂等键虽兜住重复下单，仍会重复报错）。入口即锁 + 在途直接返回；各失败路径分别复位。
    if (submitting.value) return
    submitting.value = true
    const valid = await formRef.value!.validate().catch(() => false)
    if (!valid) {
      submitting.value = false
      return
    }

    if (!submitIdemKey) submitIdemKey = crypto.randomUUID()
    // G-7: 有参考图时必须携带与上传同源的 x-anon-token（无参考图下单不带 token 照常）
    let anonToken: string | null = null
    if (uploadedRefs.value.length > 0) {
      // 优先用上传成功时记录的凭证（即使期间埋点链路换过 token，下单仍与参考图同源）；
      // 兜底再取一次当前缓存
      anonToken = refUploadToken || await getAnonToken()
      if (!anonToken) {
        ElMessage.error(t('orderForm.anonTokenRequired'))
        submitting.value = false
        return
      }
    }
    try {
      // SPEC-PRICE-2: 画风尺寸 + 增项（含用途/加急单选），服务端唯一引擎算价
      const order = await orderApi.create({
        subdomain,
        styleSizeId: selectedSizeId.value,
        styleAddons: buildStyleAddons(),
        description: form.description.trim(),
        clientQq: form.clientQq.trim(),
        clientName: form.clientName.trim(),
        clientNotify: form.notifyEnabled,
        agreeRules: form.agreed,
        references: uploadedRefs.value,
        // v0.31 F3: 折扣码传后端，后端负责验证+扣减+incrementUsage
        discountCode: form.discountCode.trim() || null
      }, {
        headers: {
          'idempotency-key': submitIdemKey,
          ...(anonToken ? { 'x-anon-token': anonToken } : {})
        }
      })
      submitIdemKey = null
      resultNo.value = order.orderNo
      customerToken.value = order.customerToken || ''
      trackUrl.value = order.trackUrl || ''
      showSuccess.value = true
      // R57: 提交成功清除草稿 + 解除离开拦截
      sessionStorage.removeItem(DRAFT_KEY)
      window.removeEventListener('beforeunload', onBeforeUnload)
    } catch (err) {
      ElMessage.error((err as ApiError).message)
    } finally {
      submitting.value = false
    }
  }

  // ─── 初始化 ───
  // P0 修复（前端质量战役 B 路审计）：画师信息加载失败不再只 toast 后留破页，
  // 暴露 loadError + retryLoad，页面层显示错误态+重试；草稿恢复只在首次成功初始化时跑一次。
  const loadError = ref(false)
  let draftHandled = false

  async function initForm() {
    try {
      const data = await fetchArtistPublicProfile(subdomain)
      artist.value = data
      rulesContent.value = 'rules' in data ? data.rules || '' : ''
      // 加载流程（静默失败不阻塞下单）
      artistPublicApi.getWorkflow(subdomain)
        .then(res => { workflowStages.value = res.stages || [] })
        .catch(err => {
          console.warn('[useOrderForm] getWorkflow 失败，流程步骤回落默认', err) // eslint-disable-line no-console -- 审计 F-4：失败留痕，回落逻辑不变
        })
      // 加载报价元数据（分期比例 + 折扣开关）
      artistPublicApi.getPricing(subdomain)
        .then(res => { pricingData.value = res })
        .catch(err => {
          console.warn('[useOrderForm] getPricing 失败，分期/折扣交互回落默认', err) // eslint-disable-line no-console -- 审计 F-5：失败留痕，回落逻辑不变
        })

      // 加载画风列表（await 保证步骤列表渲染前稳定）
      try {
        const styleRes = await artistPublicApi.getPublicStyles(subdomain)
        styles.value = styleRes || []
        // 单画风自动选中（退化为扁平模型，跳过选画风步骤）
        if (styles.value.length === 1) {
          selectedStyleId.value = styles.value[0].id
        }
      } catch (err) {
        /* 静默失败：页面显示无 pricing 空态（审计 F-6：补失败留痕，回落逻辑不变） */
        console.warn('[useOrderForm] getPublicStyles 失败，画风列表显示空态', err) // eslint-disable-line no-console
      }

      // v0.34 任务B：URL query 预选（优先于草稿恢复，restoreDraft 里不覆盖已预选的项）
      applyQueryPreselect()

      // R57: 草稿恢复（styles 加载后校验有效性；仅首次成功初始化时执行）
      if (!draftHandled) {
        draftHandled = true
        let draft: OrderFormDraft | null = null
        try {
          const raw = sessionStorage.getItem(DRAFT_KEY)
          if (raw) draft = JSON.parse(raw) as OrderFormDraft
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
      }
      loadError.value = false
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }

  /** 页面层重试入口：错误态点「再试一次」 */
  async function retryLoad() {
    loading.value = true
    loadError.value = false
    await initForm()
  }

  onMounted(async () => {
    // R57: 表单有内容时拦截页面关闭/刷新
    window.addEventListener('beforeunload', onBeforeUnload)
    await initForm()
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (draftTimer) clearTimeout(draftTimer)
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
    discountValidationSeq++ // a3: 卸载后在途验证响应作废
  })

  return {
    // 数据加载
    artist, rulesContent, loading, loadError, retryLoad, workflowStages, pricingData,
    // 表单 + 校验
    form, rules,
    // R57 草稿状态（导出供测试验证状态是否算"有内容"）
    hasDraftContent,
    // 提交状态
    submitting, showSuccess, resultNo, customerToken, trackUrl, submit,
    // 参考图
    refFileList, handleRefUpload, handleRefRemove,
    // 须知预览
    sanitizedRules,
    // 折扣码
    discountEnabled, discountResult, discountError, discountValidating,
    validateDiscountCode, discountPreviewCents, discountedTotalYuan,
    // 画风/尺寸/增项
    styles, isStyleMode, isMultiStyle,
    selectedStyleId, selectedStyle, selectedSizeId, selectedSize,
    availableStyleAddons, regularAddons, usageAddons, rushAddons,
    styleAddonSelections, selectedUsageId, selectedRushId,
    selectStyle, selectSize, toggleUsage, toggleRush,
    buildStyleAddons, styleAddonPriceText,
    stylePricePreview, styleCalcError, stylePricingExpanded, styleDisplayPrice, hasStylePricingExtras,
    installmentPreview,
    // v0.34 任务B：URL query 预选命中记录
    queryPreselect,
    // v0.35 F4: 预选摘要横幅文案
    preselectBannerText
  }
}
