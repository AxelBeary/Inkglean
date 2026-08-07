<template>
  <ArtistLayout>
    <div class="food-menu-page">
      <h2 class="od-page-title">{{ $t('foodMenu.title') }}</h2>
      <p class="food-menu-sub">{{ $t('foodMenu.subtitle') }}</p>

      <!-- 四大类模式选择（REQ-035 四A：健康版/糖尿病版/痛风版/外卖版） -->
      <div class="food-modes" role="radiogroup" :aria-label="$t('foodMenu.title')">
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          class="food-mode"
          :class="{ 'food-mode--active': currentMode === mode }"
          role="radio"
          :aria-checked="currentMode === mode"
          @click="selectMode(mode)"
        >
          {{ $t('foodMenu.modes.' + mode) }}
        </button>
      </div>

      <!-- 免责提示：糖尿病/痛风版固定显示 -->
      <p v-if="showDisclaimer" class="food-disclaimer">{{ $t('foodMenu.disclaimer') }}</p>

      <!-- 随机推荐 / 换一个（同按钮，有结果时文案切换） -->
      <div class="food-actions">
        <el-button type="primary" @click="pickRandom">
          {{ $t(current ? 'foodMenu.again' : 'foodMenu.pick') }}
        </el-button>
      </div>

      <!-- 结果卡片（随机推荐后展示） -->
      <div v-if="current" class="food-card">
        <div class="food-card-head">
          <span class="food-card-name">{{ current.name }}</span>
          <span class="food-card-mode">{{ $t('foodMenu.modes.' + currentMode) }}</span>
        </div>
        <div class="food-card-tags">
          <span v-for="tag in current.tags" :key="tag" class="food-tag">{{ $t('foodMenu.modes.' + tag) }}</span>
        </div>
        <p class="food-card-note">{{ current.note }}</p>
      </div>

      <!-- 初始空态引导 -->
      <div v-else class="food-empty">{{ $t('foodMenu.emptyHint') }}</div>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { FOOD_MENU, FOOD_CATEGORIES } from '../../utils/food-menu.js'

// REQ-035 四A: 四大类 key（顺序 = 页面展示顺序，与 FOOD_CATEGORIES 对齐）
const MODES = Object.keys(FOOD_CATEGORIES)
const currentMode = ref(MODES[0])
const current = ref(null)

/** 糖尿病/痛风版显示免责提示（一行小字） */
const showDisclaimer = computed(() => currentMode.value === 'diabetes' || currentMode.value === 'gout')

function selectMode(mode) {
  currentMode.value = mode
  current.value = null
}

/** 从当前模式随机取一条；已有结果时换一条（池子>1 时避免连续重复） */
function pickRandom() {
  const pool = FOOD_MENU.filter(d => d.tags.includes(currentMode.value))
  if (!pool.length) return
  let next = pool[Math.floor(Math.random() * pool.length)]
  if (pool.length > 1 && current.value && next === current.value) {
    const others = pool.filter(d => d !== current.value)
    next = others[Math.floor(Math.random() * others.length)]
  }
  current.value = next
}
</script>

<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.food-menu-page { padding: 24px; max-width: 760px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.food-menu-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.food-modes { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.food-mode {
  padding: 10px 18px;
  border: 1px solid var(--line2, #dcdcdc);
  border-radius: var(--r-m, 8px);
  background: var(--card, #fff);
  color: var(--ink2, #555);
  font-size: 14px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.35s, transform 0.15s ease-out;
}
.food-mode:hover { border-color: var(--hq, var(--el-color-primary)); color: var(--ink); }
.food-mode:active { transform: scale(0.98); }
.food-mode--active {
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 12%, var(--card, #fff));
  border-color: var(--hq, var(--el-color-primary));
  color: var(--hq, var(--el-color-primary));
  font-weight: 600;
}

.food-disclaimer { margin-top: 12px; font-size: 12px; color: var(--ink3, #888); }

.food-actions { margin-top: 20px; }

.food-card {
  margin-top: 20px;
  padding: 22px 24px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.food-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.food-card-name { font-size: calc(var(--font-scale, 1) * 22px); font-weight: 700; color: var(--ink, #222); }
.food-card-mode {
  font-size: 12px; color: var(--hq, var(--el-color-primary));
  border: 1px solid currentColor; border-radius: 999px;
  padding: 2px 10px; flex: none;
}
.food-card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.food-tag {
  font-size: 12px; color: var(--hq, var(--el-color-primary));
  background: color-mix(in srgb, var(--hq, var(--el-color-primary)) 10%, transparent);
  border-radius: 999px; padding: 2px 10px;
}
.food-card-note { margin-top: 12px; color: var(--ink2, #555); font-size: 14px; line-height: 1.7; }

.food-empty {
  margin-top: 20px; padding: 24px; text-align: center;
  color: var(--ink3, #888);
  border: 1px dashed var(--line2, #dcdcdc); border-radius: var(--r-m, 8px);
}
</style>