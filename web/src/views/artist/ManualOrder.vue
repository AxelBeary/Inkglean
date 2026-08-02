<template>
  <!-- REQ-015: 手动录单全屏双栏独立页面（原 560px 抽屉 → 独立路由 /orders/new） -->
  <ArtistLayout>
    <div class="manual-order-page">
      <h2>{{ $t('manualOrder.title') }}</h2>
      <p class="hint">{{ $t('manualOrder.hint') }}</p>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
        <div class="mo-grid">
          <!-- ═══ 左栏：客户说了什么 ═══ -->
          <section class="mo-col">
            <h3 class="mo-section">{{ $t('manualOrder.leftTitle') }}</h3>

            <!-- 客户QQ -->
            <el-form-item :label="$t('manualOrder.clientQq')" prop="clientQq">
              <el-input v-model="form.clientQq" :placeholder="$t('manualOrder.clientQqPlaceholder')" />
            </el-form-item>

            <!-- 参考图上传（大块粘贴区，左栏最显眼位置——画师流程：QQ收图→粘贴→再填其他） -->
            <div class="mo-ref-section">
              <div class="mo-ref-label">
                <span>{{ $t('manualOrder.references') }}</span>
                <el-tooltip :content="$t('manualOrder.refTip')" placement="top">
                  <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
              <!-- F2: 拖拽上传（drag + multiple），保留点击上传 -->
              <el-upload
                drag multiple
                :auto-upload="true" :http-request="handleRefUpload"
                accept="image/*" list-type="picture-card" :limit="5"
                :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('manualOrder.refExceed'))"
                :on-remove="handleRefRemove" class="mo-ref-upload"
              >
                <el-icon :size="24" aria-label="上传参考图"><Plus /></el-icon>
                <template #tip>
                  <span class="drag-hint">{{ $t('manualOrder.dragHint') }}</span>
                </template>
              </el-upload>
              <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
            </div>

            <!-- 客户昵称 -->
            <el-form-item :label="$t('manualOrder.clientName')">
              <el-input v-model="form.clientName" :placeholder="$t('manualOrder.clientNamePlaceholder')" />
            </el-form-item>

            <!-- 需求描述 -->
            <el-form-item :label="$t('manualOrder.desc')">
              <el-input
                v-model="form.description" type="textarea" :rows="4"
                :placeholder="$t('manualOrder.descPlaceholder')" maxlength="2000" show-word-limit
              />
            </el-form-item>

            <!-- 优先级 -->
            <el-form-item :label="$t('manualOrder.priority')">
              <el-radio-group v-model="form.priority">
                <el-radio-button value="high">{{ $t('manualOrder.priorityHigh') }}</el-radio-button>
                <el-radio-button value="medium">{{ $t('manualOrder.priorityMedium') }}</el-radio-button>
                <el-radio-button value="low">{{ $t('manualOrder.priorityLow') }}</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <!-- 截稿日 -->
            <el-form-item :label="$t('manualOrder.deadline')">
              <el-date-picker
                v-model="form.deadline" type="date" value-format="YYYY-MM-DD"
                :placeholder="$t('manualOrder.deadlinePlaceholder')"
                :disabled-date="(d) => d < new Date()"
                clearable style="width: 200px"
              />
            </el-form-item>
            <!-- F3: 开稿日（可选，REQ-018 disabled-date 限今天之前不可选） -->
            <el-form-item :label="$t('manualOrder.startDate')">
              <el-date-picker
                v-model="form.startDate" type="date" value-format="YYYY-MM-DD"
                :placeholder="$t('manualOrder.startDatePlaceholder')"
                :disabled-date="(d) => d < new Date()"
                clearable style="width: 200px"
              />
            </el-form-item>

            <!-- QQ通知开关 -->
            <el-form-item>
              <el-checkbox v-model="form.clientNotify">{{ $t('manualOrder.clientNotify') }}</el-checkbox>
            </el-form-item>

            <!-- 该QQ历史订单面板（输入QQ后防抖500ms自动查询） -->
            <div v-if="qqValid" class="mo-history" v-loading="qqHistoryLoading" element-loading-background="transparent">
              <h4 class="mo-history-title">{{ $t('manualOrder.historyTitle') }}</h4>
              <div v-if="qqHistoryLoaded && qqHistory.length === 0" class="mo-history-empty">
                {{ $t('manualOrder.newClient') }}
              </div>
              <div v-else-if="qqHistory.length > 0" class="mo-history-list">
                <div v-for="o in qqHistory" :key="o.id" class="mo-history-item">
                  <span class="mo-history-no">{{ o.order_no }}</span>
                  <span class="mo-history-tier">{{ o.tier_name || $t('common.custom') }}</span>
                  <el-tag :type="statusType(o.status)" size="small">{{ $t(`common.orderStatus.${o.status}`) }}</el-tag>
                  <span class="mo-history-date">{{ formatDate(o.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- ═══ 右栏：怎么录 ═══ -->
          <section class="mo-col">
            <h3 class="mo-section">{{ $t('manualOrder.rightTitle') }}</h3>

            <!-- 档位选择（卡片式，替代下拉框） -->
            <div class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.tier') }}</div>
              <div v-if="tiers.length === 0" class="mo-empty-tiers">{{ $t('manualOrder.noTiers') }}</div>
              <div v-else class="tier-cards">
                <div
                  v-for="tier in tiers" :key="tier.id"
                  class="tier-card" :class="{ 'tier-card--active': form.tierId === tier.id }"
                  @click="selectTier(tier)"
                >
                  <span v-if="form.tierId === tier.id" class="tier-card-check">✓</span>
                  <img
                    v-if="tier.example_image"
                    :src="`/uploads/${tier.example_image}`"
                    class="tier-card-img" alt=""
                  />
                  <div class="tier-card-body">
                    <div class="tier-card-name">{{ tier.name }}</div>
                    <div class="tier-card-price">¥{{ tier.price }}</div>
                    <div v-if="tier.work_days" class="tier-card-days">{{ $t('manualOrder.tierDays', { n: tier.work_days }) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 增项选择（选完档位后出现） -->
            <div v-if="form.tierId && availableAddons.length > 0" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.addons') }}</div>
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
            </div>

            <!-- 倍率选择 -->
            <div v-if="form.tierId && (usageMultipliers.length > 0 || rushMultipliers.length > 0)" class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.multipliers') }}</div>
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
            </div>

            <!-- F4: 初始节点状态（线下已谈好的单子可直接跳过确认） -->
            <div class="mo-field">
              <div class="mo-field-label">{{ $t('manualOrder.initialStatus') }}</div>
              <el-radio-group v-model="initialStatus" size="small">
                <el-radio-button
                  v-for="opt in initialStatusOptions" :key="opt.value"
                  :value="opt.value" :disabled="opt.disabled"
                >
                  {{ $t(`common.orderStatus.${opt.value}`) }}
                </el-radio-button>
              </el-radio-group>
              <p class="initial-status-hint">{{ $t('manualOrder.initialStatusHint') }}</p>
            </div>

            <!-- 价格面板 sticky（≥600px 可见，<600px 由底部价格条替代） -->
            <div class="mo-price-sticky">
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

              <!-- 最终价格（可手动覆盖） -->
              <div class="mo-field">
                <div class="mo-field-label">{{ $t('manualOrder.finalPrice') }}</div>
                <div class="mo-final-row">
                  <el-input-number
                    v-model="finalPriceYuan"
                    :min="0" :max="999999.99" :precision="2" :step="10"
                    style="width: 200px"
                  />
                  <span class="final-price-hint">{{ $t('manualOrder.finalPriceHint') }}</span>
                </div>
              </div>

              <!-- 提交按钮（桌面/平板） -->
              <el-button type="primary" @click="submit" :loading="submitting" class="mo-submit-btn">
                {{ $t('manualOrder.submit') }}
                <template v-if="displayPrice"> — ¥{{ displayPrice }}</template>
              </el-button>
            </div>
          </section>
        </div>
      </el-form>

      <!-- ═══ 移动端底部钉住价格条（<600px，淘宝结算页模式） ═══ -->
      <div class="mo-mobile-bar">
        <!-- 展开明细（点价格区域切换） -->
        <transition name="mo-slide">
          <div v-show="mobileDetailOpen" class="mo-mobile-details">
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
            <div class="mo-mobile-final">
              <span>{{ $t('manualOrder.finalPrice') }}</span>
              <el-input-number
                v-model="finalPriceYuan"
                :min="0" :max="999999.99" :precision="2" :step="10"
                size="small" style="width: 150px"
              />
            </div>
          </div>
        </transition>
        <!-- 底栏：价格 + 提交 -->
        <div class="mo-mobile-actions">
          <div class="mo-mobile-price" @click="mobileDetailOpen = !mobileDetailOpen">
            <span class="mo-mobile-total">¥{{ displayPrice || '—' }}</span>
            <span class="mo-mobile-detail-link">
              {{ $t('manualOrder.priceDetail') }}
              <el-icon :size="12"><ArrowUp v-if="mobileDetailOpen" /><ArrowDown v-else /></el-icon>
            </span>
          </div>
          <el-button type="primary" @click="submit" :loading="submitting" class="mo-mobile-submit">
            {{ $t('manualOrder.submit') }}
          </el-button>
        </div>
      </div>

      <!-- 录入成功 -->
      <el-dialog v-model="showResult" :title="$t('manualOrder.resultTitle')" width="400px">
        <el-result icon="success" :title="$t('manualOrder.orderNo', { no: resultNo })">
          <template #sub-title>{{ $t('manualOrder.addedToQueue') }}</template>
          <template #extra>
            <el-button type="primary" @click="$router.push('/queue')">{{ $t('manualOrder.viewQueue') }}</el-button>
            <el-button @click="resetForm">{{ $t('manualOrder.continueEntry') }}</el-button>
          </template>
        </el-result>
      </el-dialog>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { artistApi, artistPublicApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus, InfoFilled, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useStageStatus } from '../../composables/useStageStatus.js'
import { formatDateTimeShort } from '../../utils/datetime.js'
import { ORDER_STATUS_TYPE } from '../../constants/order.js'
import ArtistLayout from '../../components/ArtistLayout.vue'

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

// ─── REQ-015 新增状态 ───
const mobileDetailOpen = ref(false)
const qqHistory = ref([])
const qqHistoryLoading = ref(false)
const qqHistoryLoaded = ref(false)

// ─── F4: 初始节点状态 ───
const workflowStages = ref([])
const { initialStatus, options: initialStatusOptions, findTarget: findTargetStage } = useStageStatus(workflowStages)

const form = reactive({
  clientQq: '',
  clientName: '',
  tierId: null,
  description: '',
  priority: 'medium',
  deadline: null,
  startDate: null,
  clientNotify: false,
  usageMultiplierId: null,
  rushMultiplierId: null
})

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

// ─── 辅助函数 ───
const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'
const formatDate = (str) => formatDateTimeShort(str)

// ─── 档位卡片选择（替代下拉框） ───
function selectTier(tier) {
  form.tierId = form.tierId === tier.id ? null : tier.id
  onTierChange()
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

/** QQ 号格式校验（5-15位纯数字） */
const qqValid = computed(() => /^\d{5,15}$/.test(form.clientQq.trim()))

function formatAddonPrice(a) {
  if (a.select_mode === 'inquiry') return t('manualOrder.inquiry')
  if (a.price_type === 'percent') return `+${Math.round(a.price_value * 100)}%`
  return `¥${a.price_value}/个`
}

/** 切换档位时清空增项/倍率并重新计算 */
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

// ─── QQ 历史订单（防抖 500ms，客户端过滤——API 零改动） ───
let qqTimer = null
watch(() => form.clientQq, (qq) => {
  if (qqTimer) clearTimeout(qqTimer)
  const trimmed = (qq || '').trim()
  if (!/^\d{5,15}$/.test(trimmed)) {
    qqHistory.value = []
    qqHistoryLoaded.value = false
    return
  }
  qqHistoryLoading.value = true
  qqTimer = setTimeout(async () => {
    try {
      const res = await artistApi.getOrders(undefined, { page: 1, pageSize: 200 })
      const items = res.items ?? res
      qqHistory.value = items.filter(o => o.client_qq === trimmed).slice(0, 5)
    } catch {
      qqHistory.value = []
    } finally {
      qqHistoryLoading.value = false
      qqHistoryLoaded.value = true
    }
  }, 500)
})

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

    // 有手动价格且与计算价不同（或无档位/无计算价）时，调 R2 接口写入
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

    // F3: 开稿日（同截稿日，创建后单独写入）
    if (order.id && form.startDate) {
      try {
        await artistApi.updateStartDate(order.id, form.startDate)
      } catch (e) { postCreateFailed = postCreateFailed || `开稿日写入失败：${e.message}` }
    }

    // F4: 初始节点状态（非默认时推进到目标节点；R30d 有工作流的订单不能直接改 status）
    if (order.id && initialStatus.value !== 'pending') {
      try {
        if (workflowStages.value.length > 0) {
          const target = findTargetStage()
          if (target) await artistApi.advanceStage(order.id, target.id)
        } else {
          await artistApi.updateStatus(order.id, initialStatus.value)
        }
      } catch (e) { postCreateFailed = postCreateFailed || `初始状态设置失败：${e.message}` }
    }

    resultNo.value = order.order_no
    showResult.value = true
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
  form.startDate = null
  initialStatus.value = 'pending'
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
  // REQ-015 新增状态重置
  qqHistory.value = []
  qqHistoryLoaded.value = false
  mobileDetailOpen.value = false
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
    // F4: 加载工作流节点（判断初始状态可达性）
    artistApi.getWorkflow()
      .then(res => { workflowStages.value = res.stages || [] })
      .catch(() => {})
  } catch { /* ignore */ }
})
</script>

<style scoped>
/* ─── 页面容器 ─── */
.manual-order-page { max-width: 1200px; margin: 0 auto; }
.hint { color: var(--text-secondary); font-size: 13px; margin-top: 0; }

/* ─── 双栏网格（≥1024px） ─── */
.mo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}
.mo-section {
  font-size: 16px; font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--border-color);
}

/* ─── 参考图粘贴区（大块显眼） ─── */
.mo-ref-section {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-inset);
  margin-bottom: 20px;
  transition: border-color 0.2s;
}
.mo-ref-section:hover, .mo-ref-section:focus-within {
  border-color: var(--el-color-primary);
}
.mo-ref-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 14px; font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.ref-tip-icon {
  color: var(--text-secondary); cursor: help;
  vertical-align: middle; transition: color 0.2s;
}
.ref-tip-icon:hover { color: var(--el-color-primary); }
.mo-ref-upload :deep(.el-upload--picture-card) {
  width: 100%; height: 100px;
  border-radius: 8px;
}
/* F2: 拖拽提示 */
.drag-hint { font-size: 12px; color: var(--text-secondary); }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 6px; }

