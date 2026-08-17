<template>
  <!-- v0.38: 画师后台骨架重做（REQ-026 §三.1）——纸墨 token 体系
       功能清单不丢：折叠（手动+窄屏自动）、三组导航、留言角标、身份区、登出、移动端抽屉、主题切换、语言切换
       artist-scope 类 = token 作用域标记（artist-tokens.css 过渡规则） -->
  <div class="artist-layout artist-scope">
    <el-container style="min-height: 100vh">
      <!-- 侧边栏（R21: 可折叠，移动端隐藏）——宣纸主题纸色底 / 墨黑主题松烟底（REQ §三.1） -->
      <el-aside v-show="!isMobile" :width="asideWidth" class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
        <!-- 品牌区：朱砂印章「绘」字 + 拾绘（文楷）+ INKGLEAN 副标 -->
        <div class="brand" :class="{ 'brand--collapsed': collapsed }">
          <span class="brand-seal" aria-hidden="true">{{ $t('menu.logoSeal') }}</span>
          <div v-show="!collapsed" class="brand-text">
            <span class="brand-name font-display">{{ $t('menu.logo') }}</span>
            <span class="brand-sub">INKGLEAN</span>
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
                <router-link
                  class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
                  :to="item.index"
                  :aria-label="$t(item.labelKey)"
                >
                  <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
                    <el-icon><component :is="item.icon" /></el-icon>
                  </el-badge>
                </router-link>
              </el-tooltip>
              <router-link
                v-else
                class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
                :to="item.index"
              >
                <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
                  <el-icon><component :is="item.icon" /></el-icon>
                </el-badge>
                <span class="nav-label">{{ $t(item.labelKey) }}</span>
              </router-link>
            </template>
          </div>
        </nav>

        <!-- 底部：身份区 + 登出 + 主题/语言（展开/折叠两态） -->
        <div class="sidebar-footer" :class="{ 'sidebar-footer--collapsed': collapsed }">
          <!-- 展开态：完整身份区 -->
          <template v-if="!collapsed">
            <div class="identity">
              <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
              <div v-else class="avatar avatar--seal"><SealStamp text="绘" :animate="false" /></div>
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
                <!-- REQ-043 I4: 平台公告入口（零主动打扰；有未读才显示圆点） -->
                <button
                  v-if="announcement"
                  class="announce-btn" :class="{ 'announce-btn--unread': announcementUnread }"
                  :title="$t('announcement.entry')" :aria-label="$t('announcement.entry')"
                  @click="openAnnouncement"
                >
                  <el-icon><Bell /></el-icon>
                </button>
                <button
                  class="lang-btn" @click="toggleLang"
                  :title="locale === 'zh-CN' ? $t('menu.langToEn') : $t('menu.langToZh')"
                  :aria-label="locale === 'zh-CN' ? $t('menu.langAriaToEn') : $t('menu.langAriaToZh')"
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
              <div v-else class="avatar avatar--mini avatar--seal"><SealStamp text="绘" :animate="false" /></div>
            </el-tooltip>
            <div class="collapsed-tools">
              <ThemeToggle />
              <button
                v-if="announcement"
                class="announce-btn" :class="{ 'announce-btn--unread': announcementUnread }"
                :title="$t('announcement.entry')" :aria-label="$t('announcement.entry')"
                @click="openAnnouncement"
              >
                <el-icon><Bell /></el-icon>
              </button>
              <button
                class="lang-btn" @click="toggleLang"
                :title="locale === 'zh-CN' ? $t('menu.langToEn') : $t('menu.langToZh')"
                :aria-label="locale === 'zh-CN' ? $t('menu.langAriaToEn') : $t('menu.langAriaToZh')"
              >
                {{ locale === 'zh-CN' ? 'EN' : '中' }}
              </button>
            </div>
          </template>
        </div>
      </el-aside>

      <!-- 主内容区（顶栏 + 内容） -->
      <!-- v0.40 修复：内层 el-container 必须纵向——原生 <header class="topbar"> 不被 EP 识别为 el-header，
          默认 row 方向会导致移动端 topbar 与 main 横排并排（窄窗口布局损坏，2026-08-07 用户截图实锤） -->
      <el-container direction="vertical">
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
            <!-- REQ-043 I4: 移动端公告入口 -->
            <button
              v-if="announcement"
              class="announce-btn" :class="{ 'announce-btn--unread': announcementUnread }"
              :title="$t('announcement.entry')" :aria-label="$t('announcement.entry')"
              @click="openAnnouncement"
            >
              <el-icon><Bell /></el-icon>
            </button>
            <button
              class="lang-btn" @click="toggleLang"
              :title="locale === 'zh-CN' ? $t('menu.langToEn') : $t('menu.langToZh')"
              :aria-label="locale === 'zh-CN' ? $t('menu.langAriaToEn') : $t('menu.langAriaToZh')"
            >
              {{ locale === 'zh-CN' ? 'EN' : '中' }}
            </button>
          </div>
        </header>
        <el-main class="main-content">
          <!-- 02C: 内容区过渡（导航稳定；keyed div 触发 fade-slide——后台路由切换只动这里） -->
          <transition name="fade-slide" mode="out-in">
            <div :key="$route.path" class="main-content-inner">
              <slot />
            </div>
          </transition>
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
        <!-- 工具箱收纳：四分类组展开（纸墨提案 §5.5，drawerMenuGroups） -->
        <div v-for="group in drawerMenuGroups" :key="group.key" class="nav-group">
          <div class="nav-title">{{ $t(group.labelKey) }}</div>
          <router-link
            v-for="item in group.items" :key="item.index"
            class="nav-item" :class="{ 'nav-item--active': activeMenu === item.index }"
            :to="item.index"
            @click="drawerVisible = false"
          >
            <el-badge :value="item.badge" :hidden="!item.badge" :max="99" class="nav-badge">
              <el-icon><component :is="item.icon" /></el-icon>
            </el-badge>
            <span class="nav-label">{{ $t(item.labelKey) }}</span>
          </router-link>
        </div>
      </nav>
      <div class="drawer-footer">
        <div class="identity">
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar avatar--img" alt="" />
          <div v-else class="avatar avatar--seal"><SealStamp text="绘" :animate="false" /></div>
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

    <!-- REQ-043 I4: 平台公告弹窗（点开即已读；本地记录已读时间戳，新公告重新标点） -->
    <el-dialog v-model="announcementOpen" :title="$t('announcement.dialogTitle')" width="min(560px, calc(100vw - 32px))" class="announcement-dialog">
      <template v-if="announcement">
        <h3 class="announcement-title">{{ announcement.title }}</h3>
        <p v-if="announcement.updatedAt" class="announcement-time">{{ $t('announcement.updatedAt', { time: announcement.updatedAt }) }}</p>
        <div class="announcement-content">{{ announcement.content }}</div>
      </template>
      <p v-else class="announcement-empty">{{ $t('announcement.empty') }}</p>
    </el-dialog>

    <!-- 818-E: 分步高亮导览浮层——挂在 ArtistLayout 单根内（全会话单挂载即常驻）；
         不能挂 ArtistLayoutRoute 并列根：fragment 会破坏 App.vue 顶层 Transition 致白屏（e8 教训） -->
    <TourOverlay />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../stores/artist.js'
