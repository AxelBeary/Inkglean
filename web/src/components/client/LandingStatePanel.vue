<template>
  <!-- 空态 / 失败态面板：两者必须一眼可分（P0-1）
       · 图标：失败=警示三角，空态=画框
       · 色彩：失败=危险色描边 + 危险色图标，空态=中性
       · 操作：只有失败态给「再试一次」（空态的重试只会让访客以为是自己错了） -->
  <div class="state-panel" :class="`state-panel--${variant}`" role="group" :aria-labelledby="titleId">
    <el-icon class="state-icon" :size="40" aria-hidden="true">
      <WarningFilled v-if="variant === 'error'" />
      <Picture v-else />
    </el-icon>
    <p :id="titleId" class="state-title">{{ title }}</p>
    <p class="state-desc">{{ description }}</p>
    <button v-if="variant === 'error'" type="button" class="state-retry" @click="$emit('retry')">
      {{ $t('common.loadRetry') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Picture, WarningFilled } from '@element-plus/icons-vue'

const props = defineProps<{
  variant: 'error' | 'empty'
  title: string
  description: string
}>()
defineEmits<{ (e: 'retry'): void }>()

const titleId = computed(() => `landing-state-title-${props.variant}`)
</script>

<style scoped>
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--r-card);
}
.state-panel--error { border-color: var(--color-danger); }
.state-icon { color: var(--text-secondary); }
.state-panel--error .state-icon { color: var(--color-danger); }
.state-title {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.state-desc {
  margin-top: 8px;
  max-width: 32em;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.state-retry {
  margin-top: 24px;
  padding: 8px 24px;
  border: 1px solid var(--color-primary);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--color-primary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.state-retry:hover {
  background: var(--color-primary);
  color: var(--pal-bg);
}
.state-retry:active { filter: brightness(0.92); }
</style>
