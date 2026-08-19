<template>
  <el-config-provider :locale="elLocale">
    <!-- 点名2: 路由切换 fade-slide（--dur-fast 淡入 + 8px 上移，克制；out-in 避免新旧同帧）
         02C: 后台路由（requiresAuth）整页不过渡——布局含侧边栏保持稳定，内容区过渡由 ArtistLayout 内部处理；
         客户端路由保留 fade-slide 整页过渡
         login-cross: 登录页↔后台专属过渡（纯透明度长缓动，不位移）——登录成功进后台「渡过去」而非硬切；
         不带 path-key：后台页间同组件不触发过渡，ArtistLayout 全会话单挂载（REQ-037 A1）不破 -->
    <router-view v-slot="{ Component }">
      <transition v-if="loginCross" name="login-cross" mode="out-in">
        <component :is="Component" />
      </transition>
      <transition v-else name="fade-slide" mode="out-in">
        <component :is="Component" :key="$route.path" />
      </transition>
    </router-view>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()
const elLocale = computed(() => locale.value === 'zh-CN' ? zhCn : en)

// K3（波2）：中英切换容器级短淡入——只给根容器 #app 挂一次性 .locale-swap，
// CSS 侧单属性 opacity（.55→1，var(--dur-mid) ease-out），禁止多颜色变量插值；
// 动画结束移除（animationend），300ms 兜底防 reduced-motion 下无事件残留。
let localeSwapTimer: number | undefined
watch(locale, async () => {
  const root = document.getElementById('app')
  if (!root) return
  await nextTick()
  const onSwapEnd = () => {
    root.classList.remove('locale-swap')
    root.removeEventListener('animationend', onSwapEnd)
    clearTimeout(localeSwapTimer)
  }
  root.classList.remove('locale-swap')
  void root.offsetWidth // 连续切换时强制重排，重新触发动画
  root.classList.add('locale-swap')
  root.addEventListener('animationend', onSwapEnd)
  clearTimeout(localeSwapTimer)
  localeSwapTimer = window.setTimeout(onSwapEnd, 300)
})

// 02C: 后台路由（requiresAuth）整页不过渡——布局含侧边栏保持稳定，内容区过渡在 ArtistLayout 内部；
//      客户端路由保留 fade-slide 整页过渡。
// 登录页↔后台（requiresAuth/requiresAdmin）单独走 login-cross：登录成功进后台是一趟「渡过去」的
// 仪式，纯透明度 0.5s 缓动不位移（translateY 会把 100vh 登录页推出视口闪滚动条，v0.46 教训）。
const route = useRoute()
const loginCross = computed(() => route.name === 'ArtistLogin' || !!route.meta.requiresAuth || !!route.meta.requiresAdmin)
</script>

<style>
@import './styles/theme.css';
/* v0.38: 画师后台纸墨 token（scoped html[data-artist-theme]，客户端路由下不生效，见文件头注释） */
@import './styles/artist-tokens.css';

/* ===== 全局基础样式 ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-body);
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  /* 底色不挂 transition：主题切换即时生效（v0.54 教训——变量插值产生灰沼/闪白中间态） */
}

/* 展示字体工具类 */
.font-display {
  font-family: var(--font-display);
}

/* 等宽数字（金额/统计） */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* 金箔金额 */
.text-gold {
  color: var(--color-gold);
  font-variant-numeric: tabular-nums;
}

/* ─── 点名2: 路由切换动效（全局，画师后台/管理后台/客户端通用；克制 .18s 淡入+8px） ─── */
.fade-slide-enter-active,
.fade-slide-leave-active {
  /* T 波：0.18s → --dur-fast(.15s) 就近等值；ease-out 关键字 → --ease-out token */
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
/* v127⑦：leave 阶段即时退场（时长归零）——out-in 模式下旧页淡出结束后新页才开始淡入，
   双 150ms 串联致内容区约 120ms 全空白，视觉上即「进页闪一下」（帧抓拍实测坐实，全后台通病）；
   旧页瞬退后新页照常柔和淡入，空白间隙消失，克制动效纪律不变 */
.fade-slide-leave-active {
  transition-duration: 0s;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ─── login-cross: 登录页↔后台专属过渡（丝滑不做作：纯透明度，离场略快入场略缓） ─── */
/* 登录页自带 240s light-drift 背景动画（scoped，特异性带 data-v 属性），Vue 过渡完成检测会把
   animationTimeout 一并计入，不在此归零会导致离场永远不结束、新页面永不挂载（2026-08-12 E2E 抓出空白屏）；
   !important 是为了压过 scoped 选择器特异性，跨层覆盖的正当用途 */
.login-cross-enter-active {
  /* T 波：登录关键路径——0.55s 原时长保留；cubic-bezier(.22,1,.36,1) 与 --ease-out 同值，token 化 */
  transition: opacity 0.55s var(--ease-out);
}
.login-cross-leave-active {
  /* T 波：登录关键路径——0.4s 原时长保留；无 --ease-in token，ease-in 原样保留 */
  transition: opacity 0.4s ease-in;
  animation: none !important;
}
.login-cross-enter-from,
.login-cross-leave-to {
  opacity: 0;
}

/* K3（波2）：中英切换容器级短淡入——根容器单属性 opacity，禁止多颜色变量插值；
   prefers-reduced-motion 下不播（class 移除由 JS animationend/300ms 兜底） */
.locale-swap {
  animation: locale-swap-in var(--dur-mid) var(--ease-out);
}
@keyframes locale-swap-in {
  from { opacity: 0.55; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .locale-swap { animation: none; }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .el-dialog { width: 90% !important; }
}
</style>
