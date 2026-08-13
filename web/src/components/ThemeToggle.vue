<template>
  <!-- v0.38: 画师后台主题切换（REQ-026 §1.2）——太阳/月亮按钮，宣纸 ↔ 墨黑，toast 提示 -->
  <button
    class="artist-theme-btn"
    :class="{ 'artist-theme-btn--ink': themeStore.isArtistInk }"
    :title="themeStore.isArtistInk ? t('pref.artistToPaper') : t('pref.artistToInk')"
    :aria-label="themeStore.isArtistInk ? t('pref.artistToPaper') : t('pref.artistToInk')"
    @click="onToggle"
  >
    <span class="ati ati-sun" aria-hidden="true"></span>
    <span class="ati ati-moon" aria-hidden="true"></span>
  </button>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useThemeStore } from '../stores/theme.js'

const { t } = useI18n()
const themeStore = useThemeStore()

/** 切换宣纸/墨黑 + toast「已切换 · 宣纸/墨黑」（REQ §1.2 切换交互）
 *  K1（波2，灰沼教训）：换肤即时切换，不再挂 .theme-animating 瞬态过渡——
 *  颜色变量各自插值会致前景/背景不同步，产生不可读中间态（artist-tokens.css 已同步拆除） */
function onToggle() {
  themeStore.toggleArtistTheme()
  ElMessage.success(
    themeStore.isArtistInk ? t('pref.artistToastInk') : t('pref.artistToastPaper')
  )
}
</script>

<style scoped>
.artist-theme-btn {
  position: relative;
  width: 34px; height: 34px;
  border: 1px solid var(--line2, var(--border-color));
  border-radius: 8px;
  background: var(--card, var(--bg-card));
  display: grid; place-items: center;
  cursor: pointer;
  color: var(--ink2, var(--text-secondary));
  /* K1（波2，灰沼教训）：按钮自身背景/边框随主题即时切换，不插值；仅 hover/按压微交互保留 */
  transition: color var(--dur-fast), box-shadow var(--dur-fast), transform var(--dur-fast) ease-out;
}
/* 点名1: 主题开关按钮按压反馈（克制动效批同款 0.15s ease-out） */
.artist-theme-btn:active { transform: scale(0.98); }
.artist-theme-btn:hover {
  color: var(--ink, var(--text-primary));
  box-shadow: var(--sh-1, 0 1px 2px rgba(0, 0, 0, .06));
}
/* 太阳/月亮图标：纯 CSS 图形，切换时旋转淡入淡出（提案 v2 同款动效） */
.ati {
  position: absolute;
  width: 15px; height: 15px;
  transition: opacity .4s cubic-bezier(.3, 1.3, .4, 1), transform .4s cubic-bezier(.3, 1.3, .4, 1);
}
/* 太阳：圆 + 八向光线 */
.ati-sun::before {
  content: ''; position: absolute; inset: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 -6.5px 0 -5.6px, 0 6.5px 0 -5.6px, -6.5px 0 0 -5.6px, 6.5px 0 0 -5.6px,
    -4.6px -4.6px 0 -5.6px, 4.6px -4.6px 0 -5.6px, -4.6px 4.6px 0 -5.6px, 4.6px 4.6px 0 -5.6px;
}
/* 月亮：双圆遮罩 */
.ati-moon {
  border-radius: 50%;
  box-shadow: inset -3.5px 2.5px 0 0 currentColor;
  opacity: 0;
  transform: rotate(-90deg) scale(.4);
}
/* 墨黑主题：显示月亮，隐藏太阳 */
.artist-theme-btn--ink .ati-sun { opacity: 0; transform: rotate(90deg) scale(.4); }
.artist-theme-btn--ink .ati-moon { opacity: 1; transform: none; }
</style>
