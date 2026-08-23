<template>
  <div class="admin-layout">
    <!-- v0.45: 管理后台骨架重做（02-派工-管理后台重设计-20260807）——纸墨 token 体系
         由顶部 Tab 改为左侧导航（对齐 ArtistLayout 视觉语义：品牌区/导航/底部操作），
         主内容区 max-width 1280 居中；窄屏自动收窄为图标条，移动端汉堡抽屉 -->
    <el-container style="min-height: 100vh">
      <!-- 侧边栏（≤900px 自动收窄为 --sb-w-collapsed 图标条，≤600px 隐藏走抽屉） -->
      <el-aside v-show="!isMobile" :width="asideWidth" class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
        <!-- 品牌区：朱砂印章「绘」+ 拾绘（文楷）+ ADMIN 副标 -->
        <div class="brand" :class="{ 'brand--collapsed': collapsed }">
          <span class="brand-seal" aria-hidden="true">{{ $t('menu.logoSeal') }}</span>
          <div v-show="!collapsed" class="brand-text">
            <span class="brand-name font-display">{{ $t('menu.logo') }}</span>
            <span class="brand-sub">ADMIN</span>
          </div>
        </div>

        <!-- 导航（管理员面板/画师管理/举报处理/公告编辑/问候语管理/默认流程/社交平台/系统自检/埋点看板） -->
        <nav class="nav" :class="{ 'nav--collapsed': collapsed }">
          <template v-for="group in groupedNav" :key="group.key">
            <div v-if="!collapsed" class="nav-group-title">{{ $t(group.labelKey) }}</div>
            <template v-for="item in group.items" :key="item.path">
              <el-tooltip v-if="collapsed" placement="right" effect="light" :hide-after="200" :content="$t(item.labelKey)">
                <div
                  class="nav-item" :class="{ 'nav-item--active': activePath === item.path }"
                  role="link" tabindex="0" @click="go(item.path)" @keydown.enter="go(item.path)"
                  :aria-label="$t(item.labelKey)"
                >
                  <el-icon><component :is="item.icon" /></el-icon>
                </div>
              </el-tooltip>
              <div
                v-else
                class="nav-item" :class="{ 'nav-item--active': activePath === item.path }"
                role="link" tabindex="0" @click="go(item.path)" @keydown.enter="go(item.path)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span class="nav-label">{{ $t(item.labelKey) }}</span>
              </div>
            </template>
          </template>
        </nav>

        <!-- 底部：返回客户端入口 -->
        <div class="sidebar-footer" :class="{ 'sidebar-footer--collapsed': collapsed }">
          <el-tooltip v-if="collapsed" placement="right" effect="light" :hide-after="200" :content="$t('admin.backToAdmin')">
            <button class="back-btn" :aria-label="$t('admin.backToAdmin')" @click="$router.push('/dashboard')">
              <el-icon><Back /></el-icon>
            </button>
          </el-tooltip>
          <button v-else class="back-btn" @click="$router.push('/dashboard')">
            <el-icon><Back /></el-icon>
            <span>{{ $t('admin.backToAdmin') }}</span>
          </button>
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-container direction="vertical">
        <!-- 移动端顶栏 -->
        <header v-if="isMobile" class="topbar">
          <button class="mobile-menu-btn" :aria-label="$t('menu.openMenu')" @click="drawerVisible = true">
            <el-icon :size="20"><Operation /></el-icon>
          </button>
          <span class="topbar-title font-display">{{ pageTitle }}</span>
        </header>
        <el-main class="main-content">
          <!-- 点名2: 管理后台子路由切换 fade-slide（与 App.vue 同款，克制）
               REQ-041: 首次 step-up 探测完成前/未验证时不渲染子路由——
               避免后台数据请求在验证弹窗背后先行触发（401 toast 与弹窗双焦点） -->
          <router-view v-slot="{ Component }">
            <template v-if="!stepUpInitializing && !stepUpVisible">
              <transition name="fade-slide" mode="out-in">
                <component :is="Component" :key="$route.path" />
              </transition>
            </template>
          </router-view>
        </el-main>
      </el-container>
    </el-container>

    <!-- 移动端抽屉导航 -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="260px" :show-close="false" class="mobile-drawer">
      <template #header>
        <div class="drawer-header">
          <span class="brand-seal" aria-hidden="true">{{ $t('menu.logoSeal') }}</span>
          <span class="brand-name font-display">{{ $t('menu.logo') }}</span>
        </div>
      </template>
      <nav class="nav nav--drawer">
        <template v-for="group in groupedNav" :key="group.key">
          <div class="nav-group-title">{{ $t(group.labelKey) }}</div>
          <div
            v-for="item in group.items" :key="item.path"
            class="nav-item" :class="{ 'nav-item--active': activePath === item.path }"
            role="link" tabindex="0" @click="goDrawer(item.path)" @keydown.enter="goDrawer(item.path)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span class="nav-label">{{ $t(item.labelKey) }}</span>
          </div>
        </template>
      </nav>
      <div class="drawer-footer">
        <button class="back-btn" @click="$router.push('/dashboard')">
          <el-icon><Back /></el-icon>
          <span>{{ $t('admin.backToAdmin') }}</span>
        </button>
      </div>
    </el-drawer>

    <!-- REQ-041：入口级二次验证对话框（step-up 状态不足时弹出，验证通过后继续） -->
    <StepUpDialog v-model="stepUpVisible" @verified="onStepUpVerified" @cancel="onStepUpCancel" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../../stores/theme'
