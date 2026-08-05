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

/** 切换宣纸/墨黑 + toast「已切换 · 宣纸/墨黑」（REQ §1.2 切换交互） */
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
  transition: color .15s, transform .15s, box-shadow .15s, background-color .35s, border-color .35s;
}
.artist-theme-btn:hover {
  color: var(--ink, var(--text-primary));
  transform: translateY(-1px);
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
