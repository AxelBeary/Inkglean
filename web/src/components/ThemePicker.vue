<template>
  <div class="pref-group">
    <!-- 主色圆点 → 弹出颜料盒 -->
    <el-popover placement="top" :width="220" trigger="click">
      <template #reference>
        <button
          class="accent-dot" :style="{ background: currentColor }"
          :title="t('pref.theme')" :aria-label="t('pref.theme')"
        ></button>
      </template>

      <div class="picker-body">
        <!-- 底色 -->
        <div class="picker-label">{{ t('pref.base') }}</div>
        <div class="picker-row">
          <button
            v-for="opt in baseOptions" :key="opt.value"
            class="picker-btn" :class="{ active: themeStore.base === opt.value }"
            @click="themeStore.setBase(opt.value)"
          >
            {{ t(opt.label) }}
          </button>
        </div>

        <!-- 主色 -->
        <div class="picker-label">{{ t('pref.accent') }}</div>
        <div class="picker-row">
          <button
            v-for="a in accents" :key="a.id"
            class="accent-swatch" :class="{ active: themeStore.accent === a.id }"
            :style="{ background: a.color }"
            :title="t(a.nameKey)" @click="themeStore.setAccent(a.id); trackEvent('theme_accent_change', { accent: a.id })"
          >
            <span v-if="themeStore.accent === a.id" class="swatch-check">✓</span>
          </button>
        </div>
      </div>
    </el-popover>

    <!-- 语言切换 -->
    <button
      class="lang-btn" @click="toggleLang"
      :title="locale === 'zh-CN' ? 'English' : '中文'"
      :aria-label="locale === 'zh-CN' ? 'Switch to English' : '切换到中文'"
    >
      {{ locale === 'zh-CN' ? 'EN' : '中' }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../stores/theme.js'
import { setLocale } from '../i18n/index.js'
import { trackEvent } from '../utils/track.js'

const { t, locale } = useI18n()
const themeStore = useThemeStore()

const accents = [
  { id: '1', color: '#356B69', nameKey: 'pref.accentNames.teal' },
  { id: '2', color: '#3F5E80', nameKey: 'pref.accentNames.turquoise' },
  { id: '3', color: '#5E5494', nameKey: 'pref.accentNames.blue' },
  { id: '4', color: '#346edb', nameKey: 'pref.accentNames.indigo' },
  { id: '5', color: '#3445db', nameKey: 'pref.accentNames.violet' },
]

const baseOptions = [
  { value: 'auto', label: 'pref.auto' },
  { value: 'light', label: 'pref.light' },
  { value: 'dark', label: 'pref.dark' },
]

const currentColor = computed(() => accents.find(a => a.id === themeStore.accent)?.color || '#356B69')

function toggleLang() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}
</script>

<style scoped>
.pref-group { display: inline-flex; align-items: center; gap: 6px; }

.accent-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid var(--border-color);
  cursor: pointer; transition: transform 0.15s, border-color 0.15s;
}
.accent-dot:hover { transform: scale(1.15); border-color: var(--color-primary); }

.picker-body { display: flex; flex-direction: column; gap: 10px; }
.picker-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--text-secondary); }
.picker-row { display: flex; gap: 6px; }

.picker-btn {
  flex: 1; padding: 4px 0; border: 1px solid var(--border-color);
  border-radius: 6px; background: transparent; cursor: pointer;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--text-secondary);
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}
.picker-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.picker-btn.active {
  border-color: var(--color-primary); color: var(--color-primary);
  background: var(--color-primary-soft);
}

.accent-swatch {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s, border-color 0.15s;
}
.accent-swatch:hover { transform: scale(1.15); }
.accent-swatch.active { border-color: var(--text-primary); }
.swatch-check { color: #fff; font-size: calc(var(--font-scale, 1) * 12px); font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }

.lang-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 1px solid var(--border-color);
  border-radius: 6px; background: transparent; cursor: pointer;
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--text-secondary);
  transition: background 0.2s, border-color 0.2s;
}
.lang-btn:hover { background: var(--bg-hover); border-color: var(--color-primary); }
</style>
