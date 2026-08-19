<template>
  <transition name="tpl-cta">
    <div class="tpl-sticky-cta" v-if="visible">
      <div class="tpl-sticky-inner">
        <span class="tpl-sticky-name">{{ artist.name }}</span>
        <button
          class="tpl-sticky-btn"
          :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.commission') }}
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps({
  visible: { type: Boolean, default: false },
  artist: { type: Object, default: () => ({}) },
  subdomain: { type: String, default: '' }
})
</script>

<style scoped>
.tpl-sticky-cta {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  background: color-mix(in srgb, var(--pal-surface) 88%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--pal-border);
}
.tpl-sticky-inner {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.tpl-sticky-name {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--pal-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tpl-sticky-btn {
  padding: 10px 28px;
  background: var(--color-primary);
  color: var(--pal-bg);
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-mid), transform var(--dur-mid);
}
.tpl-sticky-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
  /* T 波：hover 禁位移——保留背景加深反馈 */
}
.tpl-sticky-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
