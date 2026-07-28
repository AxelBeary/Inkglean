<template>
  <div class="order-form-page">
    <div class="page-prefs"><ThemeToggle /></div>
    <div class="form-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('orderForm.backHome')" :content="$t('orderForm.title')" />

      <el-card style="margin-top: 16px" v-if="artist">
        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
          <!-- 档位选择 -->
          <el-form-item :label="$t('orderForm.tierLabel')" prop="tierId">
            <el-select v-model="form.tierId" :placeholder="$t('orderForm.tierPlaceholder')" style="width: 100%" @change="onTierChange">
              <el-option v-for="tier in tiers" :key="tier.id" :label="`${tier.name} - ¥${tier.price}`" :value="tier.id" />
            </el-select>
          </el-form-item>

          <!-- R14: 紧凑计价摘要（选完档位后先显示基础价，详细计价渐进展开） -->
          <div v-if="form.tierId && selectedTier" class="pricing-summary">
            <span class="pricing-summary-name">{{ selectedTier.name }}</span>
            <span class="pricing-summary-price">¥{{ selectedTier.price }}</span>
            <button
              v-if="hasPricingExtras"
              type="button"
              class="pricing-expand-btn"
              @click="pricingExpanded = !pricingExpanded"
            >
              {{ $t('orderForm.pricingDetail') }} {{ pricingExpanded ? '▾' : '▸' }}
            </button>
          </div>

          <!-- 增项选择（R14: 展开后才显示） -->
          <Transition name="pricing-expand">
            <div v-if="pricingExpanded && form.tierId">
              <el-form-item v-if="availableAddons.length > 0" label="可选增项">
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
                        <!-- 数量模式 -->
                        <el-input-number
                          v-if="a.select_mode === 'quantity'"
                          v-model="addonSelections[a.id]"
                          :min="0" :max="a.max_qty" size="small" style="width: 110px"
                        />
                        <!-- 开关模式 -->
                        <el-switch
                          v-else-if="a.select_mode === 'toggle'"
                          v-model="addonToggles[a.id]" size="small"
                        />
                        <!-- 面议模式 -->
                        <el-tag v-else size="small" type="warning">面议</el-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </el-form-item>

              <!-- 倍率选择 -->
              <el-form-item v-if="usageMultipliers.length > 0 || rushMultipliers.length > 0" label="用途与加急">
                <div class="multiplier-section">
                  <div v-if="usageMultipliers.length > 0" class="multiplier-row">
                    <span class="multiplier-label">用途：</span>
                    <el-radio-group v-model="form.usageMultiplierId" size="small">
                      <el-radio-button :value="null">个人</el-radio-button>
                      <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                        {{ m.name }} ×{{ m.multiplier }}
                      </el-radio-button>
                    </el-radio-group>
                  </div>
                  <div v-if="rushMultipliers.length > 0" class="multiplier-row">
                    <span class="multiplier-label">加急：</span>
                    <el-radio-group v-model="form.rushMultiplierId" size="small">
                      <el-radio-button :value="null">不加急</el-radio-button>
                      <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                        {{ m.name }} ×{{ m.multiplier }}
                      </el-radio-button>
                    </el-radio-group>
                  </div>
                </div>
              </el-form-item>

              <!-- 实时价格预览（R14: 展开后才显示） -->
              <div v-if="form.tierId && pricePreview" class="price-preview">
                <div class="price-line" v-for="item in pricePreview.breakdown" :key="item.name">
                  <span>{{ item.name }}</span>
                  <span class="price-amount">¥{{ item.amount.toFixed(2) }}</span>
                </div>
                <div class="price-divider"></div>
                <div class="price-line total">
                  <span>总价</span>
                  <span class="price-amount">¥{{ pricePreview.totalPrice.toFixed(2) }}</span>
                </div>
                <div v-if="pricePreview.installments.length > 1" class="installment-row">
                  <span v-for="inst in pricePreview.installments" :key="inst.label" class="installment-chip">
                    {{ inst.label }} ¥{{ inst.amount.toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- 流程与收款预览（R1: 保持原位，增加修改说明告示） -->
          <el-form-item v-if="workflowStages.length || artist?.revisionNote" :label="$t('orderForm.workflowLabel')">
            <WorkflowOverviewStrip v-if="workflowStages.length" :stages="workflowStages" />
            <div v-if="artist?.revisionNote" class="tpl-revision-note">
              <span class="tpl-revision-note-icon" aria-hidden="true">✏️</span>
              <span>
                <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
                {{ artist.revisionNote }}
              </span>
            </div>
          </el-form-item>

          <!-- 需求描述 -->
          <el-form-item :label="$t('orderForm.descLabel')" prop="description">
            <el-input
              v-model="form.description" type="textarea" :rows="5"
              :placeholder="$t('orderForm.descPlaceholder')" maxlength="2000" show-word-limit
            />
          </el-form-item>

          <!-- 参考图上传 -->
          <el-form-item :label="$t('orderForm.refLabel')">
            <el-upload
              :auto-upload="true" :http-request="handleRefUpload"
              accept="image/*" list-type="picture-card" :limit="5"
              :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('orderForm.refExceed'))"
              :on-remove="handleRefRemove"
            >
              <el-icon aria-label="上传参考图"><Plus /></el-icon>
            </el-upload>
            <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
          </el-form-item>

          <!-- QQ号 -->
          <el-form-item :label="$t('orderForm.qqLabel')" prop="clientQq">
            <el-input v-model="form.clientQq" :placeholder="$t('orderForm.qqPlaceholder')" />
          </el-form-item>

          <!-- 昵称 -->
          <el-form-item :label="$t('orderForm.nameLabel')">
            <el-input v-model="form.clientName" :placeholder="$t('orderForm.namePlaceholder')" />
          </el-form-item>

          <!-- QQ通知 -->
          <el-form-item v-if="artist.notifyEnabled">
            <el-checkbox v-model="form.notifyEnabled">{{ $t('orderForm.notifyLabel') }}</el-checkbox>
          </el-form-item>

          <!-- 须知确认（消毒后渲染） -->
          <el-form-item v-if="rulesContent" prop="agreed">
            <el-card shadow="never" class="rules-preview">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="sanitizedRules" class="rules-html"></div>
            </el-card>
            <el-checkbox v-model="form.agreed" style="margin-top: 8px">
              {{ $t('orderForm.agreeLabel') }}
            </el-checkbox>
          </el-form-item>

          <!-- 平台职责声明 -->
          <el-form-item>
            <Disclaimer />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="submit" :loading="submitting" style="width: 100%">
              {{ $t('orderForm.submit') }}
              <template v-if="pricePreview"> — ¥{{ pricePreview.totalPrice.toFixed(2) }}</template>
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 成功弹窗 -->
    <el-dialog v-model="showSuccess" :title="$t('orderForm.successTitle')" width="380px" :close-on-click-modal="false">
      <el-result icon="success" :title="$t('orderForm.orderNoIs') + resultNo">
        <template #sub-title>{{ $t('orderForm.addQqHint') }}</template>
        <template #extra>
          <el-button type="primary" @click="$router.push(`/artist/${subdomain}/track?no=${resultNo}`)">
            {{ $t('orderForm.viewProgress') }}
          </el-button>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { artistPublicApi, orderApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import Disclaimer from '../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../components/shared/WorkflowOverviewStrip.vue'
import ThemeToggle from '../../components/ThemeToggle.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const formRef = ref(null)
const artist = ref(null)
const tiers = ref([])
const rulesContent = ref('')
const loading = ref(true)
const submitting = ref(false)
const showSuccess = ref(false)
const resultNo = ref('')
const refFileList = ref([])
const uploadedRefs = ref([])
const workflowStages = ref([])
const refUidMap = ref(new Map())

// ─── 价格计算器状态 ───
const pricingData = ref(null) // { tiers, multipliers, installments }
const addonSelections = reactive({}) // addonId → quantity
const addonToggles = reactive({})    // addonId → boolean
const pricePreview = ref(null)
const pricingExpanded = ref(false)   // R14: 详细计价展开状态

// R14: 当前选中档位（摘要行用）
const selectedTier = computed(() => tiers.value.find(t => t.id === form.tierId) || null)
// R14: 有增项或倍率时才显示"详细计价"入口
const hasPricingExtras = computed(() =>
  availableAddons.value.length > 0 || usageMultipliers.value.length > 0 || rushMultipliers.value.length > 0
)

const sanitizedRules = computed(() => sanitizeHtml(rulesContent.value))

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

// ─── 增项分组（按 category 折叠） ───
const CATEGORY_META = {
  expression: { icon: '🎭', label: '表情差分' },
  outfit: { icon: '👗', label: '服装替换' },
  background: { icon: '🏞', label: '背景场景' },
  weapon: { icon: '⚔️', label: '武器道具' },
  other: { icon: '✨', label: '其他' }
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

async function doCalc() {
  if (!form.tierId) { pricePreview.value = null; return }

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

  try {
    pricePreview.value = await artistPublicApi.calculatePrice({
      subdomain,
      tierId: form.tierId,
      addons,
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

// ─── 上传 ───
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
const { pasteError } = usePasteUpload({
  onFiles: handlePasteRefFiles,
  maxCount: 5,
  maxSizeMB: 10
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

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

// ─── 提交 ───
async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    // 构建增项列表
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

    const order = await orderApi.create({
      subdomain,
      tierId: form.tierId,
      description: form.description.trim(),
      clientQq: form.clientQq.trim(),
      clientName: form.clientName.trim(),
      clientNotify: form.notifyEnabled,
      agreeRules: form.agreed,
      references: uploadedRefs.value,
      addons,
      usageMultiplierId: form.usageMultiplierId,
      rushMultiplierId: form.rushMultiplierId
    })
    resultNo.value = order.orderNo
    showSuccess.value = true
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    submitting.value = false
  }
}

// ─── 初始化 ───
onMounted(async () => {
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
  } catch (err) {
    ElMessage.error(err.message || t('orderForm.loadFailed'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.order-form-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 16px;
  transition: background 0.3s;
  position: relative;
}
.page-prefs { position: absolute; top: 16px; right: 16px; z-index: 10; }
.form-container { max-width: 600px; margin: 0 auto; }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* R14: 紧凑计价摘要 + 渐进展开 */
.pricing-summary {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 12px;
  background: var(--bg-inset); border: 1px solid var(--border-color); border-radius: 8px;
}
.pricing-summary-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.pricing-summary-price { font-size: 16px; font-weight: 700; color: var(--el-color-primary); }
.pricing-expand-btn {
  margin-left: auto; padding: 4px 10px;
  background: transparent; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 12px; color: var(--text-secondary); cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.pricing-expand-btn:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.pricing-expand-enter-active, .pricing-expand-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.pricing-expand-enter-from, .pricing-expand-leave-to { opacity: 0; transform: translateY(-8px); }
.rules-preview { max-height: 200px; overflow-y: auto; }
.rules-html { line-height: 1.8; color: var(--text-primary); }

/* 增项分组 */
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
.installment-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.installment-chip {
  font-size: 12px; padding: 3px 10px; border-radius: 12px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
  font-weight: 500;
}
</style>
