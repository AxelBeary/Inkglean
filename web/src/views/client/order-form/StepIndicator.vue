<template>
  <!-- R58-2: 步骤指示器（v0.32: 动态步骤——旧模型3步 / 单画风3步 / 多画风4步） -->
  <div class="step-indicator">
    <template v-for="(sd, idx) in stepDefs" :key="sd.key">
      <div class="step-item">
        <span class="step-dot" :class="{ 'step-dot--active': step === idx + 1, 'step-dot--done': step > idx + 1 }">{{ step > idx + 1 ? '✓' : idx + 1 }}</span>
        <span class="step-label" :class="{ 'step-label--on': step === idx + 1 }">{{ sd.label }}</span>
      </div>
      <span v-if="idx < stepDefs.length - 1" class="step-connector" :class="{ 'step-connector--done': step > idx + 1 }"></span>
    </template>
  </div>

  <!-- v0.35 F4: 入口 A 预选摘要横幅——展示柜带选择进来时明确显示已预选内容，可回上一步修改 -->
  <div v-if="bannerText" class="preselect-banner">
    <span class="preselect-banner-text">{{ bannerText }}</span>
    <!-- 多画风回选画风步；单画风回选尺寸步（改选后价格自动重算，横幅随之消失） -->
    <button
      type="button"
      class="preselect-banner-btn"
      @click="emit('editPreselect')"
    >
      {{ t('orderForm.preselectChange') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { StepDef } from './types'

defineProps<{
  stepDefs: StepDef[]
  step: number
  /** v0.35 F4: 预选摘要横幅文案（空串不显示） */
  bannerText: string
}>()

const emit = defineEmits<{
  /** 点「修改」回已预选步骤（目标步由父层按单/多画风决定） */
  (e: 'editPreselect'): void
}>()

const { t } = useI18n()
</script>

<style scoped>
/* ─── R58-2: 步骤指示器 ─── */
.step-indicator {
  display: flex; align-items: center; justify-content: center;
  margin: 24px 0 20px;
}
/* ─── v0.35 F4: 入口 A 预选摘要横幅（可见可改） ─── */
.preselect-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 18px;
  padding: 10px 16px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--border-color, #dcdfe6));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--bg-page, #fff));
}
.preselect-banner-text {
  font-size: 13px;
  color: var(--text-primary, var(--el-text-color-primary));
}
.preselect-banner-btn {
  padding: 3px 12px;
  border: 1px solid var(--border-color-strong, #c0c4cc);
  border-radius: 999px;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--dur-mid), background var(--dur-mid);
}
.preselect-banner-btn:hover {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.step-item { display: flex; align-items: center; gap: 8px; }
.step-dot {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
  border: 2px solid var(--border-color-strong);
  color: var(--text-muted); background: var(--bg-card);
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-mid), border-color var(--dur-mid), color var(--dur-mid);
}
.step-dot--active {
  border-color: var(--color-primary); color: var(--color-primary);
  transform: scale(1.15);
}
.step-dot--done {
  background: var(--color-primary); border-color: var(--color-primary); color: #fff;
}
.step-label { font-size: 13px; color: var(--text-muted); transition: color var(--dur-mid); }
.step-label--on { color: var(--text-primary); font-weight: 600; }
.step-connector {
  width: 48px; height: 2px; margin: 0 10px;
  background: var(--border-color-strong);
  transition: background var(--dur-slow);
}
.step-connector--done { background: var(--color-primary); }

/* ─── R58-2: 移动端——指示器单栏化 ─── */
@media (max-width: 860px) {
  .step-label { display: none; }
  .step-label--on { display: inline; }
  .step-item:has(.step-label--on) { order: -1; }
  .step-connector { width: 32px; }
}
</style>
