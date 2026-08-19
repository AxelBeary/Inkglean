<template>
  <div class="order-form-page">
    <ClientFloatingActions raised />
    <div class="form-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('orderForm.backHome')" :content="$t('orderForm.title')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('orderForm.backHome') }}</span></template>
      </el-page-header>

      <!-- P0 修复（前端质量战役 B 路审计）：画师信息加载失败明示错误态+重试，不再留破页 -->
      <div v-if="loadError && !loading" class="load-error-banner">
        <p>{{ $t('orderForm.loadFailed') }}</p>
        <el-button type="primary" size="small" @click="retryLoad">{{ $t('common.loadRetry') }}</el-button>
      </div>

      <template v-if="artist">
        <!-- R58-2: 步骤指示器 + v0.35 F4 预选摘要横幅（拆分子组件） -->
        <StepIndicator
          :step-defs="stepDefs"
          :step="step"
          :banner-text="preselectBannerText"
          @edit-preselect="onEditPreselect"
        />

        <div class="step-layout">
          <el-card class="step-main">
            <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large" :class="stepFadeClass">
              <!-- P0-2: 当前步眉题（第 X / Y 步） -->
              <p class="step-eyebrow">{{ $t('orderForm.stepProgress', { cur: step, total: stepDefs.length }) }}</p>

              <!-- ── 无计价配置空态（画师未设画风） ── -->
              <div v-if="!loading && !isStyleMode" v-show="step === 1">
                <el-empty :description="$t('orderForm.noStylesHint')" :image-size="60" />
                <div class="step-nav step-nav--end">
                  <el-button @click="$router.push(`/artist/${subdomain}`)">{{ $t('orderForm.backHome') }}</el-button>
                </div>
              </div>

              <!-- ── 选画风（多画风步骤 1，单画风跳过） ── -->
              <StylePickStep
                v-if="isStyleMode && isMultiStyle" v-show="step === 1"
                :styles="styles"
                :selected-style-id="selectedStyleId"
                @select="selectStyle"
                @next="step = sizeStep"
              />

              <!-- ── v0.32: 选尺寸（画风模式步骤 2 / 单画风步骤 1） ── -->
              <SizePickStep
                v-if="isStyleMode" v-show="step === sizeStep"
                :sizes="selectedStyle?.sizes || []"
                :selected-size-id="selectedSizeId"
                :is-multi-style="isMultiStyle"
                @select="selectSize"
                @prev="step = 1"
                @next="step = addonStep"
                @skip="step = addonStep"
              />

              <!-- ── SPEC-PRICE-2: 选增项（普通多选 + 用途单选 + 加急单选）+ 实时价格明细 ── -->
              <AddonStep
                v-if="isStyleMode" v-show="step === addonStep"
                :regular-addons="regularAddons"
                :usage-addons="usageAddons"
                :rush-addons="rushAddons"
                :has-addons="availableStyleAddons.length > 0"
                :addon-selections="styleAddonSelections"
                :selected-usage-id="selectedUsageId"
                :selected-rush-id="selectedRushId"
                :price-text="styleAddonPriceText"
                :preview="stylePricePreview"
                :style-calc-error="styleCalcError"
                :installments="installmentPreview"
                :discount-enabled="discountEnabled"
                :discount-validating="discountValidating"
                :discount-result="discountResult"
                :discount-error="discountError"
                v-model:discount-code="form.discountCode"
                @addon-toggle="onAddonToggle"
                @addon-quantity="onAddonQuantity"
                @toggle-usage="toggleUsage"
                @toggle-rush="toggleRush"
                @validate-discount="validateDiscountCode"
                @prev="step = sizeStep"
                @next="step = detailStep"
              />

              <!-- ── 写需求 + 上传（v0.32: 动态步骤号） ── -->
              <DetailStep
                v-show="step === detailStep"
                v-model:description="form.description"
                :inspire-tags="inspireTags"
                :workflow-stages="workflowStages"
                :revision-note="artist?.revisionNote || ''"
                :ref-file-list="refFileList"
                :upload-request="handleRefUpload"
                :upload-remove="handleRefRemove"
                @prev="step = isStyleMode ? addonStep : 1"
                @next="goNextFromDetail"
              />

              <!-- ── 联系方式（v0.32: 动态步骤号） ── -->
              <ContactStep
                v-show="step === contactStep"
                v-model:client-qq="form.clientQq"
                v-model:client-name="form.clientName"
                v-model:notify-enabled="form.notifyEnabled"
                v-model:agreed="form.agreed"
                v-model:terms-agreed="form.termsAgreed"
                :notify-visible="!!artist?.notifyEnabled"
                :has-rules="!!rulesContent"
                :sanitized-rules="sanitizedRules"
                :submit-price-text="submitPriceText"
                @prev="step = detailStep"
                @submit="openReceipt"
              />
            </el-form>
          </el-card>

          <!-- R58-2: 粘性摘要卡（宽屏右侧 / 移动端底部） -->
          <OrderSummaryCard
            :client-name="form.clientName"
            :description="form.description"
            :is-style-mode="isStyleMode"
            :selected-style="selectedStyle"
            :selected-size="selectedSize"
            :preview="stylePricePreview"
            :installments="installmentPreview"
            :display-price="styleDisplayPrice"
          />
        </div>

        <!-- P0-1: 移动端底部粘性操作条（桌面隐藏；与原按钮并存） -->
        <!-- a2 猎杀修复：无画风配置（!isStyleMode）时只渲染「返回主页」空态，
             移动端 CTA 若仍显示会陷入「下一步→selectSizeFirst 警告」死循环，故一并隐藏 -->
        <div class="mobile-cta-bar" v-if="artist && isStyleMode">
          <div class="mobile-cta-price">
            <span class="mobile-cta-label">{{ $t('orderForm.receiptTotal') }}</span>
            <span class="mobile-cta-amt">{{ formatYuanValue(styleDisplayPrice) }}</span>
          </div>
          <el-button type="primary" class="mobile-cta-btn" @click="onMobileNext">
            {{ step === contactStep ? $t('orderForm.submit') : $t('orderForm.nextStep') }}
          </el-button>
        </div>
      </template>
    </div>

    <!-- R58-3: 小票风格二次确认弹窗（锯齿边 CSS，样式在 templates.css 全局定义） -->
    <el-dialog
      v-model="receiptVisible" width="340px"
      :show-close="false" :close-on-click-modal="false"
      class="receipt-dialog" align-center
    >
      <div class="receipt">
        <div class="receipt-head">{{ artist?.name }}</div>
        <div class="receipt-sub">{{ $t('orderForm.receiptSub') }}</div>
        <div class="receipt-dashed"></div>
        <!-- SPEC-PRICE-2 小票：画风/尺寸 + 增项/用途/加急明细 -->
        <div class="receipt-row">
          <span>{{ $t('orderForm.styleStep') }}</span>
          <span>{{ selectedStyle?.name }}</span>
        </div>
        <div class="receipt-row">
          <span>{{ $t('orderForm.sizeStep') }}</span>
          <span>{{ selectedSize?.name }}</span>
        </div>
        <template v-if="stylePricePreview">
          <div v-for="(item, idx) in stylePricePreview.fixedAddonItems" :key="'f' + idx" class="receipt-row">
            <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
            <span>+{{ formatYuan(item.amountCents) }}</span>
          </div>
          <div v-for="(item, idx) in stylePricePreview.percentAddonItems" :key="'p' + idx" class="receipt-row">
            <span>{{ item.name }} +{{ item.percent }}%</span>
            <span>+{{ formatYuan(item.amountCents) }}</span>
          </div>
          <div v-if="stylePricePreview.usage" class="receipt-row">
            <span>{{ stylePricePreview.usage.name }} +{{ stylePricePreview.usage.percent }}%</span>
            <span>+{{ formatYuan(stylePricePreview.usage.incrementCents) }}</span>
          </div>
          <div v-if="stylePricePreview.rush" class="receipt-row">
            <span>{{ stylePricePreview.rush.name }} +{{ stylePricePreview.rush.percent }}%</span>
            <span>+{{ formatYuan(stylePricePreview.rush.incrementCents) }}</span>
          </div>
          <div v-if="stylePricePreview.discount" class="receipt-row">
            <span>{{ $t('orderForm.discountEstimate') }}（{{ stylePricePreview.discount.code }}）</span>
            <span>-{{ formatYuan(stylePricePreview.discount.amountCents) }}</span>
          </div>
        </template>
        <div class="receipt-dashed"></div>
        <div class="receipt-total">
          <span>{{ $t('orderForm.receiptTotal') }}</span>
          <span>{{ formatYuanValue(styleDisplayPrice) }}</span>
        </div>
        <div v-if="installmentPreview.length > 1" class="receipt-installments">
          <span v-for="inst in installmentPreview" :key="inst.label" class="receipt-inst">
            {{ inst.label }} {{ formatYuan(inst.amountCents) }}
          </span>
        </div>
        <div class="receipt-barcode" aria-hidden="true"></div>
        <div class="receipt-actions">
          <button type="button" class="receipt-btn" @click="receiptVisible = false">{{ $t('common.cancel') }}</button>
          <button type="button" class="receipt-btn receipt-btn--primary" :disabled="submitting" @click="confirmSubmit">
            {{ submitting ? $t('orderForm.submitting') : $t('orderForm.receiptConfirm') }}
          </button>
        </div>
      </div>
    </el-dialog>

    <!-- 成功弹窗 -->
    <el-dialog v-model="showSuccess" :title="$t('orderForm.successTitle')" width="380px" :close-on-click-modal="false">
      <el-result icon="success" :title="$t('orderForm.orderNoIs') + resultNo">
        <template #sub-title>{{ $t('orderForm.addQqHint') }}</template>
        <template #extra>
          <!-- F1 围剿：追踪链接一次展示（全文 + 复制 + 二维码），提示客户保存 -->
          <div v-if="fullTrackUrl" class="success-track">
            <p class="success-track-hint">{{ $t('orderForm.saveTrackHint') }}</p>
            <div class="success-track-link">
              <code>{{ fullTrackUrl }}</code>
              <el-button size="small" @click="copyTrackLink">{{ $t('orderForm.copyTrackLink') }}</el-button>
            </div>
            <img
              v-if="trackQrDataUrl"
              :src="trackQrDataUrl"
              class="success-track-qr"
              :alt="$t('orderForm.trackQrAlt')"
              :aria-label="$t('orderForm.trackQrAlt')"
              width="160" height="160"
            />
          </div>
          <!-- R58-6: 画师 QQ 跳转 + 复制 -->
          <div v-if="artist?.contactQq" class="success-qq">
            <span class="success-qq-label">{{ $t('orderForm.artistQqLabel') }}</span>
            <code class="success-qq-no">{{ artist.contactQq }}</code>
            <div class="success-qq-actions">
              <el-button type="primary" @click="jumpToQq(artist.contactQq)">{{ $t('orderForm.jumpQq') }}</el-button>
              <el-button @click="copyQq(artist.contactQq)">{{ $t('orderForm.copyQq') }}</el-button>
            </div>
          </div>
          <div class="success-actions">
            <!-- R58-5: 复制约稿信息 -->
            <el-button @click="copyOrderSummary">{{ $t('orderForm.copySummary') }}</el-button>
            <el-button type="primary" @click="goTrack">
              {{ $t('orderForm.viewProgress') }}
            </el-button>
          </div>
        </template>
      </el-result>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, h } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import type { VisibleArtistProfile, PublicStyleAddon } from '../../api/types.js'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'
