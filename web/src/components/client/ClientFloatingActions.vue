<template>
  <div class="client-fab" :class="{ 'client-fab--raised': raised }">
    <ThemePicker />
  </div>
</template>

<script setup>
import ThemePicker from '../ThemePicker.vue'

defineProps({
  /** 吸底 CTA 可见时上移避让（Gallery/Folio/Atelier 模板触发） */
  raised: { type: Boolean, default: false }
})
</script>

<style scoped>
/* #55/61: 客户端统一浮窗——右下角固定悬浮 */
.client-fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 95;
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  transition: box-shadow 0.2s, bottom 0.3s;
}
.client-fab:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }
.client-fab--raised { bottom: 72px; }
</style>
