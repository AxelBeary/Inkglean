<template>
  <!-- 顶栏：仅移动端显示（页面标题 + 主题切换 + 语言 + 汉堡按钮）；桌面端已回侧边栏底部
       F-09 巨型文件拆分：自 ArtistLayout.vue 原样搬入（含拆分前 header 与按钮的双重 v-if 原样保留）。
       isMobile / 页面标题 / 抽屉显隐仍由 ArtistLayout 计算与持有（v-model=drawerVisible）；
       右侧主题/公告/语言 trio 由父页经默认槽注入（ArtistLayout 传 <LayoutTools>，动作与数据都留在父页）。 -->
  <header class="topbar" v-if="isMobile">
    <button
      v-if="isMobile"
      class="mobile-menu-btn"
      :aria-label="$t('menu.openMenu')"
      @click="drawerVisible = true"
    >
      <el-icon :size="20"><Operation /></el-icon>
    </button>
    <span class="topbar-title font-display">{{ pageTitle }}</span>
    <div class="topbar-actions"><slot /></div>
  </header>
</template>

<script setup lang="ts">
// 样式随元素搬迁：ArtistLayout.vue 中 .topbar/.topbar-title/.topbar-actions/.mobile-menu-btn/
// @media (max-width:600px) .topbar / .artist-scope .mobile-menu-btn 规则逐字搬入本文件。
import { Operation } from '@element-plus/icons-vue'

/** 移动端抽屉显隐（沿用拆分前父页变量名：汉堡按钮 @click 口径逐字不变） */
const drawerVisible = defineModel({ type: Boolean, default: false })

defineProps({
  /** ≤600px 移动端判定（matchMedia 监听留在 ArtistLayout） */
  isMobile: { type: Boolean, default: false },
  /** 当前路由对应的页面标题（pageTitle 留在 ArtistLayout 计算） */
  pageTitle: { type: String, default: '' }
})
</script>

<style scoped>
/* ─── 顶栏（含主题切换按钮，REQ §三.1） ─── */
.topbar {
  position: sticky; top: 0; z-index: 50;
  height: 54px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 0 26px;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.topbar-title {
  font-size: calc(var(--font-scale, 1) * 17px); font-weight: 700;
  color: var(--ink);
  letter-spacing: .02em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topbar-actions { display: flex; align-items: center; gap: 10px; }

/* R21: 移动端汉堡按钮（顶栏内左侧） */
.mobile-menu-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border: 1px solid var(--line2);
  border-radius: 9px;
  background: var(--card);
  color: var(--ink);
  cursor: pointer;
  flex: none;
  /* K1（波2，灰沼教训）：背景随主题即时切换，不插值 */
  transition: box-shadow var(--dur-fast);
}
.mobile-menu-btn:hover { box-shadow: var(--sh-1); }

@media (max-width: 600px) {
  .topbar { padding: 0 14px; }
}

/* 克制动效批（2026-08-07 用户反馈批：按钮按压 ≤0.2s ease-out；自 ArtistLayout.vue 逐字复制） */
.artist-scope .mobile-menu-btn { transition: box-shadow var(--dur-fast), transform var(--dur-fast) ease-out; }
.artist-scope .mobile-menu-btn:active { transform: scale(0.98); }
</style>
