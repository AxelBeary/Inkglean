<template>
  <!-- v0.38: 印章组件（REQ-026 §二：已交付/已录入终态视觉）
       朱砂底 + 文楷白字，旋转 -6°，落章 450ms 回弹 + 墨圈扩散（纯视觉） -->
  <span class="v-seal" :class="{ 'v-seal--animate': animate }">
    <span class="v-seal-text">{{ text }}</span>
  </span>
</template>

<script setup>
defineProps({
  /** 印章文字（如：已交付 / 已录入） */
  text: { type: String, required: true },
  /** 挂载时播放落章动画（默认播放） */
  animate: { type: Boolean, default: true }
})
</script>

<style scoped>
.v-seal {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; height: 44px;
  padding: 4px 8px;
  background: var(--zs, #BC3A2B);
  color: #fff;
  font-family: var(--f-d, serif);
  font-size: calc(var(--font-scale, 1) * 15px); font-weight: 700; letter-spacing: 0.1em;
  border-radius: 8px;
  transform: rotate(-6deg);
  box-shadow: 2px 2px 0 var(--sb-seal-shadow, rgba(0, 0, 0, 0.3));
  user-select: none;
}
.v-seal-text { writing-mode: horizontal-tb; }
/* 落章回弹（450ms）+ 墨圈扩散 */
.v-seal--animate {
  animation: v-seal-stamp 450ms cubic-bezier(.3, 1.5, .4, 1) both;
}
.v-seal--animate::after {
  content: '';
  position: absolute; inset: -6px;
  border: 2px solid var(--zs, #BC3A2B);
  border-radius: 12px;
  opacity: 0;
  animation: v-seal-ring 600ms 250ms ease-out both;
}
@keyframes v-seal-stamp {
  0% { opacity: 0; transform: rotate(-6deg) scale(1.6); }
  60% { opacity: 1; transform: rotate(-6deg) scale(0.94); }
  100% { opacity: 1; transform: rotate(-6deg) scale(1); }
}
@keyframes v-seal-ring {
  0% { opacity: .45; transform: scale(.85); }
  100% { opacity: 0; transform: scale(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .v-seal--animate, .v-seal--animate::after { animation: none; }
  .v-seal--animate { opacity: 1; }
}
</style>