import { useThemeStore } from '../stores/theme.js'
import { setLocale } from '../i18n/index.js'
import { trackEvent } from '../utils/track.js'
import { safeGetItem, safeSetItem } from '../utils/storage.js'
// 818-A: 字号滑块共享 util（与 Preferences 同一映射/应用口径）
import { applyFontSize, readFontSize } from '../utils/fontSize.js'
// 819-G: 动画速度 + 减少动效共享 util（与 Preferences 同一映射/应用口径）
import { applyAnimSpeed, readAnimSpeed, applyReduceMotion, readReduceMotion } from '../utils/animSpeed.js'
import { artistApi } from '../api/index.js'
// REQ-037 批2 A4: 会话强校验 composable（与 AdminLayout 共用单一实现）
import { useSessionGuard } from '../composables/useSessionGuard'
import { Odometer, List, Box, Money, Picture, Setting, Expand, Fold, Operation, Management, ChatLineSquare, Tickets, Document, EditPen, TrendCharts, Tools, UserFilled, Bell } from '@element-plus/icons-vue'
import ThemeToggle from './ThemeToggle.vue'
// 818-E: 新手导览浮层（Teleport 到 body，挂单根内仅为避免 fragment）
import TourOverlay from './artist/tour/TourOverlay.vue'
// 工具箱四分类注册表（纸墨提案 §5.5；单一事实源，ArtistLayout/ToolsHome 共用）
import { TOOLS_MENU_ITEMS, TOOL_BOX_CATEGORIES } from '../constants/toolbox.js'
// F5a 批4: 未传头像画师的头像兜底 = 品牌印章（朱砂「绘」，复用已完成态印章组件）
import SealStamp from './artist/visual/SealStamp.vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const store = useArtistStore()
const themeStore = useThemeStore()