import StepIndicator from './order-form/StepIndicator.vue'
import StylePickStep from './order-form/StylePickStep.vue'
import SizePickStep from './order-form/SizePickStep.vue'
import AddonStep from './order-form/AddonStep.vue'
import DetailStep from './order-form/DetailStep.vue'
import ContactStep from './order-form/ContactStep.vue'
import OrderSummaryCard from './order-form/OrderSummaryCard.vue'
import { useOrderForm } from '../../composables/useOrderForm.js'
import type { StyleAddon } from './order-form/types.js'
import { usePalette } from '../../composables/usePalette.js'
import { formatYuan, formatYuanValue } from '../../utils/money.js'
import { trackEvent, flushNow } from '../../utils/track.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const subdomain = route.params.subdomain as string

/** el-form ref 最小形状（提交时 validate + 校验失败滚动定位字段） */
interface FormRefLike {
  validate: () => Promise<unknown>
  scrollToField: (field: string) => void
}
const formRef = ref<FormRefLike | null>(null)

// R58-1: 表单业务逻辑全部由共享 composable 提供，页面只保留布局与样式
const {
  artist: artistRaw, rulesContent, loading, loadError, retryLoad, workflowStages,
  form, rules,
  submitting, showSuccess, resultNo, trackUrl, submit,
  refFileList, handleRefUpload: rawHandleRefUpload, handleRefRemove,
  sanitizedRules,
  // 折扣码
  discountEnabled, discountResult, discountError, discountValidating,
  validateDiscountCode,
  // SPEC-PRICE-2: 画风/尺寸/增项（含用途/加急单选）
  styles, isStyleMode, isMultiStyle,
  selectedStyleId, selectedStyle, selectedSizeId, selectedSize,
  availableStyleAddons, regularAddons, usageAddons, rushAddons,
  styleAddonSelections, selectedUsageId, selectedRushId,
  selectStyle, selectSize, toggleUsage, toggleRush, styleAddonPriceText: rawStyleAddonPriceText,
  stylePricePreview, styleCalcError, styleDisplayPrice, installmentPreview,
  // v0.34 任务B：URL query 预选命中记录
  queryPreselect,
  // v0.35 F4: 预选摘要横幅文案（入口 A 预选可见，可回上一步改）
  preselectBannerText
} = useOrderForm(subdomain, formRef as unknown as Parameters<typeof useOrderForm>[1], route.query)

