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
        <div class="group calc-group">
          <div class="group-head">{{ $t('priceCalc.stepStyle') }}</div>
          <p class="calc-group-hint">{{ $t('priceCalc.stepStyleDesc') }}</p>
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
      </div>

      <!-- 步骤 2：选尺寸 -->
      <div v-if="selectedStyle" class="calc-step">
        <div class="group calc-group">
          <div class="group-head">{{ $t('priceCalc.stepSize') }}</div>
          <p class="calc-group-hint">{{ $t('priceCalc.stepSizeDesc') }}</p>
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
      </div>

      <!-- 步骤 3：增项（选完尺寸后出现） -->
      <div v-if="selectedSizeId && availableAddons.length > 0" class="calc-step">
        <div class="group calc-group">
          <div class="group-head">{{ $t('priceCalc.stepAddons') }}</div>
          <p class="calc-group-hint">{{ $t('priceCalc.stepAddonsDesc') }}</p>
          <div class="addon-list">
            <div v-for="a in availableAddons" :key="a.id" class="addon-item">
              <div class="addon-item-info">
                <span class="addon-item-name">{{ a.name }}</span>
                <span class="addon-item-price">{{ formatAddonPrice(a) }}</span>
              </div>
              <el-switch
                v-if="a.control_type === 'switch'" size="small"
                :aria-label="a.name"
                :model-value="addonSel[a.id]?.toggled || false"
                @change="(val: string | number | boolean) => setAddon(a.id, { toggled: !!val })"
              />
              <el-input-number
                v-else-if="a.control_type === 'quantity'" size="small"
                :model-value="addonSel[a.id]?.quantity || 0" :min="0" :max="99" :step="1"
                style="width: 112px"
                @change="(val: number | undefined) => setAddon(a.id, { quantity: val ?? 0 })"
              />
              <!-- radio/options 与上方 multiplier 同批退役（SPEC-PRICE-2）：契约只认 styleAddonId/quantity，附选项字段必被 400 -->
            </div>
          </div>
        </div>
      </div>

      <!-- t1 猎杀修复：倍率（用途/加急）已随 SPEC-PRICE-2 退役为画风增项（v50 迁移 DROP price_multipliers），
           旧 multiplier UI 与请求字段移除，避免每次算价必 400（schema additionalProperties:false 拒收退役字段） -->

      <!-- 估算结果 -->
      <div v-if="preview" class="group calc-group calc-result">
        <div class="calc-result-head">
          <span class="calc-result-title">{{ preview.styleName }} · {{ preview.sizeName }}</span>
          <span class="calc-result-total">{{ formatYuanTrimmed(preview.totalCents) }}</span>
        </div>
        <div class="calc-line"><span>{{ $t('priceCalc.basePrice') }}</span><span>{{ formatYuanTrimmed(preview.baseCents) }}</span></div>
        <div v-for="item in addonLines" :key="item.key" class="calc-line">
          <span>
            {{ item.name }}<template v-if="item.qty > 1"> ×{{ item.qty }}</template>
            <span v-if="item.pct != null" class="calc-addon-pct">+{{ item.pct }}%</span>
          </span>
          <span>{{ formatYuanTrimmed(item.amountCents) }}</span>
        </div>
        <div v-if="preview.usage || preview.rush" class="calc-line calc-line--dim">
          <span>
            {{ $t('priceCalc.multiplierNote') }}
            <template v-if="preview.usage">{{ preview.usage.name }} +{{ preview.usage.percent }}%</template>
            <template v-if="preview.rush">{{ preview.rush.name }} +{{ preview.rush.percent }}%</template>
          </span>
          <span>{{ formatYuanTrimmed(multiplierCents) }}</span>
        </div>
        <p class="calc-disclaimer">{{ $t('priceCalc.disclaimer') }}</p>
      </div>
    </template>

    <div v-else class="calc-empty">{{ $t('priceCalc.noStyles') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import type { PublicArtStyle, PublicPricingResult, PublicStyleAddon, StyleAddonSelection, StylePriceResult } from '../../api/types'
import { useI18n } from 'vue-i18n'
import { artistPublicApi, artistApi } from '../../api/index'
import { useArtistStore } from '../../stores/artist'
import { ElMessage } from 'element-plus'
import { formatYuanTrimmed, formatYuanValue } from '../../utils/money'

// 数据：画风（含尺寸+增项）+ 倍率
const store = useArtistStore()
const { t } = useI18n()

/** 增项选择态（每个增项一条，按 id 索引） */
interface AddonSelState {
  toggled: boolean
  quantity: number
}

/** 算价结果统一消费 API DTO（此前自行声明了一份字段名全错的本地形状，金额恒渲染 ¥0） */
interface AddonLineView {
  key: string
  name: string
  qty: number
  pct?: number
  amountCents: number
}

const styles = ref<PublicArtStyle[]>([])
const pricing = ref<PublicPricingResult | null>(null)
const loading = ref(true)
/** 画风/费率加载失败（独立错误态 + 重试） */
const loadFailed = ref(false)

const selectedStyleId = ref<number | null>(null)
const selectedSizeId = ref<number | null>(null)
const addonSel = reactive<Record<string, AddonSelState>>({})
const preview = ref<StylePriceResult | null>(null)
/** 增项明细行（固定价 + 百分比价统一展平；key 仅用于 v-for） */
const addonLines = computed<AddonLineView[]>(() => {
  const p = preview.value
  if (!p) return []
  return [
    ...(p.fixedAddonItems ?? []).map(i => ({
      key: `f-${i.name}-${i.quantity}-${i.amountCents}`, name: i.name, qty: i.quantity, amountCents: i.amountCents
    })),
    ...(p.percentAddonItems ?? []).map(i => ({
      key: `p-${i.name}-${i.quantity}-${i.amountCents}`, name: i.name, qty: i.quantity, pct: i.percent, amountCents: i.amountCents
    }))
  ]
})
/** 倍率加价合计（用途 + 加急；DTO 已给增量分） */
const multiplierCents = computed(() =>
  (preview.value?.usage?.incrementCents ?? 0) + (preview.value?.rush?.incrementCents ?? 0)
)

const selectedStyle = computed(() => styles.value.find(s => s.id === selectedStyleId.value) || null)
/** 当前尺寸下可用增项（后端已按尺寸覆盖过滤 hidden） */
const availableAddons = computed(() => selectedSize.value?.addons || [])
const selectedSize = computed(() => selectedStyle.value?.sizes.find(sz => sz.id === selectedSizeId.value) || null)

function selectStyle(id: number) {
  selectedStyleId.value = id
  selectedSizeId.value = null
  clearAddons()
  preview.value = null
}

function selectSize(id: number) {
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
    if (!addonSel[a.id]) addonSel[a.id] = { toggled: false, quantity: 0 }
  }
}

function setAddon(id: number, patch: Partial<AddonSelState>) {
  if (!addonSel[id]) addonSel[id] = { toggled: false, quantity: 0 }
  Object.assign(addonSel[id], patch)
  scheduleCalc()
}

/** 构建已选增项（与后端 calculate-style-price 契约一致） */
function buildAddons(): StyleAddonSelection[] {
  const list: StyleAddonSelection[] = []
  for (const a of availableAddons.value) {
    const sel = addonSel[a.id]
    if (!sel) continue
    if (a.control_type === 'switch' && sel.toggled) list.push({ styleAddonId: a.id })
    else if (a.control_type === 'quantity' && sel.quantity > 0) list.push({ styleAddonId: a.id, quantity: sel.quantity })
  }
  return list
}

/** 算价（防抖 300ms + 竞态保护），复用后端 calculate-style-price，前端不复制算价逻辑 */
let calcTimer: ReturnType<typeof setTimeout> | null = null
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
      addons: buildAddons()
    })
    if (mySeq !== calcSeq) return
    preview.value = res
  } catch {
    if (mySeq !== calcSeq) return
    // 请求失败：保留上次结果并明示错误，禁止静默清空预览
    ElMessage.error(t('priceCalc.calcFailed'))
  }
}

