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
  // zoom 为 Chromium（WebView2）支持的缩放属性；基准 16px，14~20 对应 0.875~1.25。
  // 827 用户终验实证（zoom-vh-probe.mjs）：zoom 施加后 100vh 按 zoom 倍放大但 innerHeight 不打折，
  // 页面骨架写 100vh 必超窗溢出外层滚动条——同步下发 --app-h＝真实窗高（已÷zoom）供骨架吃，页面内 vh 仅短元素使用不致溢出。
  const zoom = prefs.prefs.fontSize / 16
  document.documentElement.style.setProperty('zoom', String(zoom))
  applyAppHeight(zoom)
})

function applyAppHeight(zoom: number): void {
  // 向下取整：宁差一像素不满（同色纸底看不出），绝不多算一像素——round 一半概率多算亚像素，
  // zoom 放大后成永久小溢出，滚动条永不消失（827 用户终验报障）
  document.documentElement.style.setProperty('--app-h', `${Math.floor(window.innerHeight / zoom)}px`)
}
function onResize(): void {
  applyAppHeight(prefs.prefs.fontSize / 16)
}

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
  window.addEventListener('resize', onResize)
  // 纯浏览器/同步失败都静默（偏好默认即退出，同步不上不造成危险态）
  if (isDesktop()) setCloseBehavior(readCloseBehaviorPref()).catch(() => {})
})
onUnmounted(() => {
  darkMq?.removeEventListener('change', onSystemThemeChange)
  window.removeEventListener('resize', onResize)
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
  /* 827 用户终验整改：真实窗高（已÷字号 zoom），JS 下发+resize 跟随；页面骨架一律吃它不写 100vh（zoom 下 100vh 超窗溢出） */
  --app-h: 100vh;
  /* 卷面间距基准值（定稿原型 :root 同值）。9/4 波1 收口实测根治：
     此前 --gap 只在各页矮窗媒体查询里定义（.stage{--gap:12px}），窗高 >700px 时 var(--gap) 无值
     → gap 塌成 0：题签/卷心/卷尾三段紧贴、订单速览 chips 也贴死（既有缺陷，本批新页同样吃它）。
     矮窗的 .stage{--gap:12px} 仍按媒体查询覆盖本值，默认窗 1200×600 视觉零变化。
     --row 刻意不在此定义：TodayPanel 自带 56px 兜底且已随 826/827 终验定型，动它会改已验收的账本行高。 */
  --gap: 16px;
}
body { margin: 0; }
/* 全局工具类：数字走文楷 + 等宽数字位（原型 .num）。
   9/4 主页重设计波1 从 Home.vue 上移到此处——排期页等懒加载页单独打开时 Home 未必已挂载，
   样式会缺（scoped 之外的全局类必须由常驻壳提供）。 */
.num { font-family: var(--f-d); font-variant-numeric: tabular-nums; line-height: 1.25; }
/* 按钮底子：去浏览器默认样式（裸边框毛坯的源头），外观一律由各件纸墨样式接管（826 终验整改） */
button {
  font: inherit; color: inherit; background: none; border: none; padding: 0;
  cursor: pointer;
}
button:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
</style>
