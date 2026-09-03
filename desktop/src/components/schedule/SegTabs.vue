<script setup lang="ts">
// 纸签脉页签（9/4 主页重设计落码波1 · 契约层共享件）：
// 首页卷心主位切换（variant=plain）与独立排期页三视图切换（variant=tray）共用同一件，两处视觉口径不许漂。
// 选中态唯一口径（9/4 用户第三轮拍板）：花青字 + 纸底 + 花青内描边（inset 零位移）——
// **永不含朱砂点印**：用户实测反馈「页签右上角红点像未读通知，会误导画师」。
// 手法承 824 anti-AI-flavor 复检拍板候选 C（纸签脉选中态），只去掉点印。
import type { TabItem } from './tabs'

const props = withDefaults(
  defineProps<{
    items: TabItem[]
    modelValue: string
    /** plain＝首页卷心态（无托盘底、字号 15px）；tray＝排期页态（--paper2 托盘底 + 3px 内衬、字号 14px） */
    variant?: 'plain' | 'tray'
  }>(),
  { variant: 'tray' }
)

const emit = defineEmits<{ (_e: 'update:modelValue', _v: string): void }>()

function pick(v: string): void {
  if (v !== props.modelValue) emit('update:modelValue', v)
}
</script>

<template>
  <div class="tabs" :class="variant === 'plain' ? 'mv-tabs' : 'seg-tabs'" role="tablist">
    <button
      v-for="it in items"
      :key="it.value"
      type="button"
      role="tab"
      class="tab"
      :class="variant === 'plain' ? 'mv-tab' : 'seg-tab'"
      :aria-selected="it.value === modelValue"
      @click="pick(it.value)"
    >
      {{ it.label }}
    </button>
    <!-- 尾部槽：首页放「看全景三视图 ›」，排期页留空 -->
    <slot name="tail" />
  </div>
</template>

<style scoped>
/* 首页卷心态（原型 .mv-tabs / .mv-tab）：无托盘底，与卷心齐平 */
.mv-tabs { display: flex; align-items: center; gap: 2px; }
.mv-tab {
  position: relative; padding: 5px 16px;
  font-family: var(--f-d); font-size: 15px; color: var(--ink3);
  border-radius: var(--r-s-hand);
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}

/* 排期页态（原型 .seg-tabs / .seg-tab）：纸托盘底 + 3px 内衬 */
.seg-tabs { display: inline-flex; align-items: center; gap: 2px; padding: 3px; background: var(--paper2); border-radius: var(--r-s-hand); }
.seg-tab {
  position: relative; padding: 6px 16px;
  font-family: var(--f-d); font-size: 14px; color: var(--ink3);
  border-radius: var(--r-s);
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}

.tab:hover { color: var(--ink); }
/* 选中态：花青字 + 纸底 + 花青内描边（inset 零位移，不挤动邻签）；刻意无 ::after 点印 */
.tab[aria-selected="true"] { color: var(--hq-d); background: var(--card); box-shadow: inset 0 0 0 1.5px var(--hq); }
</style>
