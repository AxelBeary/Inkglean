<script setup lang="ts">
// 卷尾状态带（壳层控件）：模式事实 · 同步状态 · F8 数据永不上传承诺 · 关于入口。
// 云端=上次刷新时间；本地=「数据仅存本机」。样式照原型 .tail-right 移植。
import { computed } from 'vue'

const props = defineProps<{
  mode: 'cloud' | 'local'
  /** 云端模式最近一次成功刷新时刻（未刷新/本地模式为 null） */
  lastRefresh: Date | null
}>()

defineEmits<{ (_e: 'open-about'): void }>()

const modeText = computed(() => props.mode === 'cloud' ? '云端模式' : '本地模式')
const syncText = computed(() => {
  if (props.mode === 'local') return '数据仅存本机'
  if (!props.lastRefresh) return '同步中…'
  const hh = String(props.lastRefresh.getHours()).padStart(2, '0')
  const mm = String(props.lastRefresh.getMinutes()).padStart(2, '0')
  return `上次刷新 ${hh}:${mm}`
})
</script>

<template>
  <div class="tail-right">
    <span class="fact"><i class="mode-dot" :class="mode" aria-hidden="true"></i>{{ modeText }} · {{ syncText }}</span>
    <span class="promise">时间数据仅存本机 · 永不上传</span>
    <button type="button" class="about" @click="$emit('open-about')">关于拾绘</button>
  </div>
</template>

<style scoped>
.tail-right { margin-left: auto; display: flex; align-items: center; gap: var(--gap, 16px); flex-wrap: wrap; }
.fact { font-size: 11.5px; color: var(--ink4); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.fact .mode-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.fact .mode-dot.cloud { background: var(--hq); }
.fact .mode-dot.local { background: var(--buf); }
.promise { font-size: 11.5px; color: var(--ink4); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.promise::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--sl); flex: none; }
.about {
  font-size: 11.5px; color: var(--ink4); padding: 2px 4px; border-radius: var(--r-s-hand);
  transition: color var(--dur-fast);
}
.about:hover { color: var(--ink2); }
</style>
