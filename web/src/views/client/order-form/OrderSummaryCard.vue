<template>
  <!-- R58-2: 粘性摘要卡（宽屏右侧 / 移动端底部） -->
  <aside class="summary-card">
    <div class="summary-title">{{ t('orderForm.summaryTitle') }}</div>
    <!-- REQ-022 F3: 客户信息回显（双模式公共，空值隐藏；描述 3 行截断） -->
    <div v-if="clientName.trim() || description.trim()" class="summary-client">
      <div v-if="clientName.trim()" class="summary-line">
        <span>{{ t('orderForm.summaryNickname') }}</span>
        <span class="summary-client-value">{{ clientName }}</span>
      </div>
      <div v-if="description.trim()" class="summary-desc">
        <div class="summary-line">{{ t('orderForm.summaryDescription') }}</div>
        <div class="summary-desc-text">{{ description }}</div>
      </div>
      <div class="summary-divider"></div>
    </div>
    <!-- SPEC-PRICE-2 摘要：画风/尺寸 + 增项明细 + 用途/加急 + 总价 -->
    <template v-if="isStyleMode && selectedSize">
      <div class="summary-tier">{{ selectedStyle?.name }}</div>
      <div class="summary-lines">
        <div class="summary-line">
          <span>{{ selectedSize.name }}</span>
          <span class="summary-amt">{{ formatYuanValue(selectedSize.base_price) }}</span>
        </div>
        <!-- E13: 尺寸行下方补显档位描述/工期/示意图（字段为空则对应块不渲染） -->
        <div v-if="sizeDescription || sizeWorkDays != null || sizeImageUrl" class="summary-size-detail">
          <img
            v-if="sizeImageUrl"
            class="summary-size-img"
            :src="sizeImageUrl"
            :alt="t('orderForm.summarySizeImgAlt')"
            loading="lazy"
          />
          <p v-if="sizeDescription" class="summary-size-desc">{{ sizeDescription }}</p>
          <p v-if="sizeWorkDays != null" class="summary-size-days">{{ t('orderForm.summaryWorkDays', { n: sizeWorkDays }) }}</p>
        </div>
        <template v-if="preview">
          <div v-for="(item, idx) in preview.fixedAddonItems" :key="'f' + idx" class="summary-line">
            <span>{{ item.name }}{{ (item.quantity || 0) > 1 ? ` ×${item.quantity}` : '' }}</span>
            <span class="summary-amt">+{{ formatYuan(item.amountCents) }}</span>
          </div>
          <div v-for="(item, idx) in preview.percentAddonItems" :key="'p' + idx" class="summary-line">
            <span>{{ item.name }} +{{ item.percent }}%</span>
            <span class="summary-amt">+{{ formatYuan(item.amountCents) }}</span>
          </div>
          <div v-if="preview.usage" class="summary-line">
            <span>{{ preview.usage.name }} +{{ preview.usage.percent }}%</span>
            <span class="summary-amt">+{{ formatYuan(preview.usage.incrementCents) }}</span>
          </div>
          <div v-if="preview.rush" class="summary-line">
            <span>{{ preview.rush.name }} +{{ preview.rush.percent }}%</span>
            <span class="summary-amt">+{{ formatYuan(preview.rush.incrementCents) }}</span>
          </div>
          <div v-if="preview.discount" class="summary-line summary-line--discount">
            <span>{{ t('orderForm.discountEstimate') }}</span>
            <span class="summary-amt">-{{ formatYuan(preview.discount.amountCents) }}</span>
          </div>
        </template>
        <div class="summary-divider"></div>
      </div>
      <div class="summary-total">
        <span>{{ t('orderForm.receiptTotal') }}</span>
        <span class="summary-total-amt">{{ formatYuanValue(displayPrice) }}</span>
      </div>
      <div v-if="installments.length > 1" class="summary-installments">
        <span v-for="inst in installments" :key="inst.label" class="summary-inst">
          {{ inst.label }} {{ formatYuan(inst.amountCents) }}
        </span>
      </div>
    </template>
    <div v-else class="summary-empty">{{ t('orderForm.summaryNoSize') }}</div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatYuan, formatYuanValue } from '../../../utils/money'
// E13: 尺寸图路径解析复用客户端先例（artwork_image_path > image，见 useArtistData 三号契约）
import { resolveSizeImagePath } from '../../../composables/useArtistData'
import type { ArtistStyle, InstallmentItem, StylePricePreview, StyleSize } from './types'

const props = defineProps<{
  /** 客户昵称回显（原样展示，判空用 trim） */
  clientName: string
  /** 需求描述回显（3 行截断由 CSS 完成） */
  description: string
  isStyleMode: boolean
  selectedStyle: ArtistStyle | null
  selectedSize: StyleSize | null
  /** 画风价格预览（未计价为 null，明细区不渲染） */
  preview: StylePricePreview | null
  installments: InstallmentItem[]
  /** 展示价（元；SPEC-PRICE-2 唯一引擎总价，未计价回退尺寸基础价） */
  displayPrice: number
}>()

// ─── E13: 档位描述/工期/示意图（字段为空则摘要卡对应块不渲染） ───
const sizeDescription = computed(() => props.selectedSize?.description?.trim() || '')
const sizeWorkDays = computed(() => props.selectedSize?.work_days ?? null)
const sizeImageUrl = computed(() => {
  const path = resolveSizeImagePath(props.selectedSize)
  return path ? `/uploads/${path}` : ''
})

const { t } = useI18n()
</script>

<style scoped>
/* ─── R58-2: 粘性摘要卡 ─── */
.summary-card {
  position: sticky; top: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: 12px;
  padding: 18px;
}
.summary-title {
  font-size: 13px; font-weight: 600; letter-spacing: 2px;
  color: var(--text-secondary); margin-bottom: 12px;
}
.summary-tier {
  font-family: var(--font-display);
  font-size: 16px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 8px;
}
.summary-lines { margin-bottom: 4px; }
.summary-line {
  display: flex; justify-content: space-between;
  font-size: 13px; color: var(--text-secondary); padding: 3px 0;
}
.summary-amt { font-variant-numeric: tabular-nums; }
.summary-divider { border-top: 1px dashed var(--border-color); margin: 6px 0; }
.summary-total {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
}
.summary-total-amt {
  font-size: 22px; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.summary-installments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.summary-inst {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
}
.summary-empty { font-size: 13px; color: var(--text-muted); }
.summary-line--discount .summary-amt { color: var(--color-danger, #f56c6c); }
/* ─── E13: 档位描述/工期/示意图（移动端友好：宽度受限 + 圆角纸边） ─── */
.summary-size-detail { display: flex; flex-direction: column; gap: 6px; padding: 2px 0 4px; }
.summary-size-img {
  display: block; width: 100%; max-width: 180px;
  aspect-ratio: 4 / 3; object-fit: cover;
  border: 1px solid var(--border-color);
  border-radius: 6px 10px 7px 9px / 9px 7px 10px 6px;
}
.summary-size-desc {
  margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.6;
  word-break: break-word;
}
.summary-size-days { margin: 0; font-size: 12px; color: var(--text-muted); }
/* ─── REQ-022 F3: 客户信息回显（昵称 + 需求描述） ─── */
.summary-client { margin-bottom: 4px; }
.summary-client-value { font-weight: 600; color: var(--text-primary); }
.summary-desc { margin-top: 2px; }
.summary-desc-text {
  font-size: 12px; color: var(--text-secondary); line-height: 1.6;
  word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

/* ─── R58-2: 移动端——单栏，摘要卡移到底部 ─── */
@media (max-width: 860px) {
  .summary-card { position: static; }
}
</style>
