<template>
  <!-- v0.38: 画师后台骨架重做（REQ-026 §三.1）——纸墨 token 体系
       功能清单不丢：折叠（手动+窄屏自动）、三组导航、留言角标、身份区、登出、移动端抽屉、主题切换、语言切换
       artist-scope 类 = token 作用域标记（artist-tokens.css 过渡规则） -->
  <div class="artist-layout artist-scope">
    <el-container style="min-height: 100vh">
      <!-- 侧边栏（R21: 可折叠，移动端隐藏）——宣纸主题纸色底 / 墨黑主题松烟底（REQ §三.1） -->
      <el-aside v-show="!isMobile" :width="asideWidth" class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
        <!-- 品牌区：朱砂印章「绘」字 + 绘约（文楷）+ BRUSHLINE 副标 -->
        <div class="brand" :class="{ 'brand--collapsed': collapsed }">
          <span class="brand-seal" aria-hidden="true">{{ $t('menu.logoSeal') }}</span>
          <div v-show="!collapsed" class="brand-text">
            <span class="brand-name font-display">{{ $t('menu.logo') }}</span>
            <span class="brand-sub">BRUSHLINE</span>
          </div>
          <button
            class="collapse-btn"
            :title="collapsed ? $t('menu.expand') : $t('menu.collapse')"
            :aria-label="collapsed ? $t('menu.expand') : $t('menu.collapse')"
            @click="toggleCollapse"
          >
            <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          </button>
        </div>

        <!-- 导航（REQ-016 C 三组：工作/经营/门面；激活态花青软底 + 左侧 3px 竖条） -->
        <nav class="nav" :class="{ 'nav--collapsed': collapsed }">
          <div v-for="group in menuGroups" :key="group.labelKey" class="nav-group">
            <div v-show="!collapsed" class="nav-title">{{ $t(group.labelKey) }}</div>
            <template v-for="item in group.items" :key="item.index">
              <el-tooltip
                v-if="collapsed" placement="right" effect="light" :hide-after="200"
                :content="$t(item.labelKey)"
              >
                <div
                  class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
                  role="link" tabindex="0"
                  @click="goMenu(item.index)" @keydown.enter="goMenu(item.index)"
                >
                  <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
                    <el-icon><component :is="item.icon" /></el-icon>
                  </el-badge>
                </div>
              </el-tooltip>
              <div
                v-else
                class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
                role="link" tabindex="0"
                @click="goMenu(item.index)" @keydown.enter="goMenu(item.index)"
              >
                <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
                  <el-icon><component :is="item.icon" /></el-icon>
                </el-badge>
                <span class="nav-label">{{ $t(item.labelKey) }}</span>
              </div>
            </template>
          </div>
        </nav>

        <!-- 底部：身份区 + 登出 + 主题/语言（展开/折叠两态） -->
        <div class="sidebar-footer" :class="{ 'sidebar-footer--collapsed': collapsed }">
          <!-- 展开态：完整身份区 -->
          <template v-if="!collapsed">
            <div class="identity">
              <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
              <div v-else class="avatar">{{ avatarChar }}</div>
              <div class="identity-info">
                <span class="identity-name">{{ store.artistName }}</span>
                <span class="identity-status">
                  <i class="status-dot" :class="statusClass"></i>
                  {{ $t(`common.statusShort.${store.profile?.status || 'open'}`) }}
                </span>
              </div>
            </div>
            <div class="footer-actions">
              <div class="footer-tools">
                <ThemeToggle />
                <button
                  class="lang-btn" @click="toggleLang"
                  :title="locale === 'zh-CN' ? 'English' : '中文'"
                  :aria-label="locale === 'zh-CN' ? 'Switch to English' : '切换到中文'"
                >
                  {{ locale === 'zh-CN' ? 'EN' : '中' }}
                </button>
              </div>
              <el-button text size="small" class="logout-btn" @click="logout">
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
              <div v-else class="avatar avatar--mini">{{ avatarChar }}</div>
            </el-tooltip>
            <div class="collapsed-tools">
              <ThemeToggle />
              <button
                class="lang-btn" @click="toggleLang"
                :title="locale === 'zh-CN' ? 'English' : '中文'"
                :aria-label="locale === 'zh-CN' ? 'Switch to English' : '切换到中文'"
              >
                {{ locale === 'zh-CN' ? 'EN' : '中' }}
              </button>
            </div>
          </template>
        </div>
      </el-aside>

      <!-- 主内容区（顶栏 + 内容） -->
      <el-container>
        <!-- 顶栏：仅移动端显示（页面标题 + 主题切换 + 语言 + 汉堡按钮）；桌面端已回侧边栏底部 -->
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
          <div class="topbar-actions">
            <ThemeToggle />
            <button
              class="lang-btn" @click="toggleLang"
              :title="locale === 'zh-CN' ? 'English' : '中文'"
              :aria-label="locale === 'zh-CN' ? 'Switch to English' : '切换到中文'"
            >
              {{ locale === 'zh-CN' ? 'EN' : '中' }}
            </button>
          </div>
        </header>
        <el-main class="main-content">
          <slot />
        </el-main>
      </el-container>
    </el-container>

    <!-- R21: 移动端抽屉导航 -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="260px" :show-close="false" class="mobile-drawer">
      <template #header>
        <div class="drawer-header">
          <span class="brand-seal" aria-hidden="true">{{ $t('menu.logoSeal') }}</span>
          <span class="brand-name font-display">{{ $t('menu.logo') }}</span>
        </div>
      </template>
      <nav class="nav nav--drawer">
        <div v-for="group in menuGroups" :key="group.labelKey" class="nav-group">
          <div class="nav-title">{{ $t(group.labelKey) }}</div>
          <div
            v-for="item in group.items" :key="item.index"
            class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
            role="link" tabindex="0"
            @click="goMenuDrawer(item.index)" @keydown.enter="goMenuDrawer(item.index)"
          >
            <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
              <el-icon><component :is="item.icon" /></el-icon>
            </el-badge>
            <span class="nav-label">{{ $t(item.labelKey) }}</span>
          </div>
        </div>
      </nav>
      <div class="drawer-footer">
        <div class="identity">
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
          <div v-else class="avatar">{{ avatarChar }}</div>
          <div class="identity-info">
            <span class="identity-name">{{ store.artistName }}</span>
            <span class="identity-status">
              <i class="status-dot" :class="statusClass"></i>
              {{ $t(`common.statusShort.${store.profile?.status || 'open'}`) }}
            </span>
          </div>
        </div>
        <div class="footer-actions">
          <el-button text size="small" class="logout-btn" @click="logout">
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
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../stores/artist.js'
import { useThemeStore } from '../stores/theme.js'
import { setLocale } from '../i18n/index.js'
import { artistApi } from '../api/index.js'
import { Odometer, List, Box, Money, Picture, Setting, Expand, Fold, Operation, Management, ChatLineSquare, Tickets, Document, EditPen } from '@element-plus/icons-vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const store = useArtistStore()
const themeStore = useThemeStore()