// 模板读取的 artist 字段（revisionNote/notifyEnabled/contactQq/paletteId/inspirationTags）均属完整公开形状；
// hidden 最小形状（HiddenArtistProfile）不会进入本页渲染链路，此处联合类型收敛为完整形状
const artist = computed(() => artistRaw.value as VisibleArtistProfile | null)

// AddonStep 的 priceText prop 参数为本地宽松形状 StyleAddon，useOrderForm 实现按 PublicStyleAddon 口径——
// 运行时是同一批对象（断言成立），包一层适配参数逆变
const styleAddonPriceText = (addon: StyleAddon) => rawStyleAddonPriceText(addon as PublicStyleAddon)
// DetailStep 的 uploadRequest prop 参数为 { file: File }，el-upload 实际调用时 file 总带 uid（断言成立）
const handleRefUpload = (options: { file: File }) => rawHandleRefUpload(options as { file: File & { uid: string | number } })

// M2: 流程页跟随画师 palette 配色（画师数据加载后生效，卸载时自动清理）
const paletteId = computed(() => artist.value?.paletteId || 'paper')
usePalette(paletteId)

// ─── 拆分批：普通增项开关/个数变更（子组件 emit 上报，语义与原内联 handler 一致） ───
function onAddonToggle(id: number, toggled: boolean) {
  if (!styleAddonSelections[id]) styleAddonSelections[id] = { toggled: false, quantity: 0 }
  styleAddonSelections[id].toggled = toggled
}
function onAddonQuantity(id: number, quantity: number) {
  if (!styleAddonSelections[id]) styleAddonSelections[id] = { toggled: false, quantity: 0 }
  styleAddonSelections[id].quantity = quantity
}

