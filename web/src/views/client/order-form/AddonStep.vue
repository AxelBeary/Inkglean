<template>
  <!-- ── SPEC-PRICE-2: 选增项（普通多选 + 用途单选 + 加急单选）+ 实时价格明细 ── -->
  <div>
    <h3 class="step-title">{{ t('orderForm.addonStepTitle') }}</h3>

    <!-- 普通增项（可多选共存；开关类/个数类，支持 ¥ 或 %） -->
    <div v-if="regularAddons.length" class="addon-group">
      <p class="addon-group-label">{{ t('orderForm.addonGroupRegular') }}</p>
      <div class="style-addon-list">
        <div v-for="a in regularAddons" :key="a.id" class="style-addon-item">
          <div class="style-addon-info">
            <span class="style-addon-name">{{ a.name }}</span>
            <span class="style-addon-price">{{ priceText(a) }}</span>
            <span v-if="a.price_mode === 'percent'" class="style-addon-note">{{ t('orderForm.pctOfBase') }}</span>
          </div>
          <el-switch
            v-if="a.control_type === 'switch'"
            :model-value="addonSelections[a.id]?.toggled || false"
            size="small"
            @change="onAddonSwitch(a, $event)"
          />
          <el-input-number
            v-else
            :model-value="addonSelections[a.id]?.quantity || 0"
            :min="0" :max="a.max_quantity || 99" :step="1" size="small" style="width: 110px"
            @change="onAddonQuantity(a, $event)"
          />
        </div>
      </div>
    </div>

    <!-- 用途（最多选一项，可不选；乘在小计之后） -->
    <div v-if="usageAddons.length" class="addon-group">
      <p class="addon-group-label">{{ t('orderForm.addonGroupUsage') }}<span class="addon-group-hint">{{ t('orderForm.multOptionalHint') }}</span></p>
      <div class="mult-chips">
        <button
          v-for="a in usageAddons" :key="a.id"
          type="button"
          class="mult-chip mult-chip--usage"
          :class="{ 'mult-chip--on': selectedUsageId === a.id }"
          :aria-pressed="selectedUsageId === a.id"
          @click="emit('toggleUsage', a.id)"
        >
          <span class="mult-chip-name">{{ a.name }}</span>
          <span class="mult-chip-pct">{{ priceText(a) }}</span>
        </button>
      </div>
    </div>

    <!-- 加急（最多选一项，可不选） -->
    <div v-if="rushAddons.length" class="addon-group">
      <p class="addon-group-label">{{ t('orderForm.addonGroupRush') }}<span class="addon-group-hint">{{ t('orderForm.multOptionalHint') }}</span></p>
      <div class="mult-chips">
        <button
          v-for="a in rushAddons" :key="a.id"
          type="button"
          class="mult-chip mult-chip--rush"
          :class="{ 'mult-chip--on': selectedRushId === a.id }"
          :aria-pressed="selectedRushId === a.id"
          @click="emit('toggleRush', a.id)"
        >
          <span class="mult-chip-name">{{ a.name }}</span>
          <span class="mult-chip-pct">{{ priceText(a) }}</span>
        </button>
      </div>
    </div>

    <el-empty v-if="!hasAddons" :description="t('orderForm.addonStepEmpty')" :image-size="40" />

    <!-- SPEC-PRICE-2 实时价格明细（与后端唯一引擎同公式：小计×用途×加急−折扣） -->
    <div v-if="preview" class="price-preview">
      <div class="price-line">
        <span>{{ t('orderForm.previewBaseLine', { size: preview.sizeName }) }}</span>
        <span class="price-amount">{{ formatYuan(preview.baseCents) }}</span>
      </div>
      <div v-for="(item, idx) in preview.fixedAddonItems" :key="'f' + idx" class="price-line">
        <span>{{ item.name }}{{ (item.quantity || 0) > 1 ? ` ×${item.quantity}` : '' }}</span>
        <span class="price-amount">+{{ formatYuan(item.amountCents) }}</span>
      </div>
      <div v-for="(item, idx) in preview.percentAddonItems" :key="'p' + idx" class="price-line">
        <span>{{ item.name }} +{{ item.percent }}%<span class="price-line-note">（{{ t('orderForm.pctOfBase') }}）</span></span>
        <span class="price-amount">+{{ formatYuan(item.amountCents) }}</span>
      </div>
      <div class="price-line subtotal">
        <span>{{ t('orderForm.priceSubtotal') }}</span>
        <span class="price-amount">{{ formatYuan(preview.subtotalCents) }}</span>
      </div>
      <div v-if="preview.usage" class="price-line">
        <span>{{ preview.usage.name }} +{{ preview.usage.percent }}%</span>
        <span class="price-amount">+{{ formatYuan(preview.usage.incrementCents) }}</span>
      </div>
      <div v-if="preview.rush" class="price-line">
        <span>{{ preview.rush.name }} +{{ preview.rush.percent }}%</span>
        <span class="price-amount">+{{ formatYuan(preview.rush.incrementCents) }}</span>
      </div>
      <div class="price-divider"></div>
      <!-- 折扣码输入行（画师开启折扣功能时才显示；先倍率后折扣） -->
      <div v-if="discountEnabled" class="discount-row">
        <span class="discount-label">{{ t('orderForm.discountLabel') }}</span>
        <el-input
          v-model="discountCode"
          :placeholder="t('orderForm.discountPlaceholder')"
          size="small" class="discount-input"
          @keyup.enter="emit('validateDiscount')"
        />
        <el-button
          size="small" type="primary" plain
          :loading="discountValidating"
          :disabled="!discountCode.trim()"
          @click="emit('validateDiscount')"
        >
          {{ t('orderForm.discountValidate') }}
        </el-button>
        <span v-if="discountResult" class="discount-ok">
          ✓ {{ discountResult.discountType === 'percent' ? `-${discountResult.discountValue}%` : `-${formatYuanValue(discountResult.discountValue)}` }}
        </span>
      </div>
      <p v-if="discountError" class="discount-error">✕ {{ discountError }}</p>
      <div class="price-line total">
        <span>{{ t('orderForm.receiptTotal') }}</span>
        <span class="price-amount">{{ formatYuan(preview.totalCents) }}</span>
      </div>
      <div v-if="preview.discount" class="price-line discount">
        <span>{{ t('orderForm.discountEstimate') }}（{{ preview.discount.code }}）</span>
        <span class="price-amount discount-amount">-{{ formatYuan(preview.discount.amountCents) }}</span>
      </div>
      <div v-if="installments.length > 1" class="installment-row">
        <span v-for="inst in installments" :key="inst.label" class="installment-chip">
          {{ inst.label }} {{ formatYuan(inst.amountCents) }}
        </span>
      </div>
    </div>

    <!-- K1-3: 计价失败页内错误态（保留 discountError 同款视觉；预览清空不再静默） -->
    <p v-if="styleCalcError" class="price-calc-error">✕ {{ styleCalcError }}</p>

    <div class="step-nav">
      <el-button @click="emit('prev')">{{ t('orderForm.prevStep') }}</el-button>
      <el-button type="primary" @click="emit('next')">{{ t('orderForm.nextStep') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatYuan, formatYuanValue } from '../../../utils/money.js'
import type { AddonSelection, DiscountResult, InstallmentItem, StyleAddon, StylePricePreview } from './types'

defineProps<{
  regularAddons: StyleAddon[]
  usageAddons: StyleAddon[]
  rushAddons: StyleAddon[]
  /** 当前尺寸下是否有可用增项（无则显示空态） */
  hasAddons: boolean
  /** 普通增项勾选状态（只读展示；变更走 emits 上报父层） */
  addonSelections: Record<number, AddonSelection>
  selectedUsageId: number | null
  selectedRushId: number | null
  /** 增项单价展示文本（composable styleAddonPriceText 单一来源） */
  priceText: (addon: StyleAddon) => string
  /** 画风价格预览（calculate-style-price 响应；未计价为 null） */
  preview: StylePricePreview | null
  /** 计价失败错误文案（空串 = 无错误；K1-3 禁止失败静默） */
  styleCalcError: string
  installments: InstallmentItem[]
  discountEnabled: boolean
  discountValidating: boolean
  discountResult: DiscountResult | null
  discountError: string
}>()

/** 折扣码输入（v-model 上报父层 form.discountCode） */
const discountCode = defineModel<string>('discountCode', { default: '' })

const emit = defineEmits<{
  (e: 'addonToggle', id: number, toggled: boolean): void
  (e: 'addonQuantity', id: number, quantity: number): void
  (e: 'toggleUsage', id: number): void
  (e: 'toggleRush', id: number): void
  (e: 'validateDiscount'): void
  (e: 'prev'): void
  (e: 'next'): void
}>()

/** 开关类增项变化（保持原内联语义：无记录先建默认值，再写 toggled） */
function onAddonSwitch(a: StyleAddon, val: boolean) {
  emit('addonToggle', a.id, val)
}
/** 个数类增项变化（el-input-number change 可能为 undefined，按 0 处理） */
function onAddonQuantity(a: StyleAddon, val: number | undefined) {
  emit('addonQuantity', a.id, val ?? 0)
}

const { t } = useI18n()
</script>

<style scoped>
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

/* ─── SPEC-PRICE-2: 增项步三区分组 + 用途/加急单选 chip ─── */
.addon-group { margin-bottom: 18px; }
/* 拆分搬运注意：原 OrderForm 存在同名 .addon-group 后置规则（旧折叠式残留），
   级联后实际生效的是本条（边框 + 12px 间距），必须原样保留顺序 */
.addon-group { margin-bottom: 12px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.addon-group-label {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  margin: 0 0 8px; display: flex; align-items: baseline; gap: 8px;
}
.addon-group-hint { font-size: 11px; font-weight: 400; color: var(--text-secondary); }
.mult-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mult-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px; border-radius: 999px;
  border: 1px solid var(--border-color-strong, #c0c4cc);
  background: var(--bg-card, #fff); color: var(--text-primary);
  font-size: 13px; font-family: inherit; cursor: pointer; user-select: none;
  transition: border-color var(--dur-fast), background var(--dur-fast), color var(--dur-fast);
}
.mult-chip:hover { border-color: var(--color-primary); }
.mult-chip-pct { font-weight: 700; font-variant-numeric: tabular-nums; }
.mult-chip--usage.mult-chip--on {
  border-color: var(--color-primary); color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--bg-card, #fff));
}
.mult-chip--rush.mult-chip--on {
  border-color: var(--color-danger, #f56c6c); color: var(--color-danger, #f56c6c);
  background: color-mix(in srgb, var(--color-danger, #f56c6c) 10%, var(--bg-card, #fff));
}
.style-addon-note { font-size: 11px; color: var(--text-secondary); margin-left: 6px; }

/* 价格明细：小计行 + 注释 */
.price-line.subtotal { font-weight: 600; color: var(--text-primary); }
.price-line-note { font-size: 11px; color: var(--text-secondary); margin-left: 4px; }

/* 价格预览 */
.price-preview {
  background: var(--bg-inset); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; color: var(--text-secondary); }
.price-line.total { font-size: 16px; font-weight: 700; color: var(--text-primary); padding-top: 8px; }
/* v0.31 F3: 折扣码输入行 + 折扣行 */
.discount-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; flex-wrap: wrap; }
.discount-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; }
.discount-input { width: 140px; }
.discount-ok { font-size: 13px; font-weight: 600; color: var(--el-color-success); }
.discount-error { font-size: 12px; color: var(--el-color-danger); margin: 2px 0 0; }
.price-calc-error { font-size: 12px; color: var(--el-color-danger); margin: 4px 0 0; }
.price-line.discount .discount-amount { color: var(--el-color-danger); font-weight: 600; }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
.installment-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.installment-chip {
  font-size: 12px; padding: 3px 10px; border-radius: 12px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
  font-weight: 500;
}

/* ─── v0.32: 增项控件列表 ─── */
.style-addon-list { display: flex; flex-direction: column; gap: 4px; }
.style-addon-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: var(--bg-card); border: 1px solid var(--border-color);
}
.style-addon-info { display: flex; flex-direction: column; gap: 2px; }
.style-addon-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.style-addon-price { font-size: 12px; color: var(--el-color-primary); font-weight: 600; }
</style>
