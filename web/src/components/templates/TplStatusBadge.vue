<template>
  <span class="tpl-status" :class="status">
    <span class="tpl-status-dot" />
    <span class="tpl-status-text">{{ statusText(status) }}</span>
    <!-- SPEC-004: 名额文案（后端已算好，null = 未启用名额制，不显示） -->
    <span v-if="slotDisplay" class="tpl-status-slot">{{ slotDisplay }}</span>
  </span>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useArtistData } from '../../composables/useArtistData.js'

defineProps({
  status: { type: String, default: 'open' },
  /** SPEC-004: 名额显示文案（开放中·剩N席 / 可候补 / 已接满 / 休息中），null 时不显示 */
  slotDisplay: { type: String as PropType<string | null>, default: null }
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
  /* T 波：光晕清违——0 0 8px 发光改 --sh-1（客户端作用域无 --sh-1 → 自然无阴影，后台作用域回落纸墨浅影） */
  box-shadow: var(--sh-1);
}
.tpl-status.full .tpl-status-dot {
  background: var(--color-warning);
  box-shadow: var(--sh-1);
}
.tpl-status.break .tpl-status-dot {
  background: var(--color-danger);
  box-shadow: var(--sh-1);
}
.tpl-status-text {
  font-size: 13px;
  letter-spacing: 1px;
  /* P2 对比度：pal-text-dim 浅色 #8a8177 on #faf8f5 仅 3.61:1；65% pal-text + 35% dim = 8.78:1（浅）/ 10.27:1（深） */
  color: color-mix(in srgb, var(--pal-text) 65%, var(--pal-text-dim));
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
