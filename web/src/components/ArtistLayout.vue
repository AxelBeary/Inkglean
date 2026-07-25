<template>
  <div class="artist-layout">
    <el-container style="min-height: 100vh">
      <!-- 侧边栏 -->
      <el-aside width="220px" class="sidebar">
        <div class="logo">
          <span class="logo-icon">🎨</span>
          <span class="logo-text">{{ $t('menu.logo') }}</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          router
          class="sidebar-menu"
        >
          <el-menu-item index="/dashboard">
            <span>{{ $t('menu.dashboard') }}</span>
          </el-menu-item>
          <el-menu-item index="/queue">
            <span>{{ $t('menu.queue') }}</span>
          </el-menu-item>
          <el-menu-item index="/orders">
            <span>{{ $t('menu.orders') }}</span>
          </el-menu-item>
          <el-menu-item index="/manual-order">
            <span>{{ $t('menu.manualOrder') }}</span>
          </el-menu-item>
          <el-menu-item index="/tiers">
            <span>{{ $t('menu.tiers') }}</span>
          </el-menu-item>
          <el-menu-item index="/artworks">
            <span>{{ $t('menu.artworks') }}</span>
          </el-menu-item>
          <el-menu-item index="/rules">
            <span>{{ $t('menu.rules') }}</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <span>{{ $t('menu.settings') }}</span>
          </el-menu-item>
        </el-menu>
        <div class="sidebar-footer">
          <ThemeToggle />
          <el-button text @click="logout" class="logout-btn">
            {{ $t('menu.logout') }}
          </el-button>
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <slot />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArtistStore } from '../stores/artist.js'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const store = useArtistStore()

const activeMenu = computed(() => route.path)

function logout() {
  store.logout()
  router.push('/login')
}
</script>

<style scoped>
.sidebar {
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: background 0.3s, border-color 0.3s;
}
.logo {
  padding: 20px 16px;
  font-size: 18px;
  font-weight: bold;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon { font-size: 24px; }
.sidebar-menu {
  flex: 1;
  border-right: none;
  background: transparent;
}
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.logout-btn { color: var(--text-secondary); }
.main-content {
  background: var(--bg-page);
  padding: 24px;
  transition: background 0.3s;
}
</style>
