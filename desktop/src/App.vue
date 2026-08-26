<script setup lang="ts">
// 825 波0：应用壳瘦身为路由出口；登录态与页面结构归各视图管。
// 原脚手架桥接自检页随路由化退役（桥接能力由 bridge 单测与登录链实测覆盖）。
// 826：字号偏好全局施加——组件尺寸皆为定值，经 zoom 整体缩放（登录/首页/悬浮窗全覆盖；
// 每窗独立 JS 上下文读同一 localStorage，多窗一致）。
// 826 壳层商业化批：启动即把关闭行为偏好同步到壳层（不依赖菜单渲染，保证 Alt+F4 等路径也能命中）。
// 波13：主题施加——偏好 × 系统深色 → html[data-desktop-theme]，系统外观变化即时跟随。
import { onMounted, onUnmounted, watchEffect } from 'vue'
import { usePrefsStore } from './stores/prefs'
import { isDesktop, readCloseBehaviorPref, setCloseBehavior } from './bridge'
import { resolveTheme, applyThemeToDom } from './tools/theme'

const prefs = usePrefsStore()
watchEffect(() => {
  // zoom 为 Chromium（WebView2）支持的缩放属性；基准 16px，14~20 对应 0.875~1.25
  document.documentElement.style.setProperty('zoom', String(prefs.prefs.fontSize / 16))
})

// ─── 主题（波13）：偏好变化/系统深浅色变化都即时施加 ───
const darkMq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
function applyTheme() {
  applyThemeToDom(resolveTheme(prefs.prefs.theme, darkMq?.matches ?? false))
}
watchEffect(() => {
  // 订阅偏好（watchEffect 自动追踪）；系统侧由下方 mq 监听补位
  void prefs.prefs.theme
  applyTheme()
})
function onSystemThemeChange() { applyTheme() }

onMounted(() => {
  darkMq?.addEventListener('change', onSystemThemeChange)
  // 纯浏览器/同步失败都静默（偏好默认即退出，同步不上不造成危险态）
  if (isDesktop()) setCloseBehavior(readCloseBehaviorPref()).catch(() => {})
})
onUnmounted(() => {
  darkMq?.removeEventListener('change', onSystemThemeChange)
})
</script>

<template>
  <router-view />
</template>

<style>
/* 全局底：纸墨纸色铺底，字体栈走 token */
:root {
  font-family: var(--f-b);
  font-size: 16px;
  line-height: 1.5;
  color: var(--ink);
  background-color: var(--paper);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
body { margin: 0; }
/* 按钮底子：去浏览器默认样式（裸边框毛坯的源头），外观一律由各件纸墨样式接管（826 终验整改） */
button {
  font: inherit; color: inherit; background: none; border: none; padding: 0;
  cursor: pointer;
}
button:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
</style>
