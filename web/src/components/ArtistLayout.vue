<template>
  <div class="artist-layout">
    <!-- 侧边栏（桌面） -->
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="logo" @click="$router.push('/dashboard')">🎨 约稿后台</div>
      <el-menu :default-active="$route.path" router class="menu">
        <el-menu-item index="/dashboard">📊 仪表盘</el-menu-item>
        <el-menu-item index="/queue">📋 排期看板</el-menu-item>
        <el-menu-item index="/orders">📦 订单管理</el-menu-item>
        <el-menu-item index="/manual-order">✍ 手动录单</el-menu-item>
        <el-divider />
        <el-menu-item index="/tiers">💰 价格管理</el-menu-item>
        <el-menu-item index="/artworks">🖼 作品管理</el-menu-item>
        <el-menu-item index="/rules">📜 须知编辑</el-menu-item>
        <el-menu-item index="/settings">⚙ 主页设置</el-menu-item>
        <el-divider />
        <el-menu-item @click="logout">🚪 退出登录</el-menu-item>
      </el-menu>
    </aside>

    <!-- 遮罩（移动端） -->
    <div class="overlay" v-if="menuOpen" @click="menuOpen = false"></div>

    <!-- 主内容区 -->
    <main class="main">
      <header class="topbar">
        <el-button class="menu-btn" @click="menuOpen = !menuOpen" text>☰</el-button>
        <span class="page-title">{{ $route.meta.title }}</span>
        <span class="artist-name">{{ store.artistName }}</span>
      </header>
      <div class="content">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useArtistStore } from '../stores/artist.js'

const router = useRouter()
const store = useArtistStore()
const menuOpen = ref(false)

function logout() {
  store.logout()
  router.push('/login')
}
</script>

<style scoped>
.artist-layout { display: flex; min-height: 100vh; }

.sidebar {
  width: 220px; background: #1d1e2c; color: white;
  position: fixed; top: 0; left: 0; bottom: 0; z-index: 100;
  transition: transform 0.3s;
}
.logo {
  padding: 20px; font-size: 18px; font-weight: bold;
  cursor: pointer; text-align: center;
}
.menu { border: none; background: transparent; }
.menu .el-menu-item { color: rgba(255,255,255,0.7); }
.menu .el-menu-item:hover, .menu .el-menu-item.is-active {
  color: white; background: rgba(255,255,255,0.1);
}
.el-divider { border-color: rgba(255,255,255,0.1); }

.main { flex: 1; margin-left: 220px; background: #f5f5f5; }
.topbar {
  background: white; padding: 12px 20px;
  display: flex; align-items: center; gap: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  position: sticky; top: 0; z-index: 50;
}
.page-title { font-weight: 500; flex: 1; }
.artist-name { color: #999; font-size: 14px; }
.menu-btn { display: none; font-size: 20px; }

.content { padding: 20px; max-width: 1200px; }

.overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.5); z-index: 99;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .menu-btn { display: block; }
  .overlay { display: block; }
  .content { padding: 12px; }
}
</style>