// ─── v0.38: 后台主题作用域（token 挂/摘，客户端路由拿不到） ───
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())

// activeMenu：订单详情 /orders/:id 归属「订单管理」高亮（/orders/new 除外）
const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/orders/') && p !== '/orders/new') return '/orders'
  return p
})

// ─── R21: 菜单项注册表（侧边栏与抽屉共用） ───
// REQ-016 C: 手动录单移出菜单（订单管理页已有按钮），菜单分三组：工作/经营/门面
const BASE_MENU_ITEMS = [
  { index: '/dashboard', icon: Odometer, labelKey: 'menu.dashboard', group: 'work' },
  { index: '/queue', icon: List, labelKey: 'menu.queue', group: 'work' },
  { index: '/orders', icon: Box, labelKey: 'menu.orders', group: 'work' },
  // #8: 录单入口归位（从订单管理页移回侧边栏「工作」分组）
  { index: '/orders/new', icon: EditPen, labelKey: 'menu.manualOrder', group: 'work' },
  // v0.26 C: 开稿管理（排期看板后面）
  { index: '/slots', icon: Tickets, labelKey: 'menu.slots', group: 'biz' },
  { index: '/tiers', icon: Money, labelKey: 'menu.tiers', group: 'biz' },
  { index: '/artworks', icon: Picture, labelKey: 'menu.artworks', group: 'biz' },
  // #1: 留言管理（作品管理下方，待审核角标）
  { index: '/guestbook', icon: ChatLineSquare, labelKey: 'menu.guestbook', hasBadge: true, group: 'biz' },
  // R42b: 须知编辑合并进设置页，菜单项移除
  { index: '/settings', icon: Setting, labelKey: 'menu.settings', group: 'front' },
  // #44: 偏好独立导航（主页对外，偏好对内）
  { index: '/preferences', icon: Document, labelKey: 'menu.preferences', group: 'front' }
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

/** 顶栏页面标题：当前路由对应菜单项的 labelKey（详情类页面归属父级） */
const pageTitle = computed(() => {
  const all = BASE_MENU_ITEMS.concat(
    store.isAdmin ? [{ index: '/admin', labelKey: 'menu.admin' }] : []
  )
  const hit = all.find(item => item.index === activeMenu.value)
  return hit ? t(hit.labelKey) : ''
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
const asideWidth = computed(() => collapsed.value ? '64px' : '230px')

function toggleCollapse() {
  userCollapsed.value = !userCollapsed.value
  localStorage.setItem(SIDEBAR_KEY, userCollapsed.value ? '1' : '0')
}

// ─── 导航与操作 ───
function goMenu(index) {
  if (route.path !== index) router.push(index)
}
/** 抽屉导航：点击后关闭抽屉再跳转 */
function goMenuDrawer(index) {
  drawerVisible.value = false
  goMenu(index)
}

function toggleLang() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}

// ─── 身份区 ───
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
/* ═══ 骨架（token 全部走 artist-tokens.css，旧变量名不再出现——派工 §二.3） ═══ */
.artist-layout {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--f-b);
  font-size: 13.5px;
  min-height: 100vh;
}

/* ─── 侧边栏（REQ §三.1：宣纸=纸色 / 墨黑=松烟，随主题变量自动切换） ─── */
.sidebar {
  background: var(--sb-bg);
  border-right: 1px solid var(--sb-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease, background-color 0.35s, border-color 0.35s;
}

/* 品牌区：朱砂印章「绘」 */
.brand {
  display: flex; align-items: center; gap: 11px;
  padding: 20px 16px 16px;
}
.brand--collapsed {
  flex-direction: column; gap: 8px;
  padding: 16px 8px;
}
.brand-seal {
  width: 35px; height: 35px;
  background: var(--zs);
  color: #fff;
  font-family: var(--f-d);
  display: grid; place-items: center;
  font-size: 19px;
  border-radius: 8px;
  transform: rotate(-4deg);
  box-shadow: 2px 2px 0 var(--sb-seal-shadow);
  flex: none;
  transition: transform .3s cubic-bezier(.3, 1.5, .4, 1), background-color .35s;
}
.brand:hover .brand-seal { transform: rotate(4deg) scale(1.06); }
.brand-text { display: flex; flex-direction: column; min-width: 0; }
.brand-name {
  font-size: 19px; line-height: 1.2;
  color: var(--sb-text-on);
  letter-spacing: .08em;
}
.brand-sub {
  font-size: 9px;
  color: var(--sb-text-dim);
  letter-spacing: .2em;
}
/* R21: 折叠按钮 */
.collapse-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--sb-text-dim);
  cursor: pointer; flex-shrink: 0;
  margin-left: auto;
  transition: background-color 0.15s, color 0.15s;
}
.collapse-btn:hover { background: var(--sb-hover); color: var(--sb-text-on); }
.sidebar--collapsed .collapse-btn { margin-left: 0; }