// ─── v0.38: 后台主题作用域 ───
// 挂/摘已由路由守卫统一管理（router/index.js beforeEach）：进入后台路由提前挂 token，
// 组件懒加载期间不闪白；离开后台摘除。此处仅保留 onMounted 幂等挂载（双保险），
// 不再在卸载时摘除（否则切页间隙会摘掉守卫刚挂的新 token，深色切页闪白）。
onMounted(() => themeStore.enterArtistScope())

// activeMenu：订单详情 /orders/:id 归属「订单管理」高亮（/orders/new 除外）；
// 工具子页 /tools/* 归属「工具箱」把手高亮（纸墨提案 §5.5）
const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/orders/') && p !== '/orders/new') return '/orders'
  if (p.startsWith('/tools/')) return '/tools'
  return p
})
// ─── 埋点：后台页面浏览（REQ-033 §4 / 施工图《01-to-02-埋点前端批》§3.3） ───
// 事件名严格用后端白名单；/slots、/admin 无白名单事件名（后端 400），不埋
// 画师已登录（后台登录守卫）→ 后端自动记 artist_id，前端只需发事件
const PAGE_VIEW_EVENT_MAP = {
  '/dashboard': 'dashboard_view',
  '/queue': 'queue_view',
  '/orders': 'orders_view',
  '/orders/new': 'manual_view',
  '/tiers': 'tiers_view',
  '/artworks': 'artworks_view',
  '/guestbook': 'guestbook_view',
  '/settings': 'settings_view',
  '/preferences': 'preferences_view'
}
function trackPageView(path) {
  const eventName = PAGE_VIEW_EVENT_MAP[path]
  if (eventName) trackEvent(eventName, { page: path })
}
// 首次进入后台即发当前页（ArtistLayout 挂载一次，不随子路由重复挂载）
trackPageView(activeMenu.value)
// 路由变化统一收口：/orders/:id 详情进入也按次累计（REQ-033 §4.5 验收 5）
watch(() => route.path, () => {
  trackPageView(activeMenu.value)
})

// ─── R21: 菜单项注册表（侧边栏与抽屉共用） ───
// REQ-016 C: 手动录单移出菜单（订单管理页已有按钮），菜单分三组：工作/经营/门面
const BASE_MENU_ITEMS = [
  { index: '/dashboard', icon: Odometer, labelKey: 'menu.dashboard', group: 'work' },
  { index: '/queue', icon: List, labelKey: 'menu.queue', group: 'work' },
  // I0（REQ-039 拍板）: 订单管理待确认角标（pending 数，5 分钟轮询）
  { index: '/orders', icon: Box, labelKey: 'menu.orders', group: 'work', hasOrderBadge: true },
  // #8: 录单入口归位（从订单管理页移回侧边栏「工作」分组）
  { index: '/orders/new', icon: EditPen, labelKey: 'menu.manualOrder', group: 'work' },
  // v0.26 C: 开稿管理（排期看板后面）
  { index: '/slots', icon: Tickets, labelKey: 'menu.slots', group: 'biz' },
  { index: '/tiers', icon: Money, labelKey: 'menu.tiers', group: 'biz' },
  { index: '/artworks', icon: Picture, labelKey: 'menu.artworks', group: 'biz' },
  // #1: 留言管理（作品管理下方，待审核角标）
  { index: '/guestbook', icon: ChatLineSquare, labelKey: 'menu.guestbook', hasBadge: true, group: 'biz' },
  // 工具箱收纳（纸墨提案 §5.5）：侧栏只留一个把手，13 个工具收进四分类抽屉（见 TOOL_BOX_CATEGORIES）
  { index: '/tools', icon: Tools, labelKey: 'menu.toolbox', group: 'tools' },
  // R42b: 须知编辑合并进设置页，菜单项移除
  { index: '/stats', icon: TrendCharts, labelKey: 'menu.stats', group: 'front' },
  { index: '/settings', icon: Setting, labelKey: 'menu.settings', group: 'front' },
  // #44: 偏好独立导航（主页对外/偏好对内）
  { index: '/preferences', icon: Document, labelKey: 'menu.preferences', group: 'front' },
  // REQ-040: 账号与安全
  { index: '/account', icon: UserFilled, labelKey: 'menu.account', group: 'front' }
]
// #1: 待审核留言数（onMounted 调一次 messages 取 pending 计数）
const pendingMsgCount = ref(0)
// REQ-043 I4: 平台公告（零主动打扰：不弹窗不 banner，仅入口小圆点提示）
const announcement = ref(null)
const announcementOpen = ref(false)
const ANNOUNCEMENT_READ_KEY = 'inkglean_announcement_read_at'
const announcementUnread = computed(() => {
  const a = announcement.value
  if (!a?.updatedAt) return false
  const readAt = safeGetItem(ANNOUNCEMENT_READ_KEY)
  return !readAt || readAt < a.updatedAt
})

