/**
 * 手动录单价格状态机（从 ManualOrderRight.vue 拆分，纯搬移零行为变化）
 * 2026-08-10 拆分批：画风/尺寸/增项选择 + 自定义增项 + 计价防抖 + 价格脏标记（G2）
 *
 * 模式对齐 v0.40 OrderDetail 瘦身批（useOrderWorkflow 等）：
 * - 状态与动作整体搬移，调用方解构面不变
 * - 防抖计时器由本模块持有，onUnmounted 时调用方须调 stopStyleCalc 清理
 * - subdomain 以 getter 传入（保持对父级 props 的响应式读取）
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistPublicApi } from '../api/index.js'
import { formatAddonPrice, formatYuan } from '../utils/money.js'

export function useManualOrderPricing({ styles, getSubdomain }) {
  const { t } = useI18n()

  // ─── 价格计算器状态 ───
  const finalPriceYuan = ref(null)
  // G2: 价格脏标记——画师是否手动改过价格（005 订单事故根因修复：
  // 无脏标记时加增项后字段停在旧计算价，提交时被误判为画师有意改价而抹掉增项）
  // 实现：el-input-number 绑定 priceInput（computed setter），用户输入/步进经 setter 置脏；
  // doCalc 直接写 finalPriceYuan 绕过 setter，程序写入永不置脏。
  const priceTouched = ref(false)
  const priceInput = computed({
    get: () => finalPriceYuan.value,
    set: (v) => {
      priceTouched.value = true
      finalPriceYuan.value = v
    }
  })

  // ─── SPEC-PRICE-2: 画风模式唯一（旧档位模式已随 v50 退役） ───
  /** 画风模式：有画风数据时可用（styles.length > 0） */
  const isStyleMode = computed(() => styles.value.length > 0)
  /** 多画风：需要选画风步骤（styles.length > 1）；单画风跳过选画风直接选尺寸 */
  const isMultiStyle = computed(() => styles.value.length > 1)
  /** 选中的画风 ID（单画风时自动选中唯一项） */
  const selectedStyleId = ref(null)
  const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
  /** 选中的尺寸 ID */
  const selectedSizeId = ref(null)
  const selectedSize = computed(() => selectedStyle.value?.sizes?.find(sz => sz.id === selectedSizeId.value) || null)
  /** 当前尺寸下可用增项（后端已过滤 is_hidden / 尺寸覆盖；含 category 维度） */
  const availableStyleAddons = computed(() => selectedSize.value?.addons || [])
  /** 普通增项（多选共存） */
  const regularAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'add'))
  /** 用途可选项（最多选一个） */
  const usageAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'usage'))
  /** 加急可选项（最多选一个） */
  const rushAddons = computed(() => availableStyleAddons.value.filter(a => a.category === 'rush'))
  /** 用途/加急单选（styleAddonId；null = 不选） */
  const selectedUsageId = ref(null)
  const selectedRushId = ref(null)
  function toggleUsage(id) {
    selectedUsageId.value = selectedUsageId.value === id ? null : id
  }
  function toggleRush(id) {
    selectedRushId.value = selectedRushId.value === id ? null : id
  }
  /** 增项选择状态 { [styleAddonId]: { toggled, quantity } } —— 普通增项（switch/quantity） */
  const styleAddonSelections = reactive({})
  /** 画风价格预览（calculate-style-price 响应） */
  const stylePricePreview = ref(null)

  // ─── v0.38 补漏 R5: 自定义增项（两条路径通用，允许负数/0，上限 20） ───
  /** 已录自定义增项 [{ uid, name, priceYuan }] */
  const customAddons = ref([])
  /** 录入区展开状态 */
  const customAddonOpen = ref(false)
  const customAddonName = ref('')
  const customAddonPrice = ref(null)
  /** 自定义增项合计（元） */
  const customAddonsTotal = computed(() => customAddons.value.reduce((sum, a) => sum + (Number(a.priceYuan) || 0), 0))

  /** 自定义增项金额文案（负数显示 -¥xx.xx） */
  function formatCustomAddonPrice(item) {
    const v = Number(item.priceYuan) || 0
    return `${v < 0 ? '-' : ''}${formatYuan(Math.round(Math.abs(v) * 100))}`
  }

  /** 添加自定义增项（名称必填 ≤50 字；金额必填；上限 20 条） */
  function addCustomAddon() {
    const name = customAddonName.value.trim()
    if (!name) {
      ElMessage.warning(t('manualOrder.customAddonNameRequired'))
      return
    }
    if (customAddons.value.length >= 20) {
      ElMessage.warning(t('manualOrder.customAddonMax'))
      return
    }
    const price = Number(customAddonPrice.value)
    if (customAddonPrice.value === null || customAddonPrice.value === undefined || Number.isNaN(price)) {
      ElMessage.warning(t('manualOrder.customAddonPriceRequired'))
      return
    }
    customAddons.value.push({ uid: `ca-${crypto.randomUUID()}`, name, priceYuan: price })
    customAddonName.value = ''
    customAddonPrice.value = null
    customAddonOpen.value = false
  }

  /** 删除已录自定义增项 */
  function removeCustomAddon(idx) {
    customAddons.value.splice(idx, 1)
  }

  /** 画风卡片封面：F1/F3 约定 image_artwork_id 有值 → 用 artwork_image_path（实时引用），否则用 image */
  function sizeImage(sz) {
    return sz.artwork_image_path || sz.image || null
  }

  /** 选择画风（多画风步骤 1）：切换时重置尺寸/增项/价格，脏标记恢复跟随计算 */
  function selectStyle(id) {
    // B2 (REQ-029 §三 B2): 点已选中的画风卡 = 取消选中（对齐档位卡 toggle 交互），清空尺寸/增项/算价
    if (selectedStyleId.value === id) {
      selectedStyleId.value = null
      resetSelections()
      return
    }
    selectedStyleId.value = id
    resetSelections()
  }

  function resetSelections() {
    selectedSizeId.value = null
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    selectedUsageId.value = null
    selectedRushId.value = null
    stylePricePreview.value = null
    priceTouched.value = false
    // a1: 取消/切换画风时清旧价——不清的话按钮仍显示已失效价格
    finalPriceYuan.value = null
  }

  /** 选择尺寸（步骤 2）：切换时重置增项选择（不同尺寸可用增项不同）并重算 */
  function selectSize(id) {
    if (selectedSizeId.value === id) return
    selectedSizeId.value = id
    for (const key of Object.keys(styleAddonSelections)) delete styleAddonSelections[key]
    selectedUsageId.value = null
    selectedRushId.value = null
    stylePricePreview.value = null
    priceTouched.value = false
    initStyleAddonDefaults()
    scheduleStyleCalc()
  }

  /** 增项选择统一写入（初始化缺失的 { toggled, quantity } 结构） */
  function setStyleAddon(id, patch) {
    if (!styleAddonSelections[id]) {
      styleAddonSelections[id] = { toggled: false, quantity: 0 }
    }
    Object.assign(styleAddonSelections[id], patch)
  }

  /** 初始化增项默认值（el-input-number 的 v-model 不接受 undefined） */
  function initStyleAddonDefaults() {
    for (const a of regularAddons.value) {
      if (!styleAddonSelections[a.id]) {
        styleAddonSelections[a.id] = { toggled: false, quantity: 0 }
      }
    }
  }

  /** 构建已选画风增项列表（计价与提交共用；普通增项 + 用途/加急单选） */
  function buildStyleAddons() {
    const addons = []
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

  /** 画风增项价格文案（¥50 / ¥80/位 / +50%，读真实 price_mode） */
  function formatStyleAddonPrice(a) {
    // 813-fq-tail-shared 战役 S：单位缺省改走 i18n（styleManage.unitFallback），不再依赖 money.js 内置「位」
    return formatAddonPrice(a.price, a.price_mode, { controlType: a.control_type, unitLabel: a.unit_label || t('styleManage.unitFallback') })
  }

  /** 画风价格计算（防抖 300ms，与旧档位 doCalc 同一模式） */
  let styleCalcTimer = null
  // R-13: 算价竞态守卫——同款 seq 模式（对齐 useOrderForm.doStyleCalc）：
  // 慢请求晚到不得覆盖新请求的价格预览，也不得把旧价写回 finalPriceYuan
  let styleCalcSeq = 0
  function scheduleStyleCalc() {
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
    styleCalcTimer = setTimeout(doStyleCalc, 300)
  }

  async function doStyleCalc() {
    const mySeq = ++styleCalcSeq
    if (!selectedSizeId.value) {
      stylePricePreview.value = null
      if (!priceTouched.value) finalPriceYuan.value = null
      return
    }
    try {
      const res = await artistPublicApi.calculateStylePrice({
        subdomain: getSubdomain(),
        styleSizeId: selectedSizeId.value,
        addons: buildStyleAddons()
      })
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = res
      // G2: 未手动改过价格 → 始终同步最新计算价；已手动改过 → 尊重画师手输。
      // 直接写 finalPriceYuan（绕过 priceInput setter，不置脏）
      if (!priceTouched.value) {
        finalPriceYuan.value = (res.totalCents ?? 0) / 100
      }
    } catch {
      if (mySeq !== styleCalcSeq) return
      stylePricePreview.value = null
      // a1: 算价失败同步清 finalPriceYuan（未手输时）；手输价保留，尊重画师输入
      if (!priceTouched.value) finalPriceYuan.value = null
    }
  }

  /** 组件卸载时清理防抖计时器（原 ManualOrderRight onUnmounted 逻辑） */
  function stopStyleCalc() {
    if (styleCalcTimer) clearTimeout(styleCalcTimer)
  }

  // 增项/用途/加急变化触发计价
  watch(styleAddonSelections, scheduleStyleCalc, { deep: true })
  watch([selectedUsageId, selectedRushId], () => {
    if (selectedSizeId.value) scheduleStyleCalc()
  })

  return {
    // 价格状态
    finalPriceYuan, priceTouched, priceInput, stylePricePreview,
    // 画风/尺寸选择
    isStyleMode, isMultiStyle,
    selectedStyleId, selectedStyle, selectedSizeId, selectedSize,
    selectStyle, selectSize, resetSelections, sizeImage,
    // 增项
    regularAddons, usageAddons, rushAddons,
    selectedUsageId, selectedRushId, toggleUsage, toggleRush,
    styleAddonSelections, setStyleAddon, initStyleAddonDefaults,
    buildStyleAddons, formatStyleAddonPrice,
    // 自定义增项（R5）
    customAddons, customAddonOpen, customAddonName, customAddonPrice,
    customAddonsTotal, formatCustomAddonPrice, addCustomAddon, removeCustomAddon,
    // 计价调度
    scheduleStyleCalc, stopStyleCalc
  }
}
