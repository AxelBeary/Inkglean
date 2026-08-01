<template>
  <div class="artist-layout">
    <el-container style="min-height: 100vh">
      <!-- 侧边栏（R21: 可折叠，移动端隐藏） -->
      <el-aside v-show="!isMobile" :width="asideWidth" class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
        <!-- Logo + 折叠按钮 -->
        <div class="logo">
          <img :src="logoUrl" alt="绘约" class="logo-img" />
          <span v-show="!collapsed" class="logo-text font-display">{{ $t('menu.logo') }}</span>
          <button
            class="collapse-btn"
            :title="collapsed ? $t('menu.expand') : $t('menu.collapse')"
            :aria-label="collapsed ? $t('menu.expand') : $t('menu.collapse')"
            @click="toggleCollapse"
          >
            <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          </button>
        </div>

        <!-- 菜单（R21: collapse 模式图标化，悬停 tooltip 显示文字） -->
        <el-menu :default-active="activeMenu" :collapse="collapsed" router class="sidebar-menu">
          <!-- REQ-016 C: 菜单分组（工作/经营/门面），折叠态 group 标题自动隐藏 -->
          <el-menu-item-group v-for="group in menuGroups" :key="group.labelKey">
            <template #title><span class="menu-group-title">{{ $t(group.labelKey) }}</span></template>
            <el-menu-item v-for="item in group.items" :key="item.index" :index="item.index">
              <!-- #1: 角标（待审核留言数）包裹图标，折叠态同样可见 -->
              <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="menu-badge">
                <el-icon><component :is="item.icon" /></el-icon>
              </el-badge>
              <span>{{ $t(item.labelKey) }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>

        <!-- 底部：身份区 + 偏好 -->
        <div class="sidebar-footer">
          <!-- 展开态：完整身份区 -->
          <template v-if="!collapsed">
            <div class="identity">
              <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
              <div v-else class="avatar" :style="{ background: accentColor }">
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
          </template>
          <!-- R21 折叠态：头像图标化，状态/登出收入 tooltip -->
          <template v-else>
            <el-tooltip placement="right" effect="light" :hide-after="200">
              <template #content>
                <div class="identity-tooltip">
                  <strong class="identity-tooltip-name">{{ store.artistName }}</strong>
                  <span class="identity-status">
                    <i class="status-dot" :class="statusClass"></i>
                    {{ $t(`common.statusShort.${store.profile?.status || 'open'}`) }}
                  </span>
                  <el-button text size="small" type="danger" @click="logout">
                    {{ $t('menu.logout') }}
                  </el-button>
                </div>
              </template>
              <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img avatar--mini" alt="" />
              <div v-else class="avatar avatar--mini" :style="{ background: accentColor }">
                {{ avatarChar }}
              </div>
            </el-tooltip>
          </template>
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <!-- R21: 移动端汉堡按钮（≤600px 侧边栏隐藏后唤出抽屉） -->
        <button
          v-if="isMobile"
          class="mobile-menu-btn"
          :aria-label="$t('menu.openMenu')"
          @click="drawerVisible = true"
        >
          <el-icon :size="20"><Operation /></el-icon>
        </button>
        <slot />
      </el-main>
    </el-container>

    <!-- R21: 移动端抽屉导航 -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="260px" :show-close="false" class="mobile-drawer">
      <template #header>
        <div class="drawer-header">
          <img :src="logoUrl" alt="绘约" class="logo-img" />
          <span class="logo-text font-display">{{ $t('menu.logo') }}</span>
        </div>
      </template>
      <el-menu :default-active="activeMenu" router class="drawer-menu" @select="drawerVisible = false">
        <!-- REQ-016 C: 抽屉与侧边栏同分组 -->
        <el-menu-item-group v-for="group in menuGroups" :key="group.labelKey">
          <template #title><span class="menu-group-title">{{ $t(group.labelKey) }}</span></template>
          <el-menu-item v-for="item in group.items" :key="item.index" :index="item.index">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ $t(item.labelKey) }}</span>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>
      <div class="drawer-footer">
        <div class="identity">
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
          <div v-else class="avatar" :style="{ background: accentColor }">{{ avatarChar }}</div>
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
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArtistStore } from '../stores/artist.js'
import { useThemeStore } from '../stores/theme.js'
import { artistApi } from '../api/index.js'
import { Odometer, List, Box, Money, Picture, Setting, Expand, Fold, Operation, Management, ChatLineSquare, Tickets } from '@element-plus/icons-vue'
import ThemePicker from './ThemePicker.vue'
import logoUrl from '../assets/logo.webp'