async function loadAnnouncement() {
  try {
    announcement.value = await artistApi.getAnnouncement()
  } catch {
    /* 失败静默：公告非关键路径 */
  }
}

function openAnnouncement() {
  announcementOpen.value = true
  // 点开即已读：本地记已读时间戳（拍板：本地会话记已读，后端不做已读表）
  if (announcement.value?.updatedAt) {
    safeSetItem(ANNOUNCEMENT_READ_KEY, announcement.value.updatedAt)
  }
}
// I0（REQ-039 拍板）: 待确认订单数（getStats.pendingCount 轻量统计；独立计时器轮询 5 分钟）
const pendingOrderCount = ref(0)
// UI-7: 管理员追加"管理后台"入口
// REQ-016 C: 菜单分组渲染（工作/经营/门面）；工具组收窄为单个工具箱把手（纸墨提案 §5.5）
const MENU_GROUPS = [
  { key: 'work', labelKey: 'menu.groupWork' },
  { key: 'biz', labelKey: 'menu.groupBiz' },
  // 工具箱把手（组标题保持「工具」，组内单项 = 工具箱入口）
  { key: 'tools', labelKey: 'menu.groupTools' },
  { key: 'front', labelKey: 'menu.groupFront' }
]
const menuGroups = computed(() => {
  const items = BASE_MENU_ITEMS.map(item => {
    if (item.hasBadge) return { ...item, badge: pendingMsgCount.value }
    if (item.hasOrderBadge) return { ...item, badge: pendingOrderCount.value }
    return item
  })
  if (store.isAdmin) {
    items.push({ index: '/admin', icon: Management, labelKey: 'menu.admin', group: 'front' })
  }
  return MENU_GROUPS.map(g => ({
    ...g,
    items: items.filter(item => item.group === g.key)
  })).filter(g => g.items.length > 0) // 空组不渲染标题（工具组暂无项时不显示）
})

/** 抽屉导航：工作/经营原样 + 工具箱展开为四分类组 + 门面（分类抽屉，纸墨提案 §5.5） */
const drawerMenuGroups = computed(() => {
  const base = menuGroups.value.filter(g => g.key !== 'tools')
  const catGroups = TOOL_BOX_CATEGORIES.map(cat => ({
    key: `tools-${cat.key}`,
    labelKey: cat.labelKey,
    items: TOOLS_MENU_ITEMS.filter(item => item.cat === cat.key)
  }))
  const frontIdx = base.findIndex(g => g.key === 'front')
  const head = frontIdx === -1 ? base : base.slice(0, frontIdx)
  const front = frontIdx === -1 ? [] : base.slice(frontIdx)
  // 工具箱把手项自身也保留在分类组之前（入口 + 分类格）
  const toolboxHandle = menuGroups.value.find(g => g.key === 'tools')
  const handleGroup = toolboxHandle ? [{ key: 'tools', labelKey: 'menu.groupTools', items: toolboxHandle.items }] : []
  return [...head, ...handleGroup, ...catGroups, ...front]
})