// REQ-037 批2 A4: 会话强校验 composable（与 ArtistLayout 共用单一实现；
// 原内联版依赖的 useArtistStore/safeSetItem/artistApi 随之收敛进 composable）
import { useSessionGuard } from '../../composables/useSessionGuard'
// REQ-041: 管理后台二次验证对话框（入口级守卫）
import StepUpDialog from './StepUpDialog.vue'
import { stepUpApi, type ApiError } from '../../api/index'
import { Management, User, ChatLineSquare, SetUp, Share, Files, Monitor, TrendCharts, Operation, Back, Warning, Bell } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const themeStore = useThemeStore()

// 纸墨 token 作用域（REQ-026）：挂载挂 html[data-artist-theme]，卸载摘除
// 挂/摘已由路由守卫统一管理（router/index.js beforeEach）——进入 /admin 提前挂 token，
// 切页间隙不闪白；离开后台摘除。此处仅保留幂等挂载双保险，不再卸载时摘除。
onMounted(() => themeStore.enterArtistScope())

// ─── 导航注册表（侧栏与抽屉共用，分组渲染） ───
const NAV_GROUPS = [
  { key: 'overview', labelKey: 'admin.navGroupOverview' },
  { key: 'ops', labelKey: 'admin.navGroupOps' },
  { key: 'config', labelKey: 'admin.navGroupConfig' }
]
const navItems = [
  { path: '/admin', icon: Management, labelKey: 'admin.panelTitle', group: 'overview' },
  { path: '/admin/artists', icon: User, labelKey: 'admin.artistManage', group: 'ops' },
  // REQ-042: 举报处理
  { path: '/admin/reports', icon: Warning, labelKey: 'compliance.admin.reportManage', group: 'ops' },
  // REQ-043 I4: 公告编辑（与举报处理并存）
  { path: '/admin/announcement', icon: Bell, labelKey: 'announcement.admin.manage', group: 'ops' },
  { path: '/admin/greetings', icon: ChatLineSquare, labelKey: 'admin.greetingManage', group: 'ops' },
  { path: '/admin/default-workflow', icon: SetUp, labelKey: 'admin.defaultWorkflow', group: 'ops' },
  { path: '/admin/platforms', icon: Share, labelKey: 'admin.platformManage', group: 'config' },
  // 815 第三批 I 路: 系统增项模板管理
  { path: '/admin/addon-templates', icon: Files, labelKey: 'admin.addonTemplates', group: 'config' },
  { path: '/admin/health', icon: Monitor, labelKey: 'admin.health.title', group: 'config' },
  { path: '/admin/analytics', icon: TrendCharts, labelKey: 'admin.tracking.title', group: 'config' }
]

// 分组渲染：按 NAV_GROUPS 顺序展平为 [{ group, items }]
const groupedNav = computed(() =>
  NAV_GROUPS.map(group => ({
    ...group,
    items: navItems.filter(item => item.group === group.key)
  }))
)

// 导航高亮：精确命中导航项 → 该路径；其余 /admin/*（含详情子路由）统一归管理员面板
// （路由层已把未知 /admin 路径 redirect 回 /admin，故不在此做前缀归属）
const activePath = computed(() => {
  const p = route.path
  const exact = navItems.find(item => item.path === p)
  if (exact) return p
  if (p.startsWith('/admin')) return '/admin'
  return p
})

/** 顶栏标题：当前导航项的 labelKey（移动端显示） */
const pageTitle = computed(() => {
  const hit = navItems.find(item => item.path === activePath.value)
  return hit ? t(hit.labelKey) : t('admin.panelTitle')
})

// ─── 响应式：≤900px 收窄图标条 / ≤600px 隐藏走抽屉 ───
const isNarrow = ref(window.matchMedia('(max-width: 900px)').matches)
const isMobile = ref(window.matchMedia('(max-width: 600px)').matches)
const drawerVisible = ref(false)

const mqNarrow = window.matchMedia('(max-width: 900px)')
const mqMobile = window.matchMedia('(max-width: 600px)')
function onNarrowChange(e: MediaQueryListEvent) { isNarrow.value = e.matches }
function onMobileChange(e: MediaQueryListEvent) { isMobile.value = e.matches }

