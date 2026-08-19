<!--
  TplPricingSection — 价格档位 + 流程 + 修改说明 共享区块（R1 整合）

  四模板（Classic/Gallery/Folio/Atelier）原 ~27 行同构段收敛于此。
  视觉差异保留方式：
  - 外层 section 类（classic-section / gallery-section / folio-section / atelier-section
    + tpl-reveal）由调用方经 class attrs 落到组件根，模板级 scoped 样式照常生效；
  - 内层包裹类（gallery-inner / folio-inner / atelier-inner）经 inner-class prop 传入，
    内层宽度在本组件 scoped 样式内等价迁移；Classic 不传则为无样式 div（视觉零差）；
  - 标题走 title slot（各模板 p.tpl-section-label 变体 / h2.folio-title）；
  - addons 插槽原样透传给 TplTierGrid（价格计算器扩展点）。
-->
<template>
  <section
    v-if="styles.length || tiers.length || workflowStages.length"
    :id="sectionId || undefined"
    class="tpl-pricing-section"
  >
    <div :class="innerClass || undefined">
      <!-- v0.32 REQ-023 Phase3: 有画风数据 → 画风展示柜；无画风 → 档位展示柜兜底 -->
      <template v-if="styles.length">
        <slot name="title" />
        <TplShowcase :mode="'style'" :styles="styles" :subdomain="subdomain" :artist="artist" />
      </template>
      <template v-else-if="tiers.length">
        <slot name="title" />
        <TplShowcase :mode="'tier'" :tiers="tiers" :subdomain="subdomain" :artist="artist">
          <template #addons="{ tier }">
            <slot name="addons" :tier="tier" />
          </template>
        </TplShowcase>
      </template>
      <!-- R1: 流程整合进价格板块，不再独立成区 -->
      <div v-if="workflowStages.length" class="tpl-workflow-inline">
        <p class="tpl-workflow-inline-label">{{ $t('artistHome.workflow') }}</p>
        <WorkflowOverviewStrip :stages="workflowStages" vertical />
      </div>
      <div v-if="revisionNote" class="tpl-revision-note">
        <span>
          <strong class="tpl-revision-note-label">{{ $t('artistHome.revisionNote') }}</strong>
          {{ revisionNote }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import TplShowcase from './TplShowcase.vue'
import WorkflowOverviewStrip from '../shared/WorkflowOverviewStrip.vue'

/** 画风尺寸宽松形状（与 TplShowcase 子组件结构兼容） */
interface PricingSizeLike {
  id: number
  name: string
  base_price: number
  description?: string | null
  work_days?: number | null
  display_status?: string | null
  artwork_image_path?: string | null
  image?: string | null
}

/** 画风宽松形状 */
interface PricingStyleLike {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sizes?: PricingSizeLike[] | null
}

/** 档位宽松形状 */
interface PricingTierLike {
  id: number
  name: string
  price: number
  description?: string | null
  work_days?: number | null
  example_image?: string | null
  visibility?: string | null
}

/** 流程阶段宽松形状（与 WorkflowOverviewStrip 子组件结构兼容） */
interface WorkflowStageLike {
  id: number
  name: string
  takesPayment?: boolean | number | null
  basisPoints?: number | null
  isFinal?: boolean
}

defineProps({
  styles: { type: Array as PropType<PricingStyleLike[]>, default: () => [] },
  tiers: { type: Array as PropType<PricingTierLike[]>, default: () => [] },
  workflowStages: { type: Array as PropType<WorkflowStageLike[]>, default: () => [] },
  revisionNote: { type: String, default: '' },
  /** 画师子域名（跳转下单用） */
  subdomain: { type: String, default: '' },
  /** 画师信息（status 决定约稿按钮是否禁用） */
  artist: { type: Object as PropType<{ status?: string | null } | null>, default: null },
  /** 锚点 id（Folio 用 id="pricing"） */
  sectionId: { type: String, default: '' },
  /** 内层包裹类（gallery-inner / folio-inner / atelier-inner；Classic 不传） */
  innerClass: { type: String, default: '' }
})
</script>

<style scoped>
/* 内层宽度（原模板 scoped 规则等价迁移：Gallery/Folio 900px 居中、Atelier 860px 居中；
   Classic 无内层类，包一层无样式 div，视觉零差） */
.gallery-inner,
.folio-inner {
  max-width: 900px;
  margin: 0 auto;
}
.atelier-inner {
  max-width: 860px;
  margin: 0 auto;
}
</style>
