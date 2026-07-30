<template>
  <span class="tpl-status" :class="status">
    <span class="tpl-status-dot" />
    <span class="tpl-status-text">{{ statusText(status) }}</span>
    <!-- SPEC-004: 名额文案（后端已算好，null = 未启用名额制，不显示） -->
    <span v-if="slotDisplay" class="tpl-status-slot">{{ slotDisplay }}</span>
  </span>
</template>

<script setup>
import { useArtistData } from '../../composables/useArtistData.js'

defineProps({
  status: { type: String, default: 'open' },
  /** SPEC-004: 名额显示文案（开放中·剩N席 / 可候补 / 已接满 / 休息中），null 时不显示 */
  slotDisplay: { type: String, default: null }
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
/* SPEC-004: 名额文案（状态色点缀，与状态文字区分） */
.tpl-status-slot {
  font-size: 12px;
  letter-spacing: 0.5px;
  color: var(--color-primary);
  padding-left: 8px;
  border-left: 1px solid var(--pal-border);
}
</style>