onMounted(() => {
  mqNarrow.addEventListener('change', onNarrowChange)
  mqMobile.addEventListener('change', onMobileChange)
  validateSession() // G-1: 服务端会话强校验（成败均静默处理，不阻塞骨架渲染）
  checkStepUp() // REQ-041: 入口级 step-up 探测（30 分钟窗口内免弹，由后端判定）
})
onUnmounted(() => {
  mqNarrow.removeEventListener('change', onNarrowChange)
  mqMobile.removeEventListener('change', onMobileChange)
})

// 窗口变宽时自动关闭抽屉
watch(isMobile, (mobile) => { if (!mobile) drawerVisible.value = false })

const collapsed = computed(() => isNarrow.value)
// 813-fq-tail-shared 战役 S：侧栏宽度走 CSS 变量单源（--sb-w-collapsed/--sb-w），数值见下方 scoped 样式
const asideWidth = computed(() => collapsed.value ? 'var(--sb-w-collapsed)' : 'var(--sb-w)')

function go(path: string) {
  if (route.path !== path) router.push(path)
}
function goDrawer(path: string) {
  drawerVisible.value = false
  go(path)
}

// ─── G-1（P2-8）: 后台会话强校验（REQ-037 批2 A4: 逻辑收敛进 useSessionGuard，ArtistLayout 同款复用） ───
const { validateSession } = useSessionGuard()

// ─── REQ-041: 管理后台二次验证（会话升级）入口级守卫 ───
const stepUpVisible = ref(false)
const stepUpChecking = ref(false)
// 首次探测完成前不渲染子路由（避免后台请求在验证弹窗背后先行触发）
const stepUpInitializing = ref(true)

/** 探测 step-up 状态：不足（401 STEP_UP_REQUIRED）→ 弹验证；窗口内 → 免弹 */
async function checkStepUp() {
  if (stepUpChecking.value) return
  stepUpChecking.value = true
  try {
    await stepUpApi.status()
  } catch (err) {
    // 只响应后端 401 码；其余（网络/权限等）交由 useSessionGuard 兜底，不阻塞骨架
    const e = err as ApiError
    if (e.status === 401 && e.code === 'STEP_UP_REQUIRED') {
      stepUpVisible.value = true
    }
  } finally {
    stepUpChecking.value = false
    stepUpInitializing.value = false
  }
}

/** 验证通过：cookie 已覆盖为升级 token，后续 admin API 自然放行 */
function onStepUpVerified() {
  stepUpVisible.value = false
}

/** 取消验证：未升级不得停留在管理后台 → 回画师后台 */
function onStepUpCancel() {
  stepUpVisible.value = false
  router.push('/dashboard')
}
</script>

<style scoped>
/* ═══ 骨架（token 全部走 artist-tokens.css；主内容区 1280 居中） ═══ */
.admin-layout {
  /* 813-fq-tail-shared 战役 S：侧栏折叠/展开宽度与辅助字号抽为内联 CSS 变量
     （--sb-w-collapsed/--sb-w/--fs-aux 本文件单源；如需并入 theme.css 管理台区，
      平移下面三行即可，勿再写回字面量） */
  --sb-w-collapsed: 64px;
  --sb-w: 230px;
  --fs-aux: 13.5px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--f-b);
  font-size: var(--fs-aux);
  min-height: 100vh;
}

/* ─── 侧边栏（宣纸=纸色 / 墨黑=松烟，随主题变量自动切换） ─── */
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
  display: flex; align-items: center; gap: 12px;
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
  border-radius: var(--r-m);
  transform: rotate(-4deg);
  box-shadow: 2px 2px 0 var(--sb-seal-shadow);
  flex: none;
  /* T 波：弹性缓动 cubic-bezier(.3,1.5,.4,1) → --ease-out（印章 hover 旋转收敛，无视觉断裂） */
  transition: transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast);
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