/** 顶栏页面标题：当前路由对应菜单项的 labelKey（详情类页面归属父级；工具子页查 TOOLS_MENU_ITEMS） */
const pageTitle = computed(() => {
  const all = BASE_MENU_ITEMS.concat(TOOLS_MENU_ITEMS).concat(
    store.isAdmin ? [{ index: '/admin', labelKey: 'menu.admin' }] : []
  )
  const hit = all.find(item => item.index === activeMenu.value)
  // 巡检修复批 C12: /admin* 子路径（如 /admin/artists）无对应菜单项时回退管理后台标题
  if (!hit && activeMenu.value.startsWith('/admin')) return t('menu.admin')
  return hit ? t(hit.labelKey) : ''
})

// ─── R21: 折叠状态管理 ───
const SIDEBAR_KEY = 'sidebar_collapsed'
/** 用户手动折叠偏好（localStorage 持久化，桌面默认展开） */
// G-5: 裸读写换 safe 封装（存储禁用时按默认展开态降级）
const userCollapsed = ref(safeGetItem(SIDEBAR_KEY) === '1')
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
  applyFontSizeFromStorage()
  applyAnimSpeedFromStorage()
  applyReduceMotionFromStorage()
  validateSession() // G-1: 服务端会话强校验（成败均静默处理，不阻塞骨架渲染）
  loadAnnouncement() // REQ-043 I4: 公告入口数据（登录态接口，失败静默）
  // I0: 待确认订单角标轮询（5 分钟；页面隐藏暂停，可见立即刷新——visibilitychange）
  startPendingOrderPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  mqNarrow.removeEventListener('change', onNarrowChange)
  mqMobile.removeEventListener('change', onMobileChange)
  stopPendingOrderPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// ─── I0（REQ-039）: 待确认订单角标轮询 ───
// 数据源选择：artistApi.getStats().pendingCount —— 单请求最轻（orders 列表带 status=pending&pageSize=1
// 也能取 total，但返回整行数据体量更大）；5 分钟一次低频，失败静默（角标非关键路径）
const PENDING_ORDER_POLL_MS = 5 * 60 * 1000
let pendingOrderTimer = null

async function refreshPendingOrderCount() {
  if (!store.loggedIn) return
  try {
    const stats = await artistApi.getStats()
    pendingOrderCount.value = stats?.pendingCount || 0
  } catch { /* 轮询失败静默，下次再试 */ }
}

/** 留言待审角标：与订单角标同款轮询（同频率、同可见性暂停），口径对齐 */
async function refreshPendingMsgCount() {
  if (!store.loggedIn) return
  try {
    // G-8（F-2 适配）: 后端改分页响应 { items, total, page, pageSize }；
    // 角标取最新一页（pageSize=100 为后端上限），超量时可能低估——角标非关键路径可接受
    const res = await artistApi.getMessages({ pageSize: 100 })
    pendingMsgCount.value = (res.items || []).filter(m => m.status === 'pending').length
  } catch { /* 轮询失败静默，下次再试 */ }
}

function startPendingOrderPolling() {
  stopPendingOrderPolling()
  refreshPendingOrderCount()
  refreshPendingMsgCount()
  pendingOrderTimer = setInterval(() => {
    refreshPendingOrderCount()
    refreshPendingMsgCount()
  }, PENDING_ORDER_POLL_MS)
}

function stopPendingOrderPolling() {
  if (pendingOrderTimer) {
    clearInterval(pendingOrderTimer)
    pendingOrderTimer = null
  }
}

function onVisibilityChange() {
  // 页面隐藏时暂停（省电/省请求），回到前台立即刷新并恢复轮询
  if (document.hidden) {
    stopPendingOrderPolling()
  } else {
    startPendingOrderPolling()
  }
}

// 窗口变宽时自动关闭抽屉
watch(isMobile, (mobile) => { if (!mobile) drawerVisible.value = false })

/** 实际折叠状态：窄屏强制折叠，否则尊重用户偏好 */
const collapsed = computed(() => isNarrow.value || userCollapsed.value)
const asideWidth = computed(() => collapsed.value ? '64px' : '230px')

function toggleCollapse() {
  userCollapsed.value = !userCollapsed.value
  safeSetItem(SIDEBAR_KEY, userCollapsed.value ? '1' : '0')
}

// ─── 导航与操作 ───

function toggleLang() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}

// ─── 身份区 ───
/** 画师上传头像优先显示，未设置时回退品牌印章（SealStamp，F5a 批4） */
const avatarUrl = computed(() => store.profile?.avatar ? `/uploads/${store.profile.avatar}` : '')