/* ─── 导航三组（激活态花青软底 + 左侧 3px 竖条） ─── */
.nav { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 12px; }
.nav--collapsed { padding: 4px 10px; }
.nav-group { margin-bottom: 14px; }
.nav-title {
  font-size: 10.5px;
  color: var(--sb-text-dim);
  letter-spacing: .16em;
  padding: 0 10px;
  margin-bottom: 5px;
}
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-m);
  font-size: 13px;
  color: var(--sb-text);
  cursor: pointer;
  position: relative;
  user-select: none;
  transition: color .15s, background-color .15s;
}
.nav-item:hover { color: var(--sb-text-on); background: var(--sb-hover); }
.nav-item--active {
  color: var(--sb-active-text);
  background: var(--sb-active-bg);
  font-weight: 600;
}
.nav-item--active::before {
  content: '';
  position: absolute;
  left: -12px; top: 7px; bottom: 7px;
  width: 3px;
  background: var(--hq);
  border-radius: 0 2px 2px 0;
}
.nav--collapsed .nav-item { justify-content: center; padding: 9px 0; }
.nav--collapsed .nav-item--active::before { left: -10px; }
.nav-item .el-icon { font-size: 16px; flex: none; }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* #1: 留言角标（朱砂底白字胶囊——EP badge 主色已覆写为花青，此处显式朱砂：角标=警示语义） */
.nav-badge :deep(.el-badge__content) {
  background: var(--zs);
  border: none;
}

