<template>
  <span class="tpl-status" :class="status">
    <span class="tpl-status-dot" />
    <span class="tpl-status-text">{{ statusText(status) }}</span>
  </span>
</template>

<script setup>
import { useArtistData } from '../../composables/useArtistData.js'

defineProps({
  status: { type: String, default: 'open' }
})

// 复用适配层的 i18n 状态文字（无需 artist 数据，仅用 statusText）
const { statusText } = useArtistData({ artist: null })
</script>

<style scoped>
.tpl-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tpl-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tpl-status.open .tpl-status-dot {
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
}
.tpl-status.full .tpl-status-dot {
  background: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning);
}
.tpl-status.break .tpl-status-dot {
  background: var(--color-danger);
  box-shadow: 0 0 8px var(--color-danger);
}
.tpl-status-text {
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--pal-text-dim);
}
</style>
