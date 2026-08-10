<template>
  <el-config-provider :locale="elLocale">
    <!-- 点名2: 路由切换 fade-slide（.18s 淡入 + 8px 上移，克制；out-in 避免新旧同帧）
         02C: 后台路由（requiresAuth）整页不过渡——布局含侧边栏保持稳定，内容区过渡由 ArtistLayout 内部处理；
         客户端路由保留 fade-slide 整页过渡 -->
    <router-view v-slot="{ Component }">
      <template v-if="noPageTransition">
        <component :is="Component" />
      </template>
      <template v-else>
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" :key="$route.path" />
        </transition>
      </template>
    </router-view>
  </el-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()
const elLocale = computed(() => locale.value === 'zh-CN' ? zhCn : en)

// 02C: 后台路由（requiresAuth）整页不过渡——布局含侧边栏保持稳定，内容区过渡在 ArtistLayout 内部；
//      客户端路由保留 fade-slide 整页过渡。
// 登录页一并豁免：自带入场编排（rise/山水墨晕染），且 fade-slide 的 translateY(8px)
// 会把 100vh 页面推出视口，加载瞬间滚动条闪现、落定后消失（用户反馈）。
const route = useRoute()
const noPageTransition = computed(() => !!route.meta.requiresAuth || route.name === 'ArtistLogin')
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
  transition: background 0.3s, color 0.3s;
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
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .el-dialog { width: 90% !important; }
}
</style>