const route = useRoute()
const router = useRouter()
const store = useArtistStore()
const themeStore = useThemeStore()

const activeMenu = computed(() => route.path)

// ─── R21: 菜单项注册表（侧边栏与抽屉共用） ───
// REQ-016 C: 手动录单移出菜单（订单管理页已有按钮），菜单分三组：工作/经营/门面
const BASE_MENU_ITEMS = [
  { index: '/dashboard', icon: Odometer, labelKey: 'menu.dashboard', group: 'work' },
  { index: '/queue', icon: List, labelKey: 'menu.queue', group: 'work' },
  { index: '/orders', icon: Box, labelKey: 'menu.orders', group: 'work' },
  // v0.26 C: 开稿管理（排期看板后面）
  { index: '/slots', icon: Tickets, labelKey: 'menu.slots', group: 'biz' },
  { index: '/tiers', icon: Money, labelKey: 'menu.tiers', group: 'biz' },
  { index: '/artworks', icon: Picture, labelKey: 'menu.artworks', group: 'biz' },
  // #1: 留言管理（作品管理下方，待审核角标）
  { index: '/guestbook', icon: ChatLineSquare, labelKey: 'menu.guestbook', hasBadge: true, group: 'biz' },
  // R42b: 须知编辑合并进设置页，菜单项移除
  { index: '/settings', icon: Setting, labelKey: 'menu.settings', group: 'front' }
]
// #1: 待审核留言数（onMounted 调一次 messages 取 pending 计数）
const pendingMsgCount = ref(0)
// UI-7: 管理员追加"管理后台"入口
// REQ-016 C: 菜单分组渲染（工作/经营/门面），管理员后台追加到门面组
const MENU_GROUPS = [
  { key: 'work', labelKey: 'menu.groupWork' },
  { key: 'biz', labelKey: 'menu.groupBiz' },
  { key: 'front', labelKey: 'menu.groupFront' }
]
const menuGroups = computed(() => {
  const items = BASE_MENU_ITEMS.map(item =>
    item.hasBadge ? { ...item, badge: pendingMsgCount.value } : item
  )
  if (store.isAdmin) {
    items.push({ index: '/admin', icon: Management, labelKey: 'menu.admin', group: 'front' })
  }
  return MENU_GROUPS.map(g => ({
    ...g,
    items: items.filter(item => item.group === g.key)
  }))
})

// ─── R21: 折叠状态管理 ───
const SIDEBAR_KEY = 'sidebar_collapsed'
/** 用户手动折叠偏好（localStorage 持久化，桌面默认展开） */
const userCollapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1')
/** ≤900px 窄屏（自动收起为图标窄条） */
const isNarrow = ref(window.matchMedia('(max-width: 900px)').matches)
/** ≤600px 移动端（侧边栏完全隐藏，汉堡按钮 + 抽屉） */
const isMobile = ref(window.matchMedia('(max-width: 600px)').matches)
const drawerVisible = ref(false)

const mqNarrow = window.matchMedia('(max-width: 900px)')
const mqMobile = window.matchMedia('(max-width: 600px)')
function onNarrowChange(e) { isNarrow.value = e.matches }
function onMobileChange(e) { isMobile.value = e.matches }

