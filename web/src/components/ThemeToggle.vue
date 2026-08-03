<template>
  <div class="pref-group">
    <button
      class="theme-btn" @click="themeStore.toggle()" :title="isDark ? t('pref.toLight') : t('pref.toDark')"
      :aria-label="isDark ? t('pref.toLight') : t('pref.toDark')"
    >
      <span class="theme-icon" :class="isDark ? 'theme-icon--sun' : 'theme-icon--moon'" aria-hidden="true"></span>
    </button>
    <button
      class="lang-btn" @click="toggleLang" :title="locale === 'zh-CN' ? 'English' : '中文'"
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

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const isDark = computed(() => themeStore.theme === 'dark')

function toggleLang() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}
</script>

<style scoped>
.pref-group { display: inline-flex; align-items: center; gap: 6px; }
.theme-btn, .lang-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 1px solid var(--border-color);
  border-radius: 6px; background: transparent; cursor: pointer;
  font-size: 14px; color: var(--text-secondary);
  transition: background 0.2s, border-color 0.2s;
}
.theme-btn:hover, .lang-btn:hover { background: var(--bg-hover); border-color: var(--el-color-primary); }
.lang-btn { font-size: 12px; font-weight: 600; }
/* v0.34 任务F：亮暗主题切换图标改为纯 CSS 图形（太阳=圆+光线，月亮=双圆遮罩） */
.theme-icon { position: relative; width: 14px; height: 14px; display: inline-block; }
.theme-icon--sun::before {
  content: ''; position: absolute; inset: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 -6px 0 -5.4px, 0 6px 0 -5.4px, -6px 0 0 -5.4px, 6px 0 0 -5.4px,
    -4.2px -4.2px 0 -5.4px, 4.2px -4.2px 0 -5.4px, -4.2px 4.2px 0 -5.4px, 4.2px 4.2px 0 -5.4px;
}
.theme-icon--moon { border-radius: 50%; box-shadow: inset -3px 2px 0 0 currentColor; }
</style>
