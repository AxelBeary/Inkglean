<template>
  <!-- v0.38: 统一状态 chip（REQ-026 §二：软底 + 同色文字，全圆角）
       7 色语义一对一：doing=花青 / over=朱砂 / done=石绿 / pend=藤黄 / buf=缓冲灰虚线 / pri=赭石⚑ / cancel=中性灰 -->
  <span class="v-chip" :class="`v-chip--${type}`">
    <span v-if="flag" class="v-chip-flag" aria-hidden="true">⚑</span>
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps({
  /** 语义类型：doing | over | done | pend | buf | pri | cancel */
  type: { type: String, default: 'doing' },
  /** 高优先旗标（赭石 ⚑，REQ §二） */
  flag: { type: Boolean, default: false }
})
</script>

<style scoped>
.v-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: calc(var(--font-scale, 1) * 11.5px); font-weight: 500; line-height: 1.6;
  padding: 2px 8px;
  border-radius: var(--r-s, 4px);
  white-space: nowrap;
}
.v-chip--doing { background: var(--hq-t); color: var(--hq-d); }
.v-chip--over { background: var(--zs-t); color: var(--zs-d); }
.v-chip--done { background: var(--sl-t); color: var(--sl); }
.v-chip--pend { background: var(--th-t); color: var(--th); }
.v-chip--buf {
  background: color-mix(in srgb, var(--paper2) 70%, transparent);
  color: var(--buf);
  border: 1px dashed var(--line2);
}
.v-chip--pri { background: var(--zhe-t); color: var(--zhe); }
.v-chip--cancel { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink3); }
.v-chip-flag { font-size: calc(var(--font-scale, 1) * 10px); }
</style>