// ─── v0.35 F4: 预选横幅「修改」——多画风回选画风步；单画风回选尺寸步 ───
function onEditPreselect() {
  step.value = isMultiStyle.value ? 1 : sizeStep.value
}

// ─── D 软提示（用户拍板：需求描述可空过，仅留空时弹一次确认，不拦截） ───
function goNextFromDetail() {
  if (!form.description.trim()) {
    ElMessageBox.confirm(
      t('orderForm.descSoftMsg'),
      t('orderForm.descSoftTitle'),
      {
        confirmButtonText: t('orderForm.descSoftContinue'),
        cancelButtonText: t('common.cancel'),
        type: 'info'
      }
    )
      .then(() => { step.value = contactStep.value })
      .catch(() => { /* 用户取消：留在本步 */ })
    return
  }
  step.value = contactStep.value
}

// ─── P0-1: 移动端底部操作条跳转（复用既有流转逻辑，不重复造） ───
function onMobileNext() {
  if (step.value === contactStep.value) return openReceipt()
  if (step.value === detailStep.value) return goNextFromDetail()
  // 步骤 1 校验：多画风选画风 / 单画风选尺寸——与卡内「下一步」disabled 逻辑一致
  if (step.value === 1) {
    if (isMultiStyle.value) {
      // 多画风：step1 = 选画风 → 校验后进 sizeStep
      if (!selectedStyle.value) { ElMessage.warning(t('orderForm.selectSizeFirst')); return }
      step.value = sizeStep.value; return
    }
    // 单画风：step1 = 选尺寸 → 校验后进 addonStep
    if (!selectedSize.value) { ElMessage.warning(t('orderForm.selectSizeFirst')); return }
    step.value = addonStep.value; return
  }
  if (step.value === sizeStep.value) {
    // a2 猎杀修复：移动端底部 CTA 此前无 selectedSize 校验直跳增项步（卡内按钮有 :disabled 但 CTA 绕过），
    // 可一路提交 styleSizeId=null 致后端拒单/异常订单；补校验对齐卡内按钮语义
    if (!selectedSize.value) { ElMessage.warning(t('orderForm.selectSizeFirst')); return }
    step.value = addonStep.value; return
  }
  if (step.value === addonStep.value) { step.value = detailStep.value }
}