// ─── 818-A: 后台字号滑块（Preferences 页写入 localStorage，挂载时应用；刷新/重进后台保持） ───
// 默认 15 也显式设 dataset.fontSize='15'（15≠14 基线，不设会回退旧默认）
function applyFontSizeFromStorage() {
  applyFontSize(readFontSize())
}

// ─── 819-G: 后台动画速度 + 减少动效（Preferences 页写入 localStorage，挂载时应用；
//     刷新/重进后台保持；dataset 选择器锁 html[data-artist-theme]，客户端零影响） ───
function applyAnimSpeedFromStorage() {
  applyAnimSpeed(readAnimSpeed())
}

function applyReduceMotionFromStorage() {
  applyReduceMotion(readReduceMotion())
}

const statusClass = computed(() => {
  const s = store.profile?.status || 'open'
  // A6: hidden（已隐藏）≈ 离线，用灰点，不再误显示绿灯
  return { open: 'dot-success', full: 'dot-warning', break: 'dot-danger', hidden: 'dot-hidden' }[s] || 'dot-success'
})

function logout() {
  store.logout()
  router.push('/login')
}

// ─── G-1（P2-8）: 后台会话强校验（REQ-037 批2 A4: 逻辑收敛进 useSessionGuard，AdminLayout 同款复用） ───
const { validateSession } = useSessionGuard()
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
  /* K1（波2，灰沼教训）：侧栏底色/边框随主题即时切换，不插值；仅折叠宽度保留微交互过渡 */
  transition: width var(--dur-mid) var(--ease-out);
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
  font-size: calc(var(--font-scale, 1) * 19px);
  border-radius: 8px;
  transform: rotate(-4deg);
  box-shadow: 2px 2px 0 var(--sb-seal-shadow);
  flex: none;
  /* F5a 批4: hover 微效收紧到 150ms 纪律，hover 时印章加深（可点 logo 感） */
  transition: transform var(--dur-fast) cubic-bezier(.3, 1.5, .4, 1), background-color var(--dur-fast);
}
.brand:hover .brand-seal { transform: rotate(4deg) scale(1.06); background-color: var(--zs-d); }
.brand-text { display: flex; flex-direction: column; min-width: 0; }
.brand-name {
  font-size: calc(var(--font-scale, 1) * 19px); line-height: 1.2;
  color: var(--sb-text-on);
  letter-spacing: .08em;
}
.brand-sub {
  font-size: calc(var(--font-scale, 1) * 9px);
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
  transition: background-color var(--dur-fast), color var(--dur-fast);
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
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--sb-text);
  cursor: pointer;
  position: relative;
  user-select: none;
  transition: color var(--dur-fast), background-color var(--dur-fast);
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
  /* 点名2: 激活竖条自上而下滑入（transform-origin top, .25s ease-out） */
  transform-origin: top;
  animation: nav-bar-in var(--dur-mid) ease-out;
}
@keyframes nav-bar-in {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.nav--collapsed .nav-item { justify-content: center; padding: 9px 0; }
.nav--collapsed .nav-item--active::before { left: -10px; }
.nav-item .el-icon { font-size: calc(var(--font-scale, 1) * 16px); flex: none; }
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
  font-size: calc(var(--font-scale, 1) * 15px);
  flex-shrink: 0;
}
.avatar--mini { cursor: pointer; transition: box-shadow var(--dur-fast); }
.avatar--mini:hover { box-shadow: var(--sh-1); }
.avatar--img { object-fit: cover; }
/* F5a 批4: 未传头像兜底 = 品牌印章（SealStamp 默认 44px 过大，包一层适配 32px 头像格） */
.avatar--seal { background: transparent; padding: 0; overflow: hidden; }
.avatar--seal :deep(.v-seal.v-seal) {
  min-width: 32px; width: 32px; height: 32px;
  padding: 0;
  font-size: calc(var(--font-scale, 1) * 15px);
  border-radius: 9px;
  transform: rotate(-4deg);
}
.identity-tooltip { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.identity-tooltip-name { font-size: calc(var(--font-scale, 1) * 13px); }
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
/* A6: 隐藏≈离线：灰点（侧栏 dim 灰，与 identity-status 文字同色系） */
.dot-hidden { background: var(--sb-text-dim); }
.footer-actions { display: flex; align-items: center; justify-content: space-between; }
.logout-btn { color: var(--sb-text-dim); font-size: calc(var(--font-scale, 1) * 12px); transition: color var(--dur-fast), background-color var(--dur-fast); }
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
  font-size: calc(var(--font-scale, 1) * 17px); font-weight: 700;
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
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600;
  cursor: pointer;
  /* K1（波2，灰沼教训）：背景/边框随主题即时切换，不插值；仅 hover/按压微交互保留 */
  transition: color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}
