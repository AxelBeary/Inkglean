<template>
  <div class="artist-layout">
    <el-container style="min-height: 100vh">
      <!-- 侧边栏 -->
      <el-aside width="220px" class="sidebar">
        <!-- Logo -->
        <div class="logo">
          <img :src="logoUrl" alt="绘约" class="logo-img" />
          <span class="logo-text font-display">{{ $t('menu.logo') }}</span>
        </div>

        <!-- 菜单 -->
        <el-menu :default-active="activeMenu" router class="sidebar-menu">
          <el-menu-item index="/dashboard">
            <el-icon><Odometer /></el-icon>
            <span>{{ $t('menu.dashboard') }}</span>
          </el-menu-item>
          <el-menu-item index="/queue">
            <el-icon><List /></el-icon>
            <span>{{ $t('menu.queue') }}</span>
          </el-menu-item>
          <el-menu-item index="/orders">
            <el-icon><Box /></el-icon>
            <span>{{ $t('menu.orders') }}</span>
          </el-menu-item>
          <el-menu-item index="/manual-order">
            <el-icon><EditPen /></el-icon>
            <span>{{ $t('menu.manualOrder') }}</span>
          </el-menu-item>
          <el-menu-item index="/tiers">
            <el-icon><Money /></el-icon>
            <span>{{ $t('menu.tiers') }}</span>
          </el-menu-item>
          <el-menu-item index="/artworks">
            <el-icon><Picture /></el-icon>
            <span>{{ $t('menu.artworks') }}</span>
          </el-menu-item>
          <el-menu-item index="/rules">
            <el-icon><Document /></el-icon>
            <span>{{ $t('menu.rules') }}</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>{{ $t('menu.settings') }}</span>
          </el-menu-item>
        </el-menu>

        <!-- 底部：身份区 + 偏好 -->
        <div class="sidebar-footer">
          <div class="identity">
            <div class="avatar" :style="{ background: accentColor }">
              {{ avatarChar }}
            </div>
            <div class="identity-info">
              <span class="identity-name">{{ store.artistName }}</span>
              <span class="identity-status">
                <i class="status-dot" :class="statusClass"></i>
                {{ $t(`common.statusShort.${store.profile?.status || 'open'}`) }}
              </span>
            </div>
          </div>
          <div class="footer-actions">
            <ThemePicker />
            <el-button text size="small" @click="logout" class="logout-btn">
              {{ $t('menu.logout') }}
            </el-button>
          </div>
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
import { useThemeStore } from '../stores/theme.js'
import { Odometer, List, Box, EditPen, Money, Picture, Document, Setting } from '@element-plus/icons-vue'
import ThemePicker from './ThemePicker.vue'
import logoUrl from '../assets/logo.webp'

const route = useRoute()
const router = useRouter()
const store = useArtistStore()
const themeStore = useThemeStore()

const activeMenu = computed(() => route.path)

const ACCENT_COLORS = { '1': '#34dbcb', '2': '#34c2db', '3': '#3498db', '4': '#346edb', '5': '#3445db' }
const accentColor = computed(() => ACCENT_COLORS[themeStore.accent] || '#34dbcb')

const avatarChar = computed(() => (store.artistName || '?')[0].toUpperCase())

const statusClass = computed(() => {
  const s = store.profile?.status || 'open'
  return { open: 'dot-success', full: 'dot-warning', break: 'dot-danger' }[s] || 'dot-success'
})

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

/* Logo */
.logo {
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-img {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 1px var(--border-color);
}
.logo-text {
  font-size: 18px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: 0.1em;
}

/* 菜单 */
.sidebar-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  --el-menu-active-color: var(--color-primary);
  --el-menu-hover-bg-color: var(--bg-hover);
}
.sidebar-menu .el-menu-item {
  height: 44px;
  line-height: 44px;
  margin: 2px 8px;
  border-radius: 8px;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.sidebar-menu .el-menu-item.is-active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
  position: relative;
}
.sidebar-menu .el-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: 0; top: 8px; bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-primary);
}

/* 底部身份区 */
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.identity-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.identity-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity-status {
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-dot {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
}
.dot-success { background: var(--color-success); }
.dot-warning { background: var(--color-warning); }
.dot-danger { background: var(--color-danger); }

.footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logout-btn { color: var(--text-secondary); font-size: 12px; }

/* 主内容区 */
.main-content {
  background: var(--bg-page);
  padding: 24px;
  transition: background 0.3s;
}
</style>
