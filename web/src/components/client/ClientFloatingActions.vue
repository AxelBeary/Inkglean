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
  transition: box-shadow var(--dur-mid), bottom var(--dur-slow);
}
.client-fab:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }
.client-fab--raised { bottom: 72px; }
/* P1-1 修复：移动端底部常驻 CTA（吸底条/约稿按钮）与悬浮件同垂直带——移动端悬浮件始终上移避让，
   避免遮挡主 CTA（Classic 无吸底 CTA 不触发 raised，此前被压；DOM 量化重叠 2714px²） */
@media (max-width: 768px) {
  .client-fab { bottom: 72px; }
}
</style>