// ─── R58-2: 分步引导（v0.32: 动态步骤号） ───
const step = ref(1)
const receiptVisible = ref(false)

/**
 * 动态步骤定义（SPEC-PRICE-2：画风模型唯一）：
 * 单画风：选尺寸(1) → 选增项(2) → 写需求(3) → 联系方式(4)
 * 多画风：选画风(1) → 选尺寸(2) → 选增项(3) → 写需求(4) → 联系方式(5)
 */
const stepDefs = computed(() => {
  const defs = []
  if (isMultiStyle.value) defs.push({ key: 'style', label: t('orderForm.styleStep') })
  defs.push({ key: 'size', label: t('orderForm.sizeStep') })
  defs.push({ key: 'addon', label: t('orderForm.addonStep') })
  defs.push({ key: 'detail', label: t('orderForm.step2') })
  defs.push({ key: 'contact', label: t('orderForm.step3') })
  return defs
})

/** 各步骤的动态编号 */
const sizeStep = computed(() => stepDefs.value.findIndex(s => s.key === 'size') + 1)
const addonStep = computed(() => stepDefs.value.findIndex(s => s.key === 'addon') + 1)
const detailStep = computed(() => stepDefs.value.findIndex(s => s.key === 'detail') + 1)
const contactStep = computed(() => stepDefs.value.findIndex(s => s.key === 'contact') + 1)

// ─── 埋点：下单漏斗（REQ-033 §3.5 / 施工图《01-to-02-埋点前端批》§3.2） ───
// 事件名严格用后端白名单；埋点失败静默，绝不打断用户、不影响业务
const trackingStartTs = Date.now()
let trackingLastStep: number | null = null

