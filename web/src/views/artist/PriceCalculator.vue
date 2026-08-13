<template>
  <div class="price-calc-page">
    <h2 class="od-page-title">{{ $t('priceCalc.title') }}</h2>
    <p class="page-sub">{{ $t('priceCalc.subtitle') }}</p>

    <div v-if="loading" class="calc-empty">{{ $t('priceCalc.loading') }}</div>

    <!-- 加载失败错误态 + 重试（区分"真没有画风"与"加载失败"，不再误显示无可用画风引导） -->
    <div v-else-if="loadFailed" class="module-error">
      <span>{{ $t('priceCalc.loadFailed') }}</span>
      <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
    </div>

    <template v-else-if="styles.length > 0">
      <!-- 步骤 1：选画风（多画风才显示；单画风自动选中） -->
      <div v-if="styles.length > 1" class="calc-step">
        <div class="calc-step-label">{{ $t('priceCalc.stepStyle') }}</div>
        <div class="style-cards">
          <button
            v-for="s in styles" :key="s.id" type="button"
            class="style-card" :class="{ 'style-card--active': selectedStyleId === s.id }"
            @click="selectStyle(s.id)"
          >
            {{ s.name }}
          </button>
        </div>
      </div>

      <!-- 步骤 2：选尺寸 -->
      <div v-if="selectedStyle" class="calc-step">
        <div class="calc-step-label">{{ $t('priceCalc.stepSize') }}</div>
        <div v-if="selectedStyle.sizes.length === 0" class="calc-empty">{{ $t('priceCalc.noSizes') }}</div>
        <div v-else class="size-cards">
          <button
            v-for="sz in selectedStyle.sizes" :key="sz.id" type="button"
            class="size-card" :class="{ 'size-card--active': selectedSizeId === sz.id }"
            @click="selectSize(sz.id)"
          >
            <span class="size-card-name">{{ sz.name }}</span>
            <span class="size-card-price">{{ formatYuanValue(sz.base_price) }}</span>
            <span v-if="sz.work_days" class="size-card-days">{{ $t('priceCalc.workDays', { n: sz.work_days }) }}</span>
          </button>
        </div>
      </div>

      <!-- 步骤 3：增项（选完尺寸后出现） -->
      <div v-if="selectedSizeId && availableAddons.length > 0" class="calc-step">
        <div class="calc-step-label">{{ $t('priceCalc.stepAddons') }}</div>
        <div class="addon-list">
          <div v-for="a in availableAddons" :key="a.id" class="addon-item">
            <div class="addon-item-info">
              <span class="addon-item-name">{{ a.name }}</span>
              <span class="addon-item-price">{{ formatAddonPrice(a) }}</span>
            </div>
            <el-switch
              v-if="a.control_type === 'switch'" size="small"
              :model-value="addonSel[a.id]?.toggled || false"
              @change="(val) => setAddon(a.id, { toggled: !!val })"
            />
            <el-input-number
              v-else-if="a.control_type === 'quantity'" size="small"
              :model-value="addonSel[a.id]?.quantity || 0" :min="0" :max="99" :step="1"
              style="width: 110px"
              @change="(val) => setAddon(a.id, { quantity: val ?? 0 })"
            />
            <el-radio-group
              v-else-if="a.control_type === 'radio'" size="small"
              :model-value="addonSel[a.id]?.optionLabel || null"
              @change="(val) => setAddon(a.id, { optionLabel: val })"
            >
              <el-radio-button v-for="opt in parseOptions(a.options)" :key="opt.label" :value="opt.label">
                {{ opt.label }} {{ formatYuanValue(opt.price) }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>

      <!-- 步骤 4：倍率（可选，选完尺寸后出现） -->
      <div v-if="selectedSizeId && (usageMultipliers.length > 0 || rushMultipliers.length > 0)" class="calc-step">
        <div class="calc-step-label">{{ $t('priceCalc.stepMultipliers') }}</div>
        <div class="multiplier-section">
          <div v-if="usageMultipliers.length > 0" class="multiplier-row">
            <span class="multiplier-label">{{ $t('priceCalc.usage') }}：</span>
            <el-radio-group size="small" :model-value="usageMultiplierId" @change="(v) => { usageMultiplierId = v; scheduleCalc() }">
              <el-radio-button :value="null">{{ $t('priceCalc.none') }}</el-radio-button>
              <el-radio-button v-for="m in usageMultipliers" :key="m.id" :value="m.id">
                {{ m.name }} ×{{ m.multiplier }}
              </el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="rushMultipliers.length > 0" class="multiplier-row">
            <span class="multiplier-label">{{ $t('priceCalc.rush') }}：</span>
            <el-radio-group size="small" :model-value="rushMultiplierId" @change="(v) => { rushMultiplierId = v; scheduleCalc() }">
              <el-radio-button :value="null">{{ $t('priceCalc.none') }}</el-radio-button>
              <el-radio-button v-for="m in rushMultipliers" :key="m.id" :value="m.id">
                {{ m.name }} ×{{ m.multiplier }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>

      <!-- 估算结果 -->
      <div v-if="preview" class="calc-result">
        <div class="calc-result-head">
          <span>{{ preview.styleName }} · {{ preview.sizeName }}</span>
          <span class="calc-result-total">{{ formatYuanValue(preview.totalPrice) }}</span>
        </div>
        <div class="calc-line"><span>{{ $t('priceCalc.basePrice') }}</span><span>{{ formatYuanValue(preview.basePrice) }}</span></div>
        <div v-for="item in preview.addonItems" :key="item.name + item.quantity + item.amount" class="calc-line">
          <span>{{ item.name }}{{ item.quantity > 1 ? ' ×' + item.quantity : '' }}</span>
          <span>{{ formatYuanValue(item.amount) }}</span>
        </div>
        <div v-if="preview.usageMultiplier || preview.rushMultiplier" class="calc-line calc-line--dim">
          <span>
            {{ $t('priceCalc.multiplierNote') }}
            <template v-if="preview.usageMultiplier">{{ preview.usageMultiplier.name }} ×{{ preview.usageMultiplier.factor }}</template>
            <template v-if="preview.rushMultiplier">{{ preview.rushMultiplier.name }} ×{{ preview.rushMultiplier.factor }}</template>
          </span>
          <span>{{ formatYuanValue(preview.multiplierTotal) }}</span>
        </div>
        <p class="calc-disclaimer">{{ $t('priceCalc.disclaimer') }}</p>
      </div>
    </template>

    <div v-else class="calc-empty">{{ $t('priceCalc.noStyles') }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistPublicApi, artistApi } from '../../api/index.js'
import { useArtistStore } from '../../stores/artist.js'
import { formatYuanValue } from '../../utils/money.js'

// 数据：画风（含尺寸+增项）+ 倍率
const store = useArtistStore()
const { t } = useI18n()
const styles = ref([])
const pricing = ref(null)
const loading = ref(true)
/** 画风/费率加载失败（独立错误态 + 重试） */
const loadFailed = ref(false)

const selectedStyleId = ref(null)
const selectedSizeId = ref(null)
const addonSel = reactive({})
const usageMultiplierId = ref(null)
const rushMultiplierId = ref(null)
const preview = ref(null)

const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
/** 当前尺寸下可用增项（后端已按尺寸覆盖过滤 hidden） */
const availableAddons = computed(() => selectedSize.value?.addons || [])
const selectedSize = computed(() => selectedStyle.value?.sizes.find(sz => sz.id === selectedSizeId.value) || null)
const usageMultipliers = computed(() => (pricing.value?.multipliers || []).filter(m => m.type === 'usage'))
const rushMultipliers = computed(() => (pricing.value?.multipliers || []).filter(m => m.type === 'rush'))

function selectStyle(id) {
  selectedStyleId.value = id
  selectedSizeId.value = null
  clearAddons()
  preview.value = null
}

function selectSize(id) {
  selectedSizeId.value = id
  clearAddons()
  preview.value = null
  initAddonDefaults()
  scheduleCalc()
}

function clearAddons() {
  for (const key of Object.keys(addonSel)) delete addonSel[key]
}

function initAddonDefaults() {
  for (const a of availableAddons.value) {
    if (!addonSel[a.id]) addonSel[a.id] = { toggled: false, quantity: 0, optionLabel: null }
  }
}

function setAddon(id, patch) {
  if (!addonSel[id]) addonSel[id] = { toggled: false, quantity: 0, optionLabel: null }
  Object.assign(addonSel[id], patch)
  scheduleCalc()
}

/** 构建已选增项（与后端 calculate-style-price 契约一致） */
function buildAddons() {
  const list = []
  for (const a of availableAddons.value) {
    const sel = addonSel[a.id]
    if (!sel) continue
    if (a.control_type === 'switch' && sel.toggled) list.push({ styleAddonId: a.id })
    else if (a.control_type === 'quantity' && sel.quantity > 0) list.push({ styleAddonId: a.id, quantity: sel.quantity })
    else if (a.control_type === 'radio' && sel.optionLabel) list.push({ styleAddonId: a.id, optionLabel: sel.optionLabel })
  }
  return list
}

/** 算价（防抖 300ms + 竞态保护），复用后端 calculate-style-price，前端不复制算价逻辑 */
let calcTimer = null
let calcSeq = 0
function scheduleCalc() {
  if (calcTimer) clearTimeout(calcTimer)
  calcTimer = setTimeout(doCalc, 300)
}

async function doCalc() {
  const mySeq = ++calcSeq
  if (!selectedSizeId.value) { preview.value = null; return }
  try {
    const res = await artistPublicApi.calculateStylePrice({
      subdomain: store.subdomain,
      styleSizeId: selectedSizeId.value,
      addons: buildAddons(),
      usageMultiplierId: usageMultiplierId.value,
      rushMultiplierId: rushMultiplierId.value
    })
    if (mySeq !== calcSeq) return
    preview.value = res
  } catch {
    if (mySeq !== calcSeq) return
    preview.value = null
  }
}

/** radio 选项 JSON 解析（安全回退） */
function parseOptions(optionsJson) {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 增项价格文案：radio 按选项计价，其余显示单价（quantity 带单位） */
function formatAddonPrice(a) {
  if (a.control_type === 'radio') return t('priceCalc.optionPrice')
  return formatYuanValue(a.price ?? 0) + (a.control_type === 'quantity' && a.unit_label ? '/' + a.unit_label : '')
}

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    if (!store.subdomain) await store.fetchProfile()
    if (!store.subdomain) {
      const profile = await artistApi.getProfile()
      store.profile = profile
    }
    const [styleList, pricingData] = await Promise.all([
      artistPublicApi.getPublicStyles(store.subdomain).catch(() => { loadFailed.value = true; return [] }),
      artistPublicApi.getPricing(store.subdomain).catch(() => { loadFailed.value = true; return null })
    ])
    styles.value = styleList || []
    pricing.value = pricingData
    // 单画风自动选中
    if (styles.value.length === 1) {
      selectedStyleId.value = styles.value[0].id
      if (styles.value[0].sizes.length > 0) {
        selectedSizeId.value = styles.value[0].sizes[0].id
        initAddonDefaults()
        scheduleCalc()
      }
    }
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

onUnmounted(() => {
  // R-18: 卸载后 300ms 内 doCalc 仍会白发请求——清理防抖计时器（对齐 useManualOrderPricing.stopStyleCalc）
  if (calcTimer) clearTimeout(calcTimer)
})
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.price-calc-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }
.calc-empty { margin-top: 24px; padding: 24px; text-align: center; color: var(--ink3, #888); background: var(--card, #fff); border: 1px dashed var(--line, #e5e5e5); border-radius: var(--r-m, 8px); }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}

.calc-step { margin-top: 22px; }
.calc-step-label { font-size: 14px; font-weight: 600; color: var(--ink2, #555); margin-bottom: 10px; }

.style-cards, .size-cards { display: flex; flex-wrap: wrap; gap: 10px; }
.style-card, .size-card {
  padding: 10px 16px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--card, #fff);
  color: var(--ink2, #555);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.style-card:hover, .size-card:hover { border-color: var(--hq, var(--el-color-primary)); color: var(--ink); }
.style-card:active, .size-card:active { transform: scale(0.98); }
.style-card--active, .size-card--active {
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 12%, var(--card, #fff));
  border-color: var(--hq, var(--el-color-primary));
  color: var(--hq, var(--el-color-primary));
  font-weight: 600;
}

.size-card { display: flex; flex-direction: column; gap: 2px; min-width: 120px; text-align: left; }
.size-card-name { font-weight: 600; }
.size-card-price { font-size: 13px; }
.size-card-days { font-size: 12px; color: var(--ink3, #888); }

.addon-list { display: flex; flex-direction: column; gap: 10px; }
.addon-item {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 16px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
}
.addon-item-info { display: flex; flex-direction: column; gap: 2px; }
.addon-item-name { font-size: 14px; color: var(--ink); }
.addon-item-price { font-size: 12px; color: var(--ink3, #888); }

.multiplier-section { display: flex; flex-direction: column; gap: 10px; }
.multiplier-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.multiplier-label { font-size: 13px; color: var(--ink2, #555); }

.calc-result {
  margin-top: 24px; padding: 20px 24px;
  background: var(--card, #fff);
  border: 1px solid var(--hq, var(--el-color-primary));
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.calc-result-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--line, #e5e5e5); font-weight: 600; }
.calc-result-total { font-size: 22px; color: var(--hq, var(--el-color-primary)); font-weight: 700; }
.calc-line { display: flex; justify-content: space-between; gap: 12px; padding-top: 8px; font-size: 14px; color: var(--ink2, #555); }
.calc-line--dim { color: var(--ink3, #888); font-size: 13px; }
.calc-disclaimer { margin-top: 12px; font-size: 12px; color: var(--ink3, #888); }
</style>
