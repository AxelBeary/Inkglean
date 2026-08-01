<template>
  <!-- R42a: 手动录单表单（原独立页面，现作为组件嵌入订单管理抽屉；/manual-order 已重定向到 /orders?action=manual） -->
  <div class="manual-order-form">
    <p class="hint">{{ $t('manualOrder.hint') }}</p>

    <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
      <!-- 客户QQ -->
      <el-form-item :label="$t('manualOrder.clientQq')" prop="clientQq">
        <el-input v-model="form.clientQq" :placeholder="$t('manualOrder.clientQqPlaceholder')" />
      </el-form-item>

      <!-- 客户昵称 -->
      <el-form-item :label="$t('manualOrder.clientName')">
        <el-input v-model="form.clientName" :placeholder="$t('manualOrder.clientNamePlaceholder')" />
      </el-form-item>

      <!-- 档位选择 -->
      <el-form-item :label="$t('manualOrder.tier')">
        <el-select v-model="form.tierId" :placeholder="$t('manualOrder.tierPlaceholder')" clearable style="width: 100%" @change="onTierChange">
          <el-option v-for="tier in tiers" :key="tier.id" :label="`${tier.name} - ¥${tier.price}`" :value="tier.id" />
        </el-select>
      </el-form-item>

      <!-- 增项选择（选完档位后出现） -->
      <el-form-item v-if="form.tierId && availableAddons.length > 0" :label="$t('manualOrder.addons')">
        <div class="addon-groups">
          <div v-for="group in addonGroups" :key="group.category" class="addon-group">
            <div class="addon-group-title" @click="group.collapsed = !group.collapsed">
              <span>{{ group.icon }} {{ group.label }}</span>
              <span class="collapse-arrow">{{ group.collapsed ? '▸' : '▾' }}</span>
            </div>
            <div v-show="!group.collapsed" class="addon-items">
              <div v-for="a in group.items" :key="a.id" class="addon-item">
                <div class="addon-item-info">
                  <span class="addon-item-name">{{ a.name }}</span>
                  <span class="addon-item-price">{{ formatAddonPrice(a) }}</span>
                  <span v-if="a.description" class="addon-item-desc">{{ a.description }}</span>
                </div>
                <el-input-number
                  v-if="a.select_mode === 'quantity'"
                  v-model="addonSelections[a.id]"
                  :min="0" :max="a.max_qty" size="small" style="width: 110px"
                />
                <el-switch
                  v-else-if="a.select_mode === 'toggle'"
                  v-model="addonToggles[a.id]" size="small"
                />
                <el-tag v-else size="small" type="warning">{{ $t('manualOrder.inquiry') }}</el-tag>
              </div>
            </div>
          </div>
        </div>
      </el-form-item>

      <!-- 倍率选择 -->
      <el-form-item v-if="form.tierId && (usageMultipliers.length > 0 || rushMultipliers.length > 0)" :label="$t('manualOrder.multipliers')">
        <div class="multiplier-section">
          <div v-if="usageMultipliers.length > 0" class="multiplier-row">
            <span class="multiplier-label">{{ $t('manualOrder.usage') }}：</span>
            <el-radio-group v-model="form.usageMultiplierId" size="small">
              <el-radio-button :value="null">{{ $t('manualOrder.personal') }}</el-radio-button>
              <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                {{ m.name }} ×{{ m.multiplier }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="rushMultipliers.length > 0" class="multiplier-row">
            <span class="multiplier-label">{{ $t('manualOrder.rush') }}：</span>
            <el-radio-group v-model="form.rushMultiplierId" size="small">
              <el-radio-button :value="null">{{ $t('manualOrder.noRush') }}</el-radio-button>
              <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                {{ m.name }} ×{{ m.multiplier }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-form-item>

      <!-- 实时价格预览 -->
      <div v-if="form.tierId && pricePreview" class="price-preview">
        <div class="price-line" v-for="item in (pricePreview.breakdown || [])" :key="item.name">
          <span>{{ item.name }}</span>
          <span class="price-amount">¥{{ (item.amount ?? 0).toFixed(2) }}</span>
        </div>
        <div class="price-divider"></div>
        <div class="price-line total">
          <span>{{ $t('manualOrder.totalPrice') }}</span>
          <span class="price-amount">¥{{ (pricePreview.totalPrice ?? 0).toFixed(2) }}</span>
        </div>
      </div>

      <!-- UI-5 修复：最终价格始终可见（不选档位时画师直接手填价格） -->
      <el-form-item :label="$t('manualOrder.finalPrice')">
        <el-input-number
          v-model="finalPriceYuan"
          :min="0" :max="999999.99" :precision="2" :step="10"
          style="width: 200px"
        />
        <span class="final-price-hint">{{ $t('manualOrder.finalPriceHint') }}</span>
      </el-form-item>

      <!-- 需求描述 -->
      <el-form-item :label="$t('manualOrder.desc')">
        <el-input
          v-model="form.description" type="textarea" :rows="4"
          :placeholder="$t('manualOrder.descPlaceholder')" maxlength="2000" show-word-limit
        />
      </el-form-item>

      <!-- 参考图上传（P1-4: tooltip 显示详细说明） -->
      <el-form-item>
        <template #label>
          <span>{{ $t('manualOrder.references') }}</span>
          <el-tooltip :content="$t('manualOrder.refTip')" placement="top">
            <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
          </el-tooltip>
        </template>
        <el-upload
          :auto-upload="true" :http-request="handleRefUpload"
          accept="image/*" list-type="picture-card" :limit="5"
          :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('manualOrder.refExceed'))"
          :on-remove="handleRefRemove"
        >
          <el-icon aria-label="上传参考图"><Plus /></el-icon>
        </el-upload>
        <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
      </el-form-item>

      <!-- 优先级 -->
      <el-form-item :label="$t('manualOrder.priority')">
        <el-radio-group v-model="form.priority">
          <el-radio-button value="high">{{ $t('manualOrder.priorityHigh') }}</el-radio-button>
          <el-radio-button value="medium">{{ $t('manualOrder.priorityMedium') }}</el-radio-button>
          <el-radio-button value="low">{{ $t('manualOrder.priorityLow') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- R51: 截稿日（可选，创建后写入） -->
      <el-form-item :label="$t('manualOrder.deadline')">
        <el-date-picker
          v-model="form.deadline" type="date" value-format="YYYY-MM-DD"
          :placeholder="$t('manualOrder.deadlinePlaceholder')"
          clearable style="width: 200px"
        />
      </el-form-item>

      <!-- QQ通知开关 -->
      <el-form-item>
        <el-checkbox v-model="form.clientNotify">{{ $t('manualOrder.clientNotify') }}</el-checkbox>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
          {{ $t('manualOrder.submit') }}
          <template v-if="displayPrice"> — ¥{{ displayPrice }}</template>
        </el-button>
      </el-form-item>
    </el-form>

    <!-- 录入成功 -->
    <el-dialog v-model="showResult" :title="$t('manualOrder.resultTitle')" width="360px">
      <el-result icon="success" :title="$t('manualOrder.orderNo', { no: resultNo })">
        <template #sub-title>{{ $t('manualOrder.addedToQueue') }}</template>
        <template #extra>
          <el-button type="primary" @click="$router.push('/queue')">{{ $t('manualOrder.viewQueue') }}</el-button>
          <el-button @click="resetForm">{{ $t('manualOrder.continueEntry') }}</el-button>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { artistApi, artistPublicApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../composables/usePasteUpload.js'

// R42a: 作为组件嵌入订单管理抽屉，录入成功后通知父组件刷新列表
const emit = defineEmits(['created'])

const { t } = useI18n()
const formRef = ref(null)
const tiers = ref([])
const submitting = ref(false)
const showResult = ref(false)
const resultNo = ref('')
const refFileList = ref([])
const uploadedRefs = ref([])
const refUidMap = ref(new Map())
const subdomain = ref('')

// ─── 价格计算器状态 ───
const pricingData = ref(null)
const addonSelections = reactive({})
const addonToggles = reactive({})
const pricePreview = ref(null)
const finalPriceYuan = ref(null)

const form = reactive({
  clientQq: '',
  clientName: '',
  tierId: null,
  description: '',
  priority: 'medium',
  deadline: null,
  clientNotify: false,
  usageMultiplierId: null,
  rushMultiplierId: null
})

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

// ─── 增项分组 ───
const CATEGORY_META = {
  expression: { icon: '🎭', key: 'catExpression' },
  outfit: { icon: '👗', key: 'catOutfit' },
  background: { icon: '🏞', key: 'catBackground' },
  weapon: { icon: '⚔️', key: 'catWeapon' },
  other: { icon: '✨', key: 'catOther' }
}

const availableAddons = computed(() => {
  if (!form.tierId || !pricingData.value) return []
  const tier = pricingData.value.tiers.find(t => t.id === form.tierId)
  return tier?.addons || []
})

const addonGroups = computed(() => {
  const groups = {}
  for (const a of availableAddons.value) {
    if (!groups[a.category]) {
      const meta = CATEGORY_META[a.category] || { icon: '📦', key: 'catOther' }
      groups[a.category] = { category: a.category, icon: meta.icon, label: t(`manualOrder.${meta.key}`), collapsed: false, items: [] }
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

/** 提交按钮上显示的价格：优先手动修改的最终价格，否则用计算价 */
const displayPrice = computed(() => {
  if (finalPriceYuan.value != null && finalPriceYuan.value > 0) return finalPriceYuan.value.toFixed(2)
  if (pricePreview.value) return (pricePreview.value.totalPrice ?? 0).toFixed(2)
  return ''
})

function formatAddonPrice(a) {
  if (a.select_mode === 'inquiry') return t('manualOrder.inquiry')
  if (a.price_type === 'percent') return `+${Math.round(a.price_value * 100)}%`
  return `¥${a.price_value}/个`
}

/** R3 验收标准 6：切换档位时清空增项/倍率并重新计算 */
function onTierChange() {
  for (const key of Object.keys(addonSelections)) delete addonSelections[key]
  for (const key of Object.keys(addonToggles)) delete addonToggles[key]
  form.usageMultiplierId = null
  form.rushMultiplierId = null
  pricePreview.value = null
  finalPriceYuan.value = null
}

// ─── 实时价格计算（防抖） ───
let calcTimer = null
function scheduleCalc() {
  if (calcTimer) clearTimeout(calcTimer)
  calcTimer = setTimeout(doCalc, 300)
}

async function doCalc() {
  if (!form.tierId) { pricePreview.value = null; return }

  const addons = buildAddonList()

  try {
    pricePreview.value = await artistPublicApi.calculatePrice({
      subdomain: subdomain.value,
      tierId: form.tierId,
      addons,
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })
    // 计算后自动填入最终价格（画师可再改）
    if (finalPriceYuan.value == null) {
      finalPriceYuan.value = pricePreview.value.totalPrice
    }
  } catch {
    pricePreview.value = null
  }
}

function buildAddonList() {
  const addons = []
  for (const a of availableAddons.value) {
    if (a.select_mode === 'quantity' && addonSelections[a.id] > 0) {
      addons.push({ addonId: a.id, quantity: addonSelections[a.id] })
    } else if (a.select_mode === 'toggle' && addonToggles[a.id]) {
      addons.push({ addonId: a.id, quantity: 1 })
    } else if (a.select_mode === 'inquiry') {
      addons.push({ addonId: a.id, quantity: 1 })
    }
  }
  return addons
}

watch([() => form.tierId, () => form.usageMultiplierId, () => form.rushMultiplierId], scheduleCalc)
watch(addonSelections, scheduleCalc, { deep: true })
watch(addonToggles, scheduleCalc, { deep: true })

// 增项默认值初始化：el-input-number 的 v-model 不接受 undefined
watch(availableAddons, (addons) => {
  for (const a of addons) {
    if (a.select_mode === 'quantity') {
      if (addonSelections[a.id] === undefined) addonSelections[a.id] = 0
    } else if (addonToggles[a.id] === undefined) {
      addonToggles[a.id] = false
    }
  }
}, { immediate: true })

// ─── 参考图上传 ───
async function handleRefUpload({ file }) {
  if (file.size > 10 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(t('manualOrder.fileTooBig', { name: file.name, size: sizeMB }))
    return
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

// ─── 粘贴上传（R5 复用） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteRefFiles,
  maxCount: 5,
  maxSizeMB: 10
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

async function handlePasteRefFiles(files) {
  for (const file of files) {
    if (refFileList.value.length >= 5) {
      ElMessage.warning(t('manualOrder.refExceed'))
      return
    }
    const uploaded = await uploadApi.reference(file)
    uploadedRefs.value.push(uploaded.filePath)
    const uid = `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`
    refUidMap.value.set(uid, uploaded.filePath)
    refFileList.value.push({ name: file.name || 'pasted-image.png', url: `/uploads/${uploaded.filePath}`, uid, status: 'success' })
  }
}

// ─── 提交 ───
async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const addons = form.tierId ? buildAddonList() : []

    const order = await artistApi.createManualOrder({
      clientQq: form.clientQq.trim(),
      clientName: form.clientName.trim() || null,
      tierId: form.tierId,
      description: form.description.trim() || null,
      priority: form.priority,
      clientNotify: form.clientNotify,
      references: uploadedRefs.value,
      addons,
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })

    // R3 + UI-5 修复：有手动价格且与计算价不同（或无档位/无计算价）时，调 R2 接口写入
    // P2-#13: 后续步骤失败时明确告知"订单已创建"，防重复提交
    let postCreateFailed = null
    if (order.id && finalPriceYuan.value != null) {
      const calcCents = pricePreview.value?.totalPriceCents ?? null
      const manualCents = Math.round(finalPriceYuan.value * 100)
      if (manualCents > 0 && manualCents !== calcCents) {
        try {
          await artistApi.updatePrice(order.id, {
            finalPriceCents: manualCents,
            quoteSnapshot: order.quote_snapshot || null
          })
        } catch (e) { postCreateFailed = `价格写入失败：${e.message}` }
      }
    }

    // R51: 截稿日（手动录单接口不支持 deadline 字段，创建后单独写入）
    if (order.id && form.deadline) {
      try {
        await artistApi.updateDeadline(order.id, form.deadline)
      } catch (e) { postCreateFailed = postCreateFailed || `截稿日写入失败：${e.message}` }
    }

    resultNo.value = order.order_no
    showResult.value = true
    // R42a: 通知父组件（订单列表）刷新
    emit('created', order.order_no)
    if (postCreateFailed) {
      ElMessage.warning(`订单 ${order.order_no} 已创建，但${postCreateFailed}。请在订单详情中补充。`)
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  showResult.value = false
  form.clientQq = ''
  form.clientName = ''
  form.tierId = null
  form.description = ''
  form.priority = 'medium'
  form.deadline = null
  form.clientNotify = false
  form.usageMultiplierId = null
  form.rushMultiplierId = null
  for (const key of Object.keys(addonSelections)) delete addonSelections[key]
  for (const key of Object.keys(addonToggles)) delete addonToggles[key]
  pricePreview.value = null
  finalPriceYuan.value = null
  refFileList.value = []
  uploadedRefs.value = []
  refUidMap.value.clear()
}

// ─── 初始化 ───
onMounted(async () => {
  try {
    const profile = await artistApi.getProfile()
    subdomain.value = profile.subdomain
    tiers.value = profile.tiers || []
    // 加载价格数据（增项+倍率）
    artistPublicApi.getPricing(profile.subdomain)
      .then(res => { pricingData.value = res })
      .catch(() => {})
  } catch { /* ignore */ }
})
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin-top: 0; }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.final-price-hint { font-size: 12px; color: var(--text-secondary); margin-left: 8px; }
/* P1-4: 参考图说明 tooltip 图标 */
.ref-tip-icon {
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: help;
  vertical-align: middle;
  transition: color 0.2s;
}
.ref-tip-icon:hover { color: var(--el-color-primary); }

/* 增项分组（与 OrderForm 一致） */
.addon-groups { width: 100%; }
.addon-group { margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.addon-group-title {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--bg-inset); cursor: pointer;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  user-select: none;
}
.addon-group-title:hover { background: var(--bg-hover); }
.collapse-arrow { color: var(--text-muted); font-size: 12px; }
.addon-items { padding: 8px 14px; }
.addon-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid var(--border-color);
}
.addon-item:last-child { border-bottom: none; }
.addon-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.addon-item-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.addon-item-price { font-size: 12px; color: var(--el-color-primary); font-weight: 600; }
.addon-item-desc { font-size: 11px; color: var(--text-secondary); }

/* 倍率 */
.multiplier-section { width: 100%; }
.multiplier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.multiplier-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }

/* 价格预览 */
.price-preview {
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; color: var(--text-secondary); }
.price-line.total { font-size: 16px; font-weight: 700; color: var(--text-primary); padding-top: 8px; }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
</style>