/** 增项价格文案（quantity 带单位） */
function formatAddonPrice(a: PublicStyleAddon) {
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
  calcSeq++ // a1: 已在途的 doCalc 响应随卸载作废，不再写 preview
})
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 860px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.price-calc-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }
.calc-empty { margin-top: 16px; padding: 24px; text-align: center; color: var(--ink3); background: var(--card); border: 1px dashed var(--line); border-radius: var(--r-m); }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}

/* 818-B 三原则：分组卡片收纳，组头带朱砂小印点（对齐原型 .group-head） */
.calc-step { margin-top: 16px; }
.group {
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.calc-group-hint { margin: 0 0 12px; font-size: 12px; color: var(--ink3); }

.style-cards, .size-cards { display: flex; flex-wrap: wrap; gap: 12px; }
.style-card, .size-card {
  padding: 12px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink2);
  font-size: 14px;
  cursor: pointer;
  /* 818-B 克制动效：过渡只动颜色/边框，按压不位移 */
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-slow);
}
.style-card:hover, .size-card:hover { border-color: var(--hq); color: var(--ink); }
.style-card--active, .size-card--active {
  background: color-mix(in srgb, var(--hq) 12%, var(--card));
  border-color: var(--hq);
  color: var(--hq);
  font-weight: 600;
}

.size-card { display: flex; flex-direction: column; gap: 4px; min-width: 120px; text-align: left; }
.size-card-name { font-weight: 600; }
.size-card-price { font-size: 13px; }
.size-card-days { font-size: 12px; color: var(--ink3); }

.addon-list { display: flex; flex-direction: column; gap: 12px; }
.addon-item {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
}
.addon-item-info { display: flex; flex-direction: column; gap: 4px; }
.addon-item-name { font-size: 14px; color: var(--ink); }
.addon-item-price { font-size: 12px; color: var(--ink3); }

.calc-result {
  margin-top: 16px;
  border: 1px solid var(--hq);
}
.calc-result-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-weight: 600;
}
.calc-result-title { display: flex; align-items: center; gap: 8px; }
.calc-result-title::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.calc-result-total { font-size: 22px; color: var(--hq); font-weight: 700; font-variant-numeric: tabular-nums; }
.calc-line { display: flex; justify-content: space-between; gap: 12px; padding-top: 8px; font-size: 14px; color: var(--ink2); font-variant-numeric: tabular-nums; }
.calc-line--dim { color: var(--ink3); font-size: 13px; }
.calc-addon-pct { margin-left: 4px; font-size: 11px; color: var(--ink4); }
.calc-disclaimer { margin-top: 12px; font-size: 12px; color: var(--ink3); }
</style>
