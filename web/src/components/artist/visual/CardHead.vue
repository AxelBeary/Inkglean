<template>
  <!-- v0.38: 统一卡片头部（REQ-026 §二：朱砂小方块 mark + 标题 + 右侧辅助信息） -->
  <div class="v-card-head">
    <span class="v-card-head-mark" aria-hidden="true"></span>
    <span class="v-card-head-title">
      <slot>{{ title }}</slot>
    </span>
    <span v-if="$slots.extra" class="v-card-head-extra">
      <slot name="extra" />
    </span>
  </div>
</template>

<script setup>
defineProps({
  /** 标题文字（也可用默认插槽覆盖） */
  title: { type: String, default: '' }
})
</script>

<style scoped>
.v-card-head {
  display: flex; align-items: center; gap: 9px;
}
.v-card-head-mark {
  width: 4px; height: 13px;
  background: var(--zs, #BC3A2B);
  border-radius: 2px 1px 2px 1px;
  flex: none;
}
.v-card-head-title {
  font-size: 14px; font-weight: 600;
  color: var(--ink, var(--text-primary));
}
.v-card-head-extra {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px;
  color: var(--ink4, var(--text-muted));
}
</style>