onMounted(() => {
  mqNarrow.addEventListener('change', onNarrowChange)
  mqMobile.addEventListener('change', onMobileChange)
  // #1: 侧边栏待审核留言角标（调一次 messages，失败静默——角标非关键路径）
  if (store.loggedIn) {
    artistApi.getMessages()
      .then(list => { pendingMsgCount.value = (list || []).filter(m => m.status === 'pending').length })
      .catch(() => {})
  }
})
onUnmounted(() => {
  mqNarrow.removeEventListener('change', onNarrowChange)
  mqMobile.removeEventListener('change', onMobileChange)
})

// 窗口变宽时自动关闭抽屉
watch(isMobile, (mobile) => { if (!mobile) drawerVisible.value = false })

/** 实际折叠状态：窄屏强制折叠，否则尊重用户偏好 */
const collapsed = computed(() => isNarrow.value || userCollapsed.value)
const asideWidth = computed(() => collapsed.value ? '64px' : '220px')

function toggleCollapse() {
  userCollapsed.value = !userCollapsed.value
  localStorage.setItem(SIDEBAR_KEY, userCollapsed.value ? '1' : '0')
}

// ─── 原有逻辑 ───
const ACCENT_COLORS = { '1': '#34dbcb', '2': '#34c2db', '3': '#3498db', '4': '#346edb', '5': '#3445db' }
const accentColor = computed(() => ACCENT_COLORS[themeStore.accent] || '#34dbcb')

const avatarChar = computed(() => (store.artistName || '?')[0].toUpperCase())
/** 画师上传头像优先显示，未设置时回退文字头像 */
const avatarUrl = computed(() => store.profile?.avatar ? `/uploads/${store.profile.avatar}` : '')

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
  overflow: hidden;
  transition: width 0.2s ease, background 0.3s, border-color 0.3s;
}

/* Logo */
.logo {
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.sidebar--collapsed .logo {
  flex-direction: column;
  padding: 16px 8px;
  gap: 8px;
}
.logo-img {
  width: 36px; height: 36px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 1px var(--border-color);
  flex-shrink: 0;
}
.logo-text {
  font-size: 18px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: 0.1em;
  white-space: nowrap;
}
/* R21: 折叠按钮 */
.collapse-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--text-secondary);
  cursor: pointer; flex-shrink: 0;
  margin-left: auto;
  transition: background 0.15s, color 0.15s;
}
.collapse-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.sidebar--collapsed .collapse-btn { margin-left: 0; }

/* 菜单 */
.sidebar-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  --el-menu-active-color: var(--color-primary);
  --el-menu-hover-bg-color: var(--bg-hover);
}
/* REQ-016 C: 菜单分组标题 */
.menu-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #999);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
/* 展开态撑满 220px；折叠态 el-menu 原生 64px */
.sidebar-menu:not(.el-menu--collapse) { width: 220px; }
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
/* R21: 折叠态底部居中 */
.sidebar--collapsed .sidebar-footer {
  align-items: center;
  padding: 12px 8px;
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
/* R21: 折叠态头像（可悬停查看身份） */
.avatar--mini { cursor: pointer; transition: transform 0.15s; }
.avatar--mini:hover { transform: scale(1.1); }
.avatar--img { object-fit: cover; }
.identity-tooltip {
  display: flex; flex-direction: column;
  align-items: flex-start; gap: 6px;
}
.identity-tooltip-name { font-size: 13px; }
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

/* R21: 移动端汉堡按钮 */
.mobile-menu-btn {
  position: fixed;
  top: 12px; left: 12px;
  z-index: 100;
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.15s, background 0.3s;
}
.mobile-menu-btn:hover { box-shadow: var(--shadow-card-hover); }
@media (max-width: 600px) {
  .main-content { padding-top: 64px; }
}

/* R21: 移动端抽屉 */
.mobile-drawer :deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  padding: 0;
}
.drawer-header { display: flex; align-items: center; gap: 10px; }
.drawer-menu {
  border-right: none;
  flex: 1;
  --el-menu-active-color: var(--color-primary);
  --el-menu-hover-bg-color: var(--bg-hover);
}
.drawer-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