/* ─── 导航（激活态花青软底 + 左侧 3px 竖条，与 ArtistLayout 一致） ─── */
.nav { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 12px; }
.nav--collapsed { padding: 4px 12px; }
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px;
  border-radius: var(--r-m);
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--sb-text);
  cursor: pointer;
  position: relative;
  user-select: none;
  /* T 波：ease-out 关键字 → --ease-out token */
  transition: color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast) var(--ease-out);
}
.nav-item:hover { color: var(--sb-text-on); background: var(--sb-hover); }
.nav-item:active { transform: scale(0.98); }
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
  border-radius: 0;
  /* 点名2: 激活竖条自上而下滑入（transform-origin top, --dur-mid） */
  transform-origin: top;
  animation: nav-bar-in var(--dur-mid) var(--ease-out);
}
@keyframes nav-bar-in {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.nav--collapsed .nav-item { justify-content: center; padding: 8px 0; }
.nav--collapsed .nav-item--active::before { left: -10px; }
.nav-item .el-icon { font-size: calc(var(--font-scale, 1) * 16px); flex: none; }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 分组标题：低饱和小字（--ink3），与激活项花青软底不抢视觉；折叠态由模板 v-if 隐藏 */
.nav-group-title {
  padding: 12px 16px 8px;
  font-size: 11px;
  color: var(--ink3);
  letter-spacing: .08em;
  white-space: nowrap;
  user-select: none;
}

/* ─── 底部返回区 ─── */
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--sb-border);
  display: flex; flex-direction: column; gap: 12px;
}
.sidebar-footer--collapsed { align-items: center; padding: 12px 8px; }
.back-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none; border-radius: var(--r-m);
  background: transparent;
  color: var(--sb-text-dim);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  /* T 波：ease-out 关键字 → --ease-out token */
  transition: color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast) var(--ease-out);
}
.back-btn:hover { color: var(--sb-text-on); background: var(--sb-hover); }
.back-btn:active { transform: scale(0.98); }
.sidebar-footer--collapsed .back-btn { width: auto; }

/* ─── 移动端顶栏 ─── */
.topbar {
  position: sticky; top: 0; z-index: 50;
  height: 54px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 0 28px;
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
.mobile-menu-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink);
  cursor: pointer;
  flex: none;
  /* K1（波2，灰沼教训）：背景随主题即时切换，不插值 */
  /* T 波：ease-out 关键字 → --ease-out token */
  transition: box-shadow var(--dur-fast), transform var(--dur-fast) var(--ease-out);
}
.mobile-menu-btn:hover { box-shadow: var(--sh-1); }
.mobile-menu-btn:active { transform: scale(0.98); }

/* ─── 主内容区（1280 居中，派工 A）─── */
.main-content {
  background: var(--paper);
  padding: 24px 28px;
  /* 824 响应式巡逻：对齐 ArtistLayout 口径——管理后台也挂命名容器，
     页内网格/表格断点改认容器宽（防「窗口宽而页窄」挤爆） */
  container-name: admin;
  container-type: inline-size;
  /* K1（波2，灰沼教训）：主内容区底色随主题即时切换，不插值 */
}
/* 内容容器：max-width 1280 居中（页面组件内部只写 .admin-page 语义类） */
.main-content :deep(.admin-page) {
  max-width: 1280px;
  margin: 0 auto;
}
.main-content :deep(.health-page),
.main-content :deep(.platform-manage) {
  max-width: 1280px;
  margin: 0 auto;
}
@media (max-width: 600px) {
  .main-content { padding: 16px; }
  .topbar { padding: 0 16px; }
}

/* ─── 移动端抽屉 ─── */
.mobile-drawer :deep(.el-drawer__body) {
  display: flex; flex-direction: column;
  padding: 0;
  background: var(--sb-bg);
}
.drawer-header { display: flex; align-items: center; gap: 12px; }
.nav--drawer { flex: 1; }
.drawer-footer {
  padding: 16px;
  border-top: 1px solid var(--sb-border);
  display: flex; flex-direction: column; gap: 12px;
}
.mobile-drawer :deep(.el-drawer-fade-enter-active),
.mobile-drawer :deep(.el-drawer-fade-leave-active) { transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); /* T 波：0.18s → --dur-fast(.15s) 就近等值 */ }
.mobile-drawer :deep(.el-drawer-fade-enter-from) { opacity: 0; }
.mobile-drawer :deep(.el-drawer-fade-leave-to) { opacity: 0; }
.mobile-drawer :deep(.el-drawer-fade-enter-from .ltr),
.mobile-drawer :deep(.el-drawer-fade-leave-to .ltr) { transform: translateY(8px); }

/* ═══ 清扫批#5: el-empty 空态插画纸墨化统一（从旧版布局继承，覆盖全部 admin 页） ═══ */
.admin-layout :deep(.el-empty) {
  --el-empty-fill-color-0: var(--paper2);
  --el-empty-fill-color-1: var(--line);
  --el-empty-fill-color-2: var(--line2);
  --el-empty-fill-color-3: var(--ink4);
  --el-empty-fill-color-4: var(--ink3);
  --el-empty-fill-color-5: var(--ink3);
  --el-empty-fill-color-6: var(--ink2);
  --el-empty-fill-color-7: var(--ink3);
  --el-empty-fill-color-8: var(--line);
  --el-empty-fill-color-9: var(--line2);
}
.admin-layout :deep(.el-empty__description) {
  color: var(--ink3);
}
</style>

<style>
/* 管理后台公共样式（813-fq-admindedup 战役 P2 去重）：AdminLayout 统一引入一次 */
@import '../../styles/admin-common.css';
</style>