/* ─── 底部身份区 ─── */
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--sb-border);
  display: flex; flex-direction: column; gap: 10px;
}
.sidebar-footer--collapsed { align-items: center; padding: 12px 8px; }
.identity { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 32px; height: 32px;
  border-radius: 9px;
  display: grid; place-items: center;
  background: var(--hq);
  color: #fff;
  font-family: var(--f-d);
  font-size: 15px;
  flex-shrink: 0;
}
.avatar--mini { cursor: pointer; transition: transform 0.15s; }
.avatar--mini:hover { transform: scale(1.1); }
.avatar--img { object-fit: cover; }
.identity-tooltip { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.identity-tooltip-name { font-size: 13px; }
.identity-info { display: flex; flex-direction: column; min-width: 0; }
.identity-name {
  font-size: 12.5px; font-weight: 600;
  color: var(--sb-text-on);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.identity-status {
  font-size: 10.5px;
  color: var(--sb-text-dim);
  display: flex; align-items: center; gap: 4px;
}
.status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.dot-success { background: var(--sl); }
.dot-warning { background: var(--th); }
.dot-danger { background: var(--zs); }
.footer-actions { display: flex; align-items: center; justify-content: space-between; }
.logout-btn { color: var(--sb-text-dim); font-size: 12px; }
.logout-btn:hover { color: var(--sb-text-on); }

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
  font-size: 17px; font-weight: 700;
  color: var(--ink);
  letter-spacing: .02em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topbar-actions { display: flex; align-items: center; gap: 10px; }
.lang-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink2);
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: color .15s, transform .15s, box-shadow .15s, background-color .35s, border-color .35s;
}
.lang-btn:hover { color: var(--ink); transform: translateY(-1px); box-shadow: var(--sh-1); }

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
  transition: box-shadow 0.15s, background-color 0.35s;
}
.mobile-menu-btn:hover { box-shadow: var(--sh-1); }

/* ─── 主内容区 ─── */
.main-content {
  background: var(--paper);
  padding: 24px 28px;
  transition: background-color 0.35s;
}
@media (max-width: 600px) {
  .main-content { padding: 16px 14px; }
  .topbar { padding: 0 14px; }
}

/* ─── R21: 移动端抽屉 ─── */
.mobile-drawer :deep(.el-drawer__body) {
  display: flex; flex-direction: column;
  padding: 0;
  background: var(--sb-bg);
}
.drawer-header { display: flex; align-items: center; gap: 10px; }
.nav--drawer { flex: 1; }
.drawer-footer {
  padding: 16px;
  border-top: 1px solid var(--sb-border);
  display: flex; flex-direction: column; gap: 10px;
}

/* ─── topbar 压缩批：侧边栏底部主题/语言（展开/折叠两态） ─── */
.footer-tools { display: flex; align-items: center; gap: 8px; }
.collapsed-tools { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 10px; }
</style>