function trackingPricingModel() {
  return 'style'
}
function trackingStepKey(stepNo: number): string | null {
  return stepDefs.value[stepNo - 1]?.key || null
}
function trackingEmitStep(stepNo: number, prevStepNo: number | null) {
  const pricing_model = trackingPricingModel()
  const total_steps = stepDefs.value.length
  const stepKey = trackingStepKey(stepNo)
  if (prevStepNo != null && prevStepNo !== stepNo) {
    const leaveKey = trackingStepKey(prevStepNo)
    if (leaveKey) trackEvent('order_form_step_leave', { step_key: leaveKey, step_index: prevStepNo, total_steps, pricing_model })
  }
  if (stepKey) trackEvent('order_form_step_view', { step_key: stepKey, step_index: stepNo, total_steps, pricing_model })
  if (prevStepNo != null && stepNo < prevStepNo) {
    trackEvent('order_form_step_back', { from_step: prevStepNo, to_step: stepNo, pricing_model })
  }
  trackingLastStep = stepNo
}
// artist 数据加载完成 → 漏斗起点：start + 初始步骤 view（含入口 A 预选跳步场景）
watch(loading, (v) => {
  if (v) return
  trackEvent('order_form_start', { pricing_model: trackingPricingModel(), total_steps: stepDefs.value.length })
  trackingEmitStep(step.value, null)
}, { once: true })
// 战役波 M 修正：步骤切换淡入——v-show 面板包 Transition 不触发且破测试，改 class 重触发（动画只走 opacity，克制）
const stepFadeClass = ref('')
// 步骤变化统一收口（覆盖模板各处 @click="step = N" 与预选横幅跳步）
watch(step, (v, old) => {
  stepFadeClass.value = ''
  requestAnimationFrame(() => { stepFadeClass.value = 'step-fade-run' })
  if (trackingLastStep == null) trackingLastStep = old ?? null
  if (v === trackingLastStep) return
  trackingEmitStep(v, trackingLastStep)
})
// 提交成功（showSuccess 变 true）：漏斗成功 + 转化基线双事件（REQ-033 §3.2 拍板 A 沿用第三方原名）
watch(showSuccess, (v) => {
  if (!v) return
  const payload = {
    pricing_model: trackingPricingModel(),
    total_steps: stepDefs.value.length,
    elapsed_ms: Math.max(0, Date.now() - trackingStartTs)
  }
  trackEvent('order_form_submit_success', payload)
  trackEvent('order_submit_success', payload)
  // F1 围剿：成功态生成追踪链接二维码（绝对 URL，供扫码直达）
  if (fullTrackUrl.value) {
    QRCode.toDataURL(fullTrackUrl.value, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => { trackQrDataUrl.value = dataUrl })
      .catch(() => { trackQrDataUrl.value = '' })
  }
})
function trackingEmitAbandon() {
  if (showSuccess.value || trackingLastStep == null) return
  trackEvent('order_form_abandon', {
    last_step: trackingLastStep,
    dwell_ms: Math.max(0, Date.now() - trackingStartTs)
  })
}
// SPA 路由离开（未提交）：入队 + 立即发送；关标签页/刷新：入队后由 track.js pagehide sendBeacon 带走
onBeforeRouteLeave(() => {
  if (showSuccess.value) return
  trackingEmitAbandon()
  flushNow()
})
window.addEventListener('beforeunload', trackingEmitAbandon)
onUnmounted(() => window.removeEventListener('beforeunload', trackingEmitAbandon))

// v0.34 任务B：主页带 query 预选进来时，初始步骤跳过已预选部分
// （画风+尺寸都选中 → 直接进增项步骤；仅画风选中 → 进选尺寸步骤）
watch(loading, (v) => {
  if (v) return
  if (!isStyleMode.value) return
  if (queryPreselect.sizeId) {
    step.value = addonStep.value
  } else if (queryPreselect.styleId && isMultiStyle.value) {
    step.value = sizeStep.value
  }
}, { once: true })

/** 联系方式步提交按钮价格后缀（已选画风+尺寸时显示，否则不拼） */
const submitPriceText = computed(() =>
  (isStyleMode.value && selectedSize.value) ? formatYuanValue(styleDisplayPrice.value) : null
)

// ─── R58-4: 灵感标签快捷注入（R58-8: 从 API 读取画师自定义标签，未设置时不显示，不 fallback 硬编码） ───
const inspireTags = computed(() => artist.value?.inspirationTags || [])

