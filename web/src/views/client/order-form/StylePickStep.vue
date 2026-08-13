<template>
  <!-- ── 选画风（多画风步骤 1，单画风跳过） ── -->
  <div>
    <h3 class="step-title">{{ t('orderForm.styleStepTitle') }}</h3>
    <div class="style-pick-grid">
      <div
        v-for="s in styles" :key="s.id"
        class="style-pick" :class="{ 'style-pick--on': selectedStyleId === s.id }"
        @click="emit('select', s.id)"
      >
        <span v-if="selectedStyleId === s.id" class="style-pick-stamp">✓</span>
        <div v-if="s.cover_image" class="style-pick-img-wrap">
          <el-image :src="`/uploads/${s.cover_image}`" fit="cover" class="style-pick-img" :alt="s.name" />
        </div>
        <div v-else class="style-pick-img-empty">{{ s.name?.charAt(0) }}</div>
        <div class="style-pick-name">{{ s.name }}</div>
        <div v-if="s.description" class="style-pick-desc">{{ s.description }}</div>
      </div>
    </div>
    <div class="step-nav step-nav--end">
      <el-button type="primary" :disabled="!selectedStyleId" @click="emit('next')">{{ t('orderForm.nextStep') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ArtistStyle } from './types'

defineProps<{
  styles: ArtistStyle[]
  selectedStyleId: number | null
}>()

const emit = defineEmits<{
  (e: 'select', id: number): void
  (e: 'next'): void
}>()

const { t } = useI18n()
</script>

<style scoped>
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
.step-nav--end { justify-content: flex-end; }
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

/* ─── v0.32: 画风卡片选择 ─── */
.style-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.style-pick {
  position: relative;
  padding: 0 0 14px; text-align: center; cursor: pointer;
  background: var(--bg-card);
  border: 2px solid var(--border-color); border-radius: 12px;
  overflow: hidden;
  transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-mid), box-shadow var(--dur-fast) var(--ease-out);
}
.style-pick:hover { box-shadow: var(--shadow-card-hover); }
.style-pick:active { transform: translateY(-2px); }
.style-pick--on { border-color: var(--color-primary); }
.style-pick-stamp {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--color-primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  animation: tier-stamp-in var(--dur-slow) var(--ease-bounce);
}
@keyframes tier-stamp-in {
  from { transform: scale(0) rotate(-30deg); }
  to { transform: scale(1) rotate(0deg); }
}
.style-pick-img-wrap { height: 130px; overflow: hidden; }
.style-pick-img { width: 100%; height: 130px; display: block; }
.style-pick-img-empty {
  height: 130px; display: flex; align-items: center; justify-content: center;
  font-size: 40px; background: var(--bg-inset);
}
.style-pick-name {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 600; color: var(--text-primary);
  margin: 10px 12px 4px;
}
.style-pick-desc {
  font-size: 12px; color: var(--text-secondary); line-height: 1.5;
  margin: 0 12px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
</style>
