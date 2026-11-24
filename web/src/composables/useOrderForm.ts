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
 * 巨型文件防阀（800 行硬上限）拆分口径：R57 草稿单元（落盘节流/恢复过滤/离开拦截）
 * 本体在 ./orderFormHelpers.ts；折扣码单元在 ./orderFormDiscount.ts；
 * 参考图单元（凭证锁定/文件选择/粘贴上传）在 ./orderFormRefs.ts。
 * 本文件把自有状态的引用交过去，读写仍指向同一份数据，行为不变。
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
import { formatAddonPrice, formatYuanTrimmed } from '../utils/money'
import { getAnonToken } from '../utils/track'
import { generateId } from '../utils/id'
import { shouldRotateIdempotencyKey } from '../utils/idempotency'
import { hydrateDraftRefUrls } from './draftRefThumbs'
import { useOrderFormDraft } from './orderFormHelpers'
import { useOrderFormDiscount } from './orderFormDiscount'
import { useOrderFormRefUpload, useOrderFormRefPaste } from './orderFormRefs'
import type { AddonSelRecord } from './orderFormHelpers'
import type {
  ArtistPublicProfile, PublicArtStyle, PublicStyleAddon, PublicPricingResult,
  StylePriceResult, StyleAddonSelection, WorkflowStageDTO
} from '../api/types'
import type { InstallmentItem } from '../views/client/order-form/types'

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
  /** issue #50-1：计价请求在途 */
  const styleCalcInFlight = ref(false)
  /** issue #50-1：选择已变、新报价还没回来（此刻屏上的价属于旧选择） */
  const priceStale = ref(false)
  /** issue #50-1：下单成功后服务端权威总价（分），用于校正展示与复制文案 */
  const submittedTotalCents = ref<number | null>(null)

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
    // REQ-028 过渡期：QQ 通知通道未接通，下单页该勾选项已灰置，默认不勾（避免提交发不出来的提醒承诺）
    notifyEnabled: false,
    agreed: false,
    // REQ-042: 首单须勾选「已阅读服务条款/隐私政策」（前端门禁，未勾不可提交）
    termsAgreed: false,
    discountCode: '' // v0.31 F3: 折扣码（验证通过后随订单提交，后端负责真正扣减）
  })

  // ─── 校验规则 ───
  const rules = {
    clientQq: [
      { required: true, message: () => t('orderForm.fillQq'), trigger: 'blur' },
      {
        // issue #50-5：与服务端 POST /api/orders 的 clientQq 逐字同口径（5-15 位数字），
        // 提交前也 trim，等价于对最终载荷校验；空值交给上一条 required，避免双报
        validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
          const raw = String(value ?? '')
          if (!raw) callback()
          else if (!/^\d{5,15}$/.test(raw.trim())) callback(new Error(t('errors.QQ_FORMAT')))
          else callback()
        },
        trigger: 'blur'
      }
    ],
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
  // 凭证锁定 + 文件选择上传本体在 ./orderFormRefs（逐字搬迁）；refFileList 引用交回本 composable
  const {
    refFileList, refFilePaths, getRefUploadToken, lockRefUploadToken, handleRefUpload
  } = useOrderFormRefUpload()

  // ─── 计算属性 ───
  const sanitizedRules = computed(() => sanitizeHtml(rulesContent.value))

  /** 增项单价展示文本（¥50 / ¥80/位 / +50%；读公开接口真实 price_mode/category） */
  function styleAddonPriceText(a: PublicStyleAddon) {
    // 813-fq-tail-shared 战役 S：单位缺省改走 i18n（styleManage.unitFallback），不再依赖 money.js 内置「位」
    return formatAddonPrice(a.price, a.price_mode, { controlType: a.control_type, unitLabel: a.unit_label || t('styleManage.unitFallback') })
  }

  // ─── 折扣码 ───
  // 验证/竞态序号/预估金额本体在 ./orderFormDiscount（逐字搬迁）；状态以原引用交回，对外 API 不变
  const {
    discountEnabled, discountResult, discountError, discountValidating,
    validateDiscountCode, discountPreviewCents, discountedTotalYuan, invalidatePendingValidation
  } = useOrderFormDiscount({
    subdomain, form, selectedSizeId, stylePricePreview, pricingData, scheduleStyleCalc
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
    // issue #50-1：从这一刻起屏上的报价属于旧选择，直到新报价回来
    priceStale.value = true
    styleCalcTimer = setTimeout(doStyleCalc, 300)
  }

  async function doStyleCalc() {
    const mySeq = ++styleCalcSeq
    const sizeId = selectedSizeId.value
    if (!sizeId) {
      stylePricePreview.value = null
      styleCalcError.value = ''
      styleCalcInFlight.value = false
      priceStale.value = false
      return
    }
    styleCalcError.value = ''
    styleCalcInFlight.value = true
    try {
      const res = await artistPublicApi.calculateStylePrice({
        subdomain,
        styleSizeId: sizeId,
        addons: buildStyleAddons(),
        // issue #50-6：只带验证通过的折扣码。逐字输入时把未验证码原样送去算价，
        // 服务端 DISCOUNT_CODE_INVALID 会让整次算价 400 → 报价塌空，合法码也得敲完才恢复。
        discountCode: discountResult.value ? (form.discountCode.trim() || null) : null
      })
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = res
      priceStale.value = false
    } catch (err) {
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = null
      styleCalcError.value = (err as Error)?.message || t('orderForm.priceCalcFailed')
      priceStale.value = false
    } finally {
      if (mySeq === styleCalcSeq) styleCalcInFlight.value = false
    }
  }

  // 监听增项/用途/加急变化 → 触发计价
  watch(styleAddonSelections, scheduleStyleCalc, { deep: true })
  watch([selectedUsageId, selectedRushId], () => {
    if (selectedSizeId.value) scheduleStyleCalc()
  })

  /**
   * 展示价（整数分）。issue #50-2 拍板 A：取消「未计价回退尺寸基础价」——
   * 那个数漏掉全部增项/用途/加急，是个会被截图当承诺的低价。无报价一律 null，
   * 展示层出「报价待确认」空态。口径统一为分，⛔ 不再跨层传「元」中转值。
   */
  const styleDisplayCents = computed<number | null>(() => stylePricePreview.value?.totalCents ?? null)

  /**
   * issue #50-1 拍板 A：报价非最新态（脏 / 在途 / 失败 / 尚无结果）不得提交。
   * 服务端价始终由唯一引擎推导，这里拦的是「客户看到的价 ≠ 成交的价」。
   */
  const priceBlocking = computed(() => {
    if (!isStyleMode.value || !selectedSizeId.value) return false
    return priceStale.value || styleCalcInFlight.value || !!styleCalcError.value || stylePricePreview.value == null
  })

  /** 提交按钮上的价格后缀：报价未就绪时显示状态文案而不是数字 */
  const priceStatusText = computed(() => {
    if (!isStyleMode.value || !selectedSizeId.value) return null
    if (styleCalcInFlight.value || priceStale.value) return t('orderForm.priceUpdating')
    if (styleDisplayCents.value == null) return t('orderForm.pricePending')
    return formatYuanTrimmed(styleDisplayCents.value)
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
    // F0242: 与后端 allocateInitial 完全同口径——比例和可能≠100%，先按 Σbp 算 ratioTotal；
    // 前 N-1 节点四舍五入后钳到剩余额度（防小总价多节点把尾款挤成负数），尾节点吸收全部余数（可为 0 但不再为负）
    const totalBp = stages.reduce((acc, s) => acc + (s.basisPoints || 0), 0)
    const ratioTotal = Math.round(total * totalBp / 10000)
    const items: InstallmentItem[] = stages.map(s => ({ label: s.label, amountCents: 0 }))
    let allocated = 0
    for (let i = 0; i < items.length; i++) {
      if (i === items.length - 1) {
        items[i].amountCents = ratioTotal - allocated
      } else {
        const rounded = Math.round(total * (stages[i].basisPoints || 0) / 10000)
        items[i].amountCents = Math.min(rounded, ratioTotal - allocated)
        allocated += items[i].amountCents
      }
    }
    return items
  })

  // ─── R57: 表单防丢失（beforeunload 拦截 + sessionStorage 草稿） ───
  // 草稿的落盘节流/恢复过滤/离开拦截本体在 orderFormHelpers（巨型文件防阀拆分），
  // 状态仍全部归本 composable 所有：这里只把引用交出去，读写指向同一份数据。
  const {
    hasDraftContent, restoreDraft, loadStoredDraft, discardDraft, onBeforeUnload, flushDraft
  } = useOrderFormDraft(subdomain, {
    // issue #82: 参考图列表也交给草稿单元（只传数组引用，落盘/恢复逻辑全在 orderFormHelpers）
    form, refFileList,
    styles, selectedStyleId, selectedSizeId, isMultiStyle,
    regularAddons, usageAddons, rushAddons, styleAddonSelections,
    selectedUsageId, selectedRushId, queryPreselect,
    initStyleAddonDefaults, scheduleStyleCalc
  })

  // ─── 粘贴上传（参考图） ───
  // 粘贴链路 + 错误提示 watch 本体在 ./orderFormRefs（逐字搬迁，调用点保持原位以维持 watch 注册顺序）
  useOrderFormRefPaste({ refFileList, lockRefUploadToken })

  // ─── 提交 ───
  async function submit() {
    // L-9: 上锁提前到校验之前——原「先 validate 后才上锁」留双击并发窗口（两次提交同时进入，
    // 幂等键虽兜住重复下单，仍会重复报错）。入口即锁 + 在途直接返回；各失败路径分别复位。
    if (submitting.value) return
    // issue #50-1：报价非最新态不得提交。按钮已按 priceBlocking 禁用，这里兜住
    // 程序化调用与「点击瞬间选择又变了」的竞态窗口。
    if (priceBlocking.value) {
      ElMessage.warning(t('orderForm.priceNotReady'))
      return
    }
    // issue #50-6：填了码却没验证 → 算价按无折扣报价、服务端却可能真扣，
    // 看到的价与成交价又会分叉。拦在提交前，让折扣行的行内错误态说话。
    if (form.discountCode.trim() && !discountResult.value) {
      ElMessage.warning(t('orderForm.discountNotValidated'))
      return
    }
    // #61-②：refFilePaths 的过滤会静默丢掉无 filePath 条目（在途/失败），客户以为图已随单提交。
    // 提交入口拦下并提示：等上传完成或移除该条后再提交（不再静默少图）
    if (refFileList.value.some(item => !item.filePath)) {
      ElMessage.warning(t('orderForm.refNotReady'))
      return
    }
    submitting.value = true
    submittedTotalCents.value = null
    // F0244: formRef 为空时不加非空断言——一旦为空 .validate() 抛错会跳过后续 submitting=false，锁永久卡死
    if (!formRef.value) {
      submitting.value = false
      return
    }
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) {
      submitting.value = false
      return
    }

    // #65 尾巴清收：提交时二次校验接单状态——下单入口门禁（OrderForm 的 artistNotOpen 空态）
    // 只看挂载时快照，客户填表期间画师可能已切 full/break/hidden。提交前现拉一次公开画像复核，
    // 非 open 就回写 artist 让空态横幅立即生效，不再把注定 400 的请求发给服务端。
    // 判据与入口门禁、服务端 POST /api/orders（ARTIST_NOT_OPEN）逐字同口径：只认回显 status，
    // 不认 effectiveStatus（那是额度展示口径，服务端下单不据此拦单）。
    try {
      const fresh = await fetchArtistPublicProfile(subdomain)
      if (fresh.status !== 'open') {
        artist.value = fresh
        ElMessage.error(t('errors.ARTIST_NOT_OPEN'))
        submitting.value = false
        return
      }
    } catch (err) {
      // 预检失败不拦提交：接单状态的权威判定在服务端 POST /api/orders（非 open 必 400
      // ARTIST_NOT_OPEN），网络抖动不能让本可成功的下单被前端误杀；失败留痕与 F-4/F-5 同款降级口径。
      console.warn('[useOrderForm] 提交前接单状态预检失败，放行交服务端终判', err) // eslint-disable-line no-console -- #65：预检失败留痕，放行服务端终判
    }

    if (!submitIdemKey) submitIdemKey = generateId()
    // G-7: 有参考图时必须携带与上传同源的 x-anon-token（无参考图下单不带 token 照常）
    let anonToken: string | null = null
    if (refFilePaths.value.length > 0) {
      // 优先用上传成功时记录的凭证（即使期间埋点链路换过 token，下单仍与参考图同源）；
      // 兜底再取一次当前缓存
      anonToken = getRefUploadToken() || await getAnonToken()
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
        references: refFilePaths.value,
        // v0.31 F3: 折扣码传后端，后端负责验证+扣减+incrementUsage
        discountCode: form.discountCode.trim() || null
      }, {
        headers: {
          'idempotency-key': submitIdemKey,
          ...(anonToken ? { 'x-anon-token': anonToken } : {})
        }
      })
      submitIdemKey = null
      // issue #50-1：展示价以服务端权威总价收口（客户复制出去的约稿信息不再带预估价）
      submittedTotalCents.value = order.totalPriceCents ?? null
      resultNo.value = order.orderNo
      customerToken.value = order.customerToken || ''
      trackUrl.value = order.trackUrl || ''
      showSuccess.value = true
      // R57: 提交成功清除草稿 + 解除离开拦截
      discardDraft()
      window.removeEventListener('beforeunload', onBeforeUnload)
    } catch (err) {
      // 审计 #21 条目 3: 同 key 换内容 → 后端 409（旧行为是回放上一单结果，客户以为改成功了）。
      // 这里必须换新 key，客户改完文案/尺寸再点一次即受理为新单意图。
      // TASK2-01: 信封解密失败是独立错误码，必须保留原 key——清 key 会以新 key 重复下单/扣款；
      // 服务端文案已给出「请勿重复提交/联系客服」的不可重试提示。
      if (shouldRotateIdempotencyKey((err as ApiError).code)) submitIdemKey = null
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
        const draft = loadStoredDraft()
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
            const restoredRefPaths = restoreDraft(draft)
            ElMessage.success(t('orderForm.draftRestored'))
            // issue #82 补：缩略图后补——不 await，别让签名往返卡住「草稿已恢复」的收尾
            void hydrateDraftRefUrls(refFileList, restoredRefPaths, (n) => {
              ElMessage.warning(t('orderForm.refRestoreExpired', { n }))
            })
          } catch {
            discardDraft()
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
    flushDraft() // issue #53-2: 清定时器前先落盘，防抖 500ms 内的最后一笔不再丢在内存里
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
    invalidatePendingValidation() // a3: 卸载后在途验证响应作废（序号归折扣单元持有）
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
    refFileList, handleRefUpload,
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
    stylePricePreview, styleCalcError, stylePricingExpanded, styleDisplayCents, hasStylePricingExtras,
    priceBlocking, priceStatusText, submittedTotalCents,
    installmentPreview,
    // v0.34 任务B：URL query 预选命中记录
    queryPreselect,
    // v0.35 F4: 预选摘要横幅文案
    preselectBannerText
  }
}