// ─── R58-3: 小票二次确认（校验通过才弹小票，确认后走 composable 提交流程） ───
// R24: 校验失败时弹窗列出所有未通过项，关闭后滚动到第一个未通过字段
async function openReceipt() {
  trackEvent('order_form_submit_attempt', { pricing_model: trackingPricingModel(), total_steps: stepDefs.value.length })
  try {
    await formRef.value!.validate()
  } catch (invalidFields) {
    if (invalidFields && typeof invalidFields === 'object') {
      const items = Object.values(invalidFields)
        .flat()
        .map(err => err.message)
        .filter(Boolean)
      if (items.length) {
        // c1 猎杀修复：校验消息全部来自 i18n 翻译文案（无用户输入），但仍去掉
        // dangerouslyUseHTMLString 危险模式——改 VNode 逐条渲染（视觉与旧 HTML 段落一致，零注入面）
        const message = h('div', items.map(msg => h('p', { style: 'margin:4px 0' }, `• ${msg}`)))
        await ElMessageBox.alert(message, t('order.validation.title'), {
          confirmButtonText: t('order.validation.confirm'),
        }).catch(() => {})
      }
      // 弹窗关闭后滚动到第一个未通过字段
      const firstField = Object.keys(invalidFields)[0]
      if (firstField) formRef.value!.scrollToField(firstField)
    }
    trackEvent('order_form_submit_fail', { reason: 'validation', pricing_model: trackingPricingModel(), total_steps: stepDefs.value.length })
    return
  }
  receiptVisible.value = true
}
async function confirmSubmit() {
  await submit()
  if (showSuccess.value) receiptVisible.value = false
  else trackEvent('order_form_submit_fail', { reason: 'submit', pricing_model: trackingPricingModel(), total_steps: stepDefs.value.length })
}

// ─── R58-5: 复制约稿信息（订单号 + 画风/尺寸 + 明细 + 总价） ───
async function copyOrderSummary() {
  const lines = [
    `${t('orderForm.summaryOrderNo')}${resultNo.value}`,
    `${t('orderForm.styleStep')}: ${selectedStyle.value?.name || ''}${selectedSize.value?.name ? ` · ${selectedSize.value.name}` : ''}`
  ]
  const p = stylePricePreview.value
  if (p) {
    lines.push(...p.fixedAddonItems.map(it => `- ${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}: +${formatYuan(it.amountCents)}`))
    lines.push(...p.percentAddonItems.map(it => `- ${it.name} +${it.percent}%: +${formatYuan(it.amountCents)}`))
    if (p.usage) lines.push(`- ${p.usage.name} +${p.usage.percent}%: +${formatYuan(p.usage.incrementCents)}`)
    if (p.rush) lines.push(`- ${p.rush.name} +${p.rush.percent}%: +${formatYuan(p.rush.incrementCents)}`)
    if (p.discount) lines.push(`- ${t('orderForm.discountEstimate')}: -${formatYuan(p.discount.amountCents)}`)
  }
  lines.push(`${t('orderForm.receiptTotal')}: ${formatYuanValue(styleDisplayPrice.value)}`)
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('orderForm.summaryCopied'))
  } catch {
    ElMessage.warning(t('common.copyFailed')) // 波 M：统一 i18n 文案，不再泄漏原始内容
  }
}

// ─── R58-6: QQ 跳转 + 复制（提交成功后联系画师） ───
function jumpToQq(qq: string | null) {
  // a2 猎杀修复：协议唤起改新窗口——无 QQ 客户端/协议处理器时原页保留不被劫持（此前 _self 会把当前页带走成死页），复制按钮兜底
  window.open(`tencent://message/?uin=${encodeURIComponent(String(qq))}`, '_blank', 'noopener')
  ElMessage.info(t('orderForm.qqJumpHint'))
}
async function copyQq(qq: string | null) {
  try {
    await navigator.clipboard.writeText(String(qq))
    ElMessage.success(t('orderForm.qqCopied'))
  } catch {
    ElMessage.warning(t('common.copyFailed')) // 波 M：统一 i18n 文案
  }
}