/* ─── 档位卡片 ─── */
.mo-field { margin-bottom: 20px; }
.mo-field-label {
  font-size: 14px; font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.tier-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.tier-card {
  position: relative;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.tier-card:hover { border-color: var(--el-color-primary-light-5); }
.tier-card--active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.tier-card-check {
  position: absolute; top: 6px; right: 6px; z-index: 1;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-color-primary); color: #fff;
  border-radius: 50%; font-size: 12px; font-weight: 700;
}
.tier-card-img {
  width: 100%; aspect-ratio: 4 / 3;
  object-fit: cover; display: block;
  background: var(--bg-inset);
}
.tier-card-body { padding: 10px 12px; }
.tier-card-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.tier-card-price { font-size: 15px; font-weight: 700; color: var(--el-color-primary); margin-top: 2px; }
.tier-card-days { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.mo-empty-tiers {
  padding: 24px; text-align: center;
  color: var(--text-secondary); font-size: 13px;
  border: 1px dashed var(--border-color); border-radius: 8px;
}

/* ─── QQ 历史订单面板 ─── */
.mo-history {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--bg-inset);
  min-height: 60px;
}
.mo-history-title {
  font-size: 13px; font-weight: 700;
  color: var(--text-secondary);
  margin: 0 0 10px;
}
.mo-history-empty {
  font-size: 14px; color: var(--el-color-success);
  font-weight: 600; padding: 4px 0;
}
.mo-history-list { display: flex; flex-direction: column; gap: 8px; }
.mo-history-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-primary);
  flex-wrap: wrap;
}
.mo-history-no { font-weight: 600; font-variant-numeric: tabular-nums; }
.mo-history-tier { color: var(--text-secondary); }
.mo-history-date { color: var(--text-muted); font-size: 12px; margin-left: auto; }