.lang-btn:hover { color: var(--ink); box-shadow: var(--sh-1); }

/* ─── REQ-043 I4: 公告入口（小铃铛；未读时右上角朱砂圆点） ─── */
.announce-btn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink2);
  cursor: pointer;
  flex: none;
  /* K1（波2，灰沼教训）：背景/边框随主题即时切换，不插值；仅 hover/按压微交互保留 */
  transition: color var(--dur-fast), box-shadow var(--dur-fast), transform var(--dur-fast) ease-out;
}
.announce-btn:hover { color: var(--ink); box-shadow: var(--sh-1); }
.announce-btn:active { transform: scale(0.98); }
.announce-btn--unread::after {
  content: '';
  position: absolute;
  top: 6px; right: 6px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--zs);
  border: 1px solid var(--card);
}
.announcement-dialog :deep(.el-dialog__body) { padding-top: 8px; }
.announcement-title {
  margin: 0 0 6px;
  font-size: calc(var(--font-scale, 1) * 16px);
  font-weight: 700;
  color: var(--ink);
  font-family: var(--f-d);
}
.announcement-time {
  margin: 0 0 10px;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
}
.announcement-content {
  font-size: calc(var(--font-scale, 1) * 13.5px);
  color: var(--ink2);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}
.announcement-empty { margin: 0; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }

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

/* ─── 主内容区 ─── */
.main-content {
  background: var(--paper);
  padding: 24px 28px;
  /* K1（波2，灰沼教训）：主内容区底色随主题即时切换，不插值 */
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
/* ─── 克制动效批（2026-08-07 用户反馈批：按钮按压 ≤0.2s ease-out；
     注：波2 K1 已移除 html[data-artist-theme] .artist-scope * 全局主题切换过渡
     （0.35s 颜色插值，灰沼教训），此处 .artist-scope 前缀保留仅作 scoped 覆盖约定） ─── */
.artist-scope .collapse-btn { transition: background-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast) ease-out; }
.artist-scope .collapse-btn:active { transform: scale(0.98); }
.artist-scope .lang-btn { transition: color var(--dur-fast), transform var(--dur-fast) ease-out, box-shadow var(--dur-fast); }
.artist-scope .lang-btn:active { transform: scale(0.98); }
.artist-scope .mobile-menu-btn { transition: box-shadow var(--dur-fast), transform var(--dur-fast) ease-out; }
.artist-scope .mobile-menu-btn:active { transform: scale(0.98); }
.artist-scope .nav-item { transition: color var(--dur-fast), background-color var(--dur-mid) ease-out, transform var(--dur-fast) ease-out; }
.artist-scope .nav-item:active { transform: scale(0.98); }
.artist-scope .logout-btn { transition: color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast) ease-out; }
.artist-scope .logout-btn:active { transform: scale(0.98); }
/* 移动端抽屉进场：淡入 + 轻微上移（0.18s ease-out，替代 EP 默认侧滑，禁弹跳旋转） */
.artist-scope .mobile-drawer :deep(.el-drawer-fade-enter-active),
.artist-scope .mobile-drawer :deep(.el-drawer-fade-leave-active) { transition: opacity 0.18s ease-out, transform 0.18s ease-out; }
.artist-scope .mobile-drawer :deep(.el-drawer-fade-enter-from) { opacity: 0; }
.artist-scope .mobile-drawer :deep(.el-drawer-fade-leave-to) { opacity: 0; }
/* drawer 本体：淡入 + 轻微上移（替代 EP 左侧全滑入；禁弹跳旋转） */
.artist-scope .mobile-drawer :deep(.el-drawer-fade-enter-from .ltr),
.artist-scope .mobile-drawer :deep(.el-drawer-fade-leave-to .ltr) { transform: translateY(8px); }

/* ─── REQ-037 批4a A2: 原生 <a> 重置——router-link 渲染为 <a>, 消除默认蓝字下划线 ─── */
a.nav-item { text-decoration: none; color: inherit; }
</style>