// ─── F1 围剿：追踪链接（全文 + 复制 + 二维码 + 直达） ───
const fullTrackUrl = computed(() =>
  trackUrl.value ? new URL(trackUrl.value, window.location.origin).href : ''
)
const trackQrDataUrl = ref('')

async function copyTrackLink() {
  try {
    await navigator.clipboard.writeText(fullTrackUrl.value)
    ElMessage.success(t('orderForm.trackLinkCopied'))
  } catch {
    ElMessage.warning(t('common.copyFailed'))
  }
}

function goTrack() {
  if (trackUrl.value) {
    router.push(trackUrl.value)
  } else {
    router.push(`/artist/${subdomain}/track?no=${resultNo.value}`)
  }
}
</script>

<style scoped>
.order-form-page {
  min-height: 100vh;
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
  position: relative;
}
/* R58-2: 加宽容器容纳 主区 + 摘要卡 双栏 */
.form-container { max-width: 920px; margin: 0 auto; }

/* ─── R58-2: 双栏布局（主区 + 粘性摘要卡） ─── */
.step-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}
.step-eyebrow {
  font-size: 11px; letter-spacing: .14em;
  color: var(--text-secondary, #888); margin-bottom: 8px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
.step-nav--end { justify-content: flex-end; }
/* 波 M：步骤切换淡入淡出（--dur-mid，禁位移，保持 v-show 现状） */

/* ─── R58-2: 移动端——单栏 ─── */
@media (max-width: 860px) {
  .step-layout { grid-template-columns: 1fr; }
}

/* ─── P0-1: 移动端底部粘性操作条（sticky 底部；与原“下一步/提交”按钮并存） ─── */
.mobile-cta-bar { display: none; }
@media (max-width: 860px) {
  .mobile-cta-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    position: sticky; bottom: 0; z-index: 100;
    margin: 0 -16px -16px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg-card, #fff) 92%, transparent);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--border-color, #e5e5e5);
  }
  .mobile-cta-amt { font-size: 20px; font-weight: 700; color: var(--color-primary, var(--el-color-primary)); font-variant-numeric: tabular-nums; }
  .mobile-cta-btn { min-width: 128px; min-height: 44px; }
}
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

/* R58-6: 成功弹窗画师 QQ 区 */
.success-qq {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  margin-bottom: 16px;
}
.success-qq-label { font-size: 13px; color: var(--text-secondary); }
.success-qq-no {
  font-size: 18px; font-weight: 700; color: var(--text-primary);
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 6px 16px;
  font-variant-numeric: tabular-nums;
}
.success-qq-actions { display: flex; gap: 8px; }
/* F1 围剿：成功态追踪链接区（克制居中） */
.success-track {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  margin-bottom: 16px; padding: 12px; border-radius: 10px;
  background: var(--el-fill-color-light);
}
.success-track-hint { margin: 0; font-size: 13px; color: var(--text-secondary); }
.success-track-link {
  display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;
}
.success-track-link code {
  font-size: 11px; color: var(--text-primary); word-break: break-all;
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 6px 10px; line-height: 1.5;
}
.success-track-qr {
  border-radius: 8px; border: 1px solid var(--border-color);
  background: #fff;
}
/* R58-5: 成功弹窗按钮行 */
.success-actions { display: flex; gap: 8px; justify-content: center; }
/* P0 修复：加载失败错误横幅（克制居中，淡边框+主色重试） */
.load-error-banner {
  margin: 24px auto; max-width: 420px; padding: 28px 20px; text-align: center;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--r-l);
}
.load-error-banner p { margin: 0 0 14px; color: var(--text-secondary); font-size: 14px; }
/* 战役波 M：步骤切换淡入（class 重触发；v-show 隐藏面板 display:none 不参与，仅当前步可见） */
.step-fade-run > *:not(.step-eyebrow) { animation: step-fade-in var(--dur-mid) var(--ease-out); }
@keyframes step-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .step-fade-run > * { animation: none; }
}
</style>
