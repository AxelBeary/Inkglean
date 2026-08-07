<template>
  <!-- v0.38: 统一墨线空状态（REQ-026 §二：一笔墨线代替插画，保持工具感）
       楷体 15px 标题 + 12px 描述 + 可选操作插槽 -->
  <div class="v-empty">
    <!-- 一笔墨线（装饰性，透明度克制） -->
    <svg class="v-empty-stroke" viewBox="0 0 120 24" fill="none" aria-hidden="true">
      <path
        d="M6 14 C 22 6, 40 18, 58 12 S 96 8, 114 13"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
        opacity="0.35"
      />
      <path
        d="M20 17 C 34 21, 52 19, 66 20"
        stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
        opacity="0.18"
      />
    </svg>
    <p class="v-empty-title">{{ title }}</p>
    <p v-if="desc" class="v-empty-desc">{{ desc }}</p>
    <div v-if="$slots.default" class="v-empty-action">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  /** 空状态标题（楷体） */
  title: { type: String, required: true },
  /** 描述文案（可选） */
  desc: { type: String, default: '' }
})
</script>

<style scoped>
.v-empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 26px 16px;
  text-align: center;
}
.v-empty-stroke {
  width: 120px; height: 24px;
  color: var(--ink4, #B3AE9F);
  margin-bottom: 10px;
}
.v-empty-title {
  font-family: var(--f-d, serif);
  font-size: calc(var(--font-scale, 1) * 15px); font-weight: 400;
  color: var(--ink2, var(--text-secondary));
  margin: 0;
}
.v-empty-desc {
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3, var(--text-muted));
  margin: 6px 0 0;
  line-height: 1.6;
}
.v-empty-action { margin-top: 14px; }
</style>
