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
  expression: { icon: '🎭', label: '表情差分' },
  outfit: { icon: '👗', label: '服装替换' },
  background: { icon: '🏞', label: '背景场景' },
  weapon: { icon: '⚔️', label: '武器道具' },
  other: { icon: '✨', label: '其他' }
}

export function useOrderForm(subdomain, formRef) {
  const { t } = useI18n()

  // ─── 数据加载状态 ───
  const artist = ref(null)
  const tiers = ref([])
  const rulesContent = ref('')
  const loading = ref(true)
  const workflowStages = ref([])
  const pricingData = ref(null) // { tiers, multipliers, installments }

  // ─── 表单状态 ───
  const form = reactive({
    tierId: null,
    description: '',
    clientQq: '',
    clientName: '',
    notifyEnabled: true,
    agreed: false,
    usageMultiplierId: null,
    rushMultiplierId: null
  })

  // ─── 校验规则 ───
  const rules = {
    tierId: [{ required: true, message: () => t('orderForm.selectTier'), trigger: 'change' }],
    clientQq: [{ required: true, message: () => t('orderForm.fillQq'), trigger: 'blur' }],
    agreed: [{
      validator: (rule, value, callback) => {
        if (rulesContent.value && !value) callback(new Error(t('orderForm.agreeLabel')))
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

  // R14: 有增项或倍率时才显示"详细计价"入口
  const hasPricingExtras = computed(() =>
    availableAddons.value.length > 0 || usageMultipliers.value.length > 0 || rushMultipliers.value.length > 0
  )

  // 增项分组（按 category 折叠）
  const addonGroups = computed(() => {
    const groups = {}
    for (const a of availableAddons.value) {
      if (!groups[a.category]) {
        const meta = CATEGORY_META[a.category] || { icon: '📦', label: a.category }
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

  // ─── R57: 表单防丢失（beforeunload 拦截 + sessionStorage 草稿） ───
  const DRAFT_KEY = `orderForm_draft_${subdomain}`

  /** 表单是否有内容（任一字段非空）——决定 beforeunload 拦截与草稿保存 */
  const hasDraftContent = computed(() =>
    form.tierId != null
    || !!form.description.trim()
    || !!form.clientQq.trim()
    || !!form.clientName.trim()
    || Object.values(addonSelections).some(v => v > 0)
    || Object.values(addonToggles).some(Boolean)
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
        addonToggles: { ...addonToggles }
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

  /** 恢复草稿（tiers 加载后调用；档位若已被画师删除则自动丢弃该字段） */
  function restoreDraft(draft) {
    const f = draft.form || {}
    const tierValid = f.tierId != null && tiers.value.some(tier => tier.id === f.tierId)
    form.tierId = tierValid ? f.tierId : null
    form.description = f.description || ''
    form.clientQq = f.clientQq || ''
    form.clientName = f.clientName || ''
    form.notifyEnabled = f.notifyEnabled !== false
    form.usageMultiplierId = tierValid ? (f.usageMultiplierId ?? null) : null
    form.rushMultiplierId = tierValid ? (f.rushMultiplierId ?? null) : null
    if (tierValid && draft.addonSelections) Object.assign(addonSelections, draft.addonSelections)
    if (tierValid && draft.addonToggles) Object.assign(addonToggles, draft.addonToggles)
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
      refFileList.value.push({ name: file.name || 'pasted-image.png', url: `/uploads/${uploaded.filePath}`, uid, status: 'success' })
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
      const order = await orderApi.create({
        subdomain,
        tierId: form.tierId,
        description: form.description.trim(),
        clientQq: form.clientQq.trim(),
        clientName: form.clientName.trim(),
        clientNotify: form.notifyEnabled,
        agreeRules: form.agreed,
        references: uploadedRefs.value,
        addons: buildSelectedAddons(),
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId
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
  })

  return {
    // 数据加载
    artist, tiers, rulesContent, loading, workflowStages, pricingData,
    // 表单 + 校验
    form, rules,
    // 提交状态
    submitting, showSuccess, resultNo, submit,
    // 参考图
    refFileList, handleRefUpload, handleRefRemove,
    // 计价
    addonSelections, addonToggles, pricePreview, pricingExpanded,
    selectedTier, hasPricingExtras, availableAddons, addonGroups,
    usageMultipliers, rushMultipliers, formatAddonPrice, onTierChange,
    // 须知预览
    sanitizedRules
  }
}
