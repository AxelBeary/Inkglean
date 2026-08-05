<template>
  <div class="admin-layout">
    <!-- #68: 顶部 Tab 轻量导航（管理端页面少，不用侧边栏） -->
    <div class="admin-nav">
      <div class="admin-nav-inner">
        <el-button text class="admin-back" @click="$router.push('/dashboard')">
          ← {{ $t('admin.backToAdmin') }}
        </el-button>
        <el-tabs v-model="activeTab" class="admin-tabs" @tab-change="onTabChange">
          <el-tab-pane
            v-for="tab in tabs" :key="tab.path"
            :label="$t(tab.labelKey)" :name="tab.path"
          />
        </el-tabs>
      </div>
    </div>
    <div class="admin-body">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '../../stores/theme.js'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()

// v0.38 第二批: 管理后台同属后台域，启用纸墨 token 作用域（REQ-026）。
// 复用第一批 enter/leave 机制（机制不动）：挂载挂 html[data-artist-theme]，卸载摘除。
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())

const tabs = [
  { path: '/admin', labelKey: 'admin.panelTitle' },
  { path: '/admin/artists', labelKey: 'admin.artistManage' },
  { path: '/admin/greetings', labelKey: 'admin.greetingManage' },
  { path: '/admin/default-workflow', labelKey: 'admin.defaultWorkflow' },
  // REQ-022 F2: 社交平台管理
  { path: '/admin/platforms', labelKey: 'admin.platformManage' },
  { path: '/admin/health', labelKey: 'admin.health.title' }
]

const activeTab = computed(() => route.path)

function onTabChange(path) {
  router.push(path)
}
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026，管理后台从简套 token） ═══ */
.admin-layout {
  min-height: 100vh;
  background: var(--paper);
}
.admin-nav {
  background: var(--card);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 10;
}
.admin-nav-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 8px 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-back {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--ink2);
}
.admin-tabs {
  flex: 1;
  min-width: 0;
}
/* el-tabs 底部边线与导航栏底边重合 */
.admin-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.admin-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
/* 移动端 Tab 横向滚动 */
.admin-tabs :deep(.el-tabs__nav-scroll) {
  overflow-x: auto;
}
.admin-body {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
}
</style>