/* ─── 增项分组（与 OrderForm 一致） ─── */
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

/* ─── 倍率 ─── */
.multiplier-section { width: 100%; }
.multiplier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.multiplier-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }

/* ─── F4: 初始节点状态 ─── */
.initial-status-hint { font-size: 12px; color: var(--text-secondary); margin: 6px 0 0; }

/* ─── 价格面板 sticky ─── */
.mo-price-sticky {
  position: sticky; top: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-card);
  z-index: 10;
}
.price-preview {
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; color: var(--text-secondary); }
.price-line.total { font-size: 16px; font-weight: 700; color: var(--text-primary); padding-top: 8px; }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
.mo-final-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.final-price-hint { font-size: 12px; color: var(--text-secondary); }
.mo-submit-btn { width: 100%; margin-top: 4px; }

/* ─── 移动端底部价格条（默认隐藏，<600px 显示） ─── */
.mo-mobile-bar { display: none; }

/* ─── 响应式：平板（600–1024px）单栏 ─── */
@media (max-width: 1023px) {
  .mo-grid { grid-template-columns: 1fr; }
}

/* ─── 响应式：手机（<600px）底部钉住价格条 ─── */
@media (max-width: 599px) {
  .mo-price-sticky { display: none; }
  .mo-mobile-bar {
    display: block;
    position: fixed; bottom: 0; left: 0; right: 0;
    z-index: 200;
    background: var(--bg-card);
    border-top: 1px solid var(--border-color);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  }
  .mo-mobile-details {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    max-height: 40vh; overflow-y: auto;
  }
  .mo-mobile-final {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 10px; font-size: 13px; color: var(--text-primary);
  }
  .mo-mobile-actions {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }
  .mo-mobile-price {
    flex: 1; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
  }
  .mo-mobile-total { font-size: 20px; font-weight: 700; color: var(--el-color-primary); font-variant-numeric: tabular-nums; }
  .mo-mobile-detail-link {
    font-size: 11px; color: var(--text-secondary);
    display: flex; align-items: center; gap: 2px;
  }
  .mo-mobile-submit { min-width: 120px; }
  /* 底部留白，防内容被价格条遮挡 */
  .manual-order-page { padding-bottom: 90px; }
}

/* ─── 明细展开动画 ─── */
.mo-slide-enter-active, .mo-slide-leave-active { transition: all 0.25s ease; }
.mo-slide-enter-from, .mo-slide-leave-to { opacity: 0; transform: translateY(8px); }
</style>
