import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import i18n from '../i18n/index.js'
import { useArtistStore } from '../stores/artist.js'
import { useThemeStore } from '../stores/theme.js'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage.js'

// ============================================
// 路由配置
// P2-C: meta.titleKey 使用 i18n key，不再硬编码中文
// ============================================

// 路由 meta 字段声明合并（vue-router 官方扩展方式）：titleKey/requiresAuth/requiresAdmin
declare module 'vue-router' {
  interface RouteMeta {
    titleKey?: string
    requiresAuth?: boolean
    requiresAdmin?: boolean
  }
}

/**
 * REQ-038 开箱向导路由定义（独立导出）：
 * 815 拍板 #6（A2 物理销毁）——初始化完成后从路由表移除；
 * 服务端判未初始化的逃逸口（api/index.ts 503 SETUP_REQUIRED）会重新注册回来。
 */
export const SETUP_ROUTE: RouteRecordRaw = { path: '/setup', name: 'SetupWizard', component: () => import('../views/setup/SetupWizard.vue'), meta: { titleKey: 'setup.pageTitle' } }

const routes: RouteRecordRaw[] = [
  // ─── 客户端（公开） ───
  { path: '/', name: 'Landing', component: () => import('../views/client/LandingPage.vue'), meta: { titleKey: 'pageTitle.home' } },
  // REQ-042: 合规静态页（隐私政策 / 服务条款，页脚可达）
  { path: '/privacy', name: 'PrivacyPolicy', component: () => import('../views/client/LegalDoc.vue'), meta: { titleKey: 'compliance.privacy.pageTitle' } },
  { path: '/terms', name: 'TermsOfService', component: () => import('../views/client/LegalDoc.vue'), meta: { titleKey: 'compliance.terms.pageTitle' } },
  { path: '/artist/:subdomain', name: 'ClientHome', component: () => import('../views/client/ArtistHome.vue'), meta: { titleKey: 'pageTitle.artistHome' } },
  { path: '/artist/:subdomain/order', name: 'ClientOrder', component: () => import('../views/client/OrderForm.vue'), meta: { titleKey: 'pageTitle.order' } },
  { path: '/artist/:subdomain/track', name: 'ClientTrack', component: () => import('../views/client/TrackOrder.vue'), meta: { titleKey: 'pageTitle.track' } },
  { path: '/artist/:subdomain/delivery/:orderNo', name: 'ClientDelivery', component: () => import('../views/client/DeliveryPage.vue'), meta: { titleKey: 'pageTitle.delivery' } },

  // ─── 画师后台 ───
  { path: '/login', name: 'ArtistLogin', component: () => import('../views/artist/Login.vue'), meta: { titleKey: 'pageTitle.login' } },
  // REQ-038: 开箱设置向导（未初始化时由守卫重定向进入；完成后永久失效跳登录）
  SETUP_ROUTE,
  // ─── 画师后台（REQ-037 批2 A1: 嵌套路由——ArtistLayout 经 ArtistLayoutRoute 载体全会话只挂载一次，
  //     消除切页骨架重挂与 getMe/留言角标重复请求；路由 name/meta 逐字保留） ───
  {
    path: '/',
    component: () => import('../components/ArtistLayoutRoute.vue'),
    children: [
      { path: 'dashboard', name: 'ArtistDashboard', component: () => import('../views/artist/Dashboard.vue'), meta: { titleKey: 'menu.dashboard', requiresAuth: true } },
      { path: 'queue', name: 'ArtistQueue', component: () => import('../views/artist/QueueBoard.vue'), meta: { titleKey: 'menu.queue', requiresAuth: true } },
      { path: 'orders', name: 'ArtistOrders', component: () => import('../views/artist/OrderList.vue'), meta: { titleKey: 'menu.orders', requiresAuth: true } },
      { path: 'orders/new', name: 'ArtistManualOrder', component: () => import('../views/artist/ManualOrder.vue'), meta: { titleKey: 'menu.manualOrder', requiresAuth: true } },
      { path: 'orders/:id', name: 'ArtistOrderDetail', component: () => import('../views/artist/OrderDetail.vue'), meta: { titleKey: 'common.detail', requiresAuth: true } },
      { path: 'settings', name: 'ArtistSettings', component: () => import('../views/artist/Settings.vue'), meta: { titleKey: 'menu.settings', requiresAuth: true } },
      // #44: 偏好独立页面（从主页设置拆出，主页对外/偏好对内）
      { path: 'preferences', name: 'ArtistPreferences', component: () => import('../views/artist/Preferences.vue'), meta: { titleKey: 'menu.preferences', requiresAuth: true } },
      // 工具箱收纳（纸墨提案 §5.5）：首页四分类格，15 个子路由保持原路径不变
      { path: 'tools', name: 'ArtistToolbox', component: () => import('../views/artist/ToolsHome.vue'), meta: { titleKey: 'menu.toolbox', requiresAuth: true } },
      // REQ-035 批D: 今天吃什么（工具子页）
      { path: 'tools/food', name: 'ArtistFoodMenu', component: () => import('../views/artist/FoodMenu.vue'), meta: { titleKey: 'menu.foodMenu', requiresAuth: true } },
      // REQ-035 批D: 图片水印（工具页）
      { path: 'tools/watermark', name: 'ArtistWatermark', component: () => import('../views/artist/Watermark.vue'), meta: { titleKey: 'menu.watermark', requiresAuth: true } },
      // REQ-031 A1: 收入导出 CSV（工具页）
      { path: 'tools/export', name: 'ArtistToolsExport', component: () => import('../views/artist/ToolsExport.vue'), meta: { titleKey: 'menu.toolsExport', requiresAuth: true } },
      // REQ-035 批C: 散单记账（工具页）
      { path: 'tools/income', name: 'ArtistStandaloneIncome', component: () => import('../views/artist/StandaloneIncome.vue'), meta: { titleKey: 'menu.standaloneIncome', requiresAuth: true } },
      // REQ-035 批E: 进度对比拼图（工具页）
      { path: 'tools/puzzle', name: 'ArtistPuzzlePage', component: () => import('../views/artist/PuzzlePage.vue'), meta: { titleKey: 'menu.puzzle', requiresAuth: true } },
      // REQ-035 批E: 排期公示（工具页）
      { path: 'tools/schedule', name: 'ArtistScheduleSharePage', component: () => import('../views/artist/ScheduleSharePage.vue'), meta: { titleKey: 'menu.scheduleShare', requiresAuth: true } },
      { path: 'tools/clients', name: 'ArtistClientsPage', component: () => import('../views/artist/ClientsPage.vue'), meta: { titleKey: 'menu.clientTags', requiresAuth: true } },
      { path: 'tools/returning', name: 'ArtistReturningClients', component: () => import('../views/artist/ReturningClients.vue'), meta: { titleKey: 'menu.returningClients', requiresAuth: true } },
      // REQ-035 工具集后置: 稿价计算器（工具页）
      { path: 'tools/price-calc', name: 'ArtistPriceCalculator', component: () => import('../views/artist/PriceCalculator.vue'), meta: { titleKey: 'menu.priceCalc', requiresAuth: true } },
      // REQ-035 工具集后置: 社恐轻松回复（工具页）
      { path: 'tools/reply', name: 'ArtistSocialReply', component: () => import('../views/artist/SocialReply.vue'), meta: { titleKey: 'menu.socialReply', requiresAuth: true } },
      // REQ-035 工具集后置: 速记剪切板（工具页）
      { path: 'tools/note', name: 'ArtistQuickNote', component: () => import('../views/artist/QuickNote.vue'), meta: { titleKey: 'menu.quickNote', requiresAuth: true } },
      // 812 工具波 B: ④价目分享卡 / ⑤交付检查清单 / ⑥定金台账（纯前端本地工具，只追加）
      { path: 'tools/price-card', name: 'ArtistPriceCard', component: () => import('../views/artist/PriceCard.vue'), meta: { titleKey: 'menu.priceCard', requiresAuth: true } },
      // oimimo 吸纳批五：小票打印机（纯前端本地工具，只追加）
      { path: 'tools/receipt', name: 'ArtistReceiptPrinter', component: () => import('../views/artist/ReceiptPrinter.vue'), meta: { titleKey: 'menu.receiptPrinter', requiresAuth: true } },
      { path: 'tools/delivery-checklist', name: 'ArtistDeliveryChecklist', component: () => import('../views/artist/DeliveryChecklist.vue'), meta: { titleKey: 'menu.deliveryChecklist', requiresAuth: true } },
      { path: 'tools/deposit', name: 'ArtistDepositLedger', component: () => import('../views/artist/DepositLedger.vue'), meta: { titleKey: 'menu.deposit', requiresAuth: true } },
      // REQ-035 工具集后置: 截稿日建议（工具页）
      { path: 'tools/deadline', name: 'ArtistDeadlineAdvice', component: () => import('../views/artist/DeadlineAdvice.vue'), meta: { titleKey: 'menu.deadlineAdvice', requiresAuth: true } },
      // 812-tools-a: 报价单生成（工具页）
      { path: 'tools/quote', name: 'ArtistQuote', component: () => import('../views/artist/Quote.vue'), meta: { titleKey: 'menu.quote', requiresAuth: true } },
      // 812-tools-a: 改稿计数器已随 v128 下架（订单详情改用真实修改记录）
      // 812-tools-a: 压图改尺寸（工具页）
      { path: 'tools/image-resize', name: 'ArtistImageResize', component: () => import('../views/artist/ImageResize.vue'), meta: { titleKey: 'menu.imageResize', requiresAuth: true } },
      { path: 'stats', name: 'ArtistStats', component: () => import('../views/artist/StatsPage.vue'), meta: { titleKey: 'menu.stats', requiresAuth: true } },
      // 817 修复：价格管理归入嵌套路由（TierManage 不再内嵌 ArtistLayout，布局单实例不重挂）
      { path: 'tiers', name: 'ArtistTiers', component: () => import('../views/artist/TierManage.vue'), meta: { titleKey: 'menu.tiers', requiresAuth: true } },
      { path: 'artworks', name: 'ArtistArtworks', component: () => import('../views/artist/ArtworkManage.vue'), meta: { titleKey: 'menu.artworks', requiresAuth: true } },
      // #1: 留言管理独立页面（v0.24-C）
      { path: 'guestbook', name: 'ArtistGuestbook', component: () => import('../views/artist/GuestbookManage.vue'), meta: { titleKey: 'menu.guestbook', requiresAuth: true } },
      // v0.26 C: 开稿管理独立页（名额/额度/队列行为，从设置页移出）
      // REQ-040: 账号与安全
      { path: 'account', name: 'ArtistAccount', component: () => import('../views/artist/AccountSecurity.vue'), meta: { titleKey: 'menu.account', requiresAuth: true } },
      { path: 'slots', name: 'ArtistSlots', component: () => import('../views/artist/SlotManage.vue'), meta: { titleKey: 'menu.slots', requiresAuth: true } }
    ]
  },
  // REQ-015: 旧手动录单链接重定向到新独立页面（不断链）
  { path: '/manual-order', redirect: '/orders/new' },
  // R42b: 须知编辑合并进设置页（旧链接重定向，不 404）
  // REQ-016 A: 须知并入「主页展示」tab（showcase）
  { path: '/rules', redirect: '/settings?tab=showcase' },

  // ─── 管理员后台（#68: 顶部 Tab 导航，嵌套路由） ───
  {
    path: '/admin',
    component: () => import('../components/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      { path: '', name: 'AdminDashboard', component: () => import('../views/admin/AdminDashboard.vue'), meta: { titleKey: 'admin.panelTitle', requiresAdmin: true } },
      { path: 'artists', name: 'AdminArtists', component: () => import('../views/admin/ArtistManage.vue'), meta: { titleKey: 'admin.manageArtists', requiresAdmin: true } },
      { path: 'greetings', name: 'AdminGreetings', component: () => import('../views/admin/GreetingManage.vue'), meta: { titleKey: 'admin.greetingManage', requiresAdmin: true } },
      { path: 'default-workflow', name: 'AdminDefaultWorkflow', component: () => import('../views/admin/DefaultWorkflowEditor.vue'), meta: { titleKey: 'admin.defaultWorkflow', requiresAdmin: true } },
      // REQ-022 F2: 社交平台管理
      { path: 'platforms', name: 'AdminPlatforms', component: () => import('../views/admin/PlatformManage.vue'), meta: { titleKey: 'admin.platformManage', requiresAdmin: true } },
      // 815 第三批 I 路: 系统增项模板管理
      { path: 'addon-templates', name: 'AdminAddonTemplates', component: () => import('../views/admin/AddonTemplateManage.vue'), meta: { titleKey: 'admin.addonTemplates', requiresAdmin: true } },
      // HC: 系统自检
      { path: 'health', name: 'AdminHealthCheck', component: () => import('../views/admin/HealthCheck.vue'), meta: { titleKey: 'pageTitle.healthCheck', requiresAdmin: true } },
      // REQ-033 埋点看板
      { path: 'analytics', name: 'AdminAnalytics', component: () => import('../views/admin/TrackingAnalytics.vue'), meta: { titleKey: 'admin.tracking.title', requiresAdmin: true } },
      // REQ-042: 举报处理
      { path: 'reports', name: 'AdminReports', component: () => import('../views/admin/ReportManage.vue'), meta: { titleKey: 'compliance.admin.reportManage', requiresAdmin: true } },
      // REQ-043 I4: 公告编辑
      { path: 'announcement', name: 'AdminAnnouncement', component: () => import('../views/admin/AnnouncementManage.vue'), meta: { titleKey: 'announcement.admin.manage', requiresAdmin: true } }
    ]
  },

  // ─── 404 ───
  // v0.34 任务A：独立 404 页（不再复用 LandingPage）
  // 巡检修复批 C11: 后台/管理端未知路径重定向回各自首页（客户端保持 404 页）
  { path: '/dashboard/:pathMatch(.*)*', redirect: '/dashboard' },
  { path: '/admin/:pathMatch(.*)*', redirect: '/admin' },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/client/NotFound.vue'), meta: { titleKey: 'pageTitle.notFound' } }
]

const router = createRouter({ history: createWebHistory(), routes })

// 815 拍板 #6（A2 物理销毁）：已初始化的系统启动即移除 /setup 路由（直访落 NotFound）；
// 源码保留定义，服务端重置后由逃逸口 addRoute 自动回归
if (safeGetItem('setup_initialized') === '1') {
  router.removeRoute('SetupWizard')
}

/**
 * 站内重定向白名单（a3 防御加固）：仅放行同源 http(s) 路径。
 * `/\evil.com`、`//evil.com` 等经 URL 解析会落跨源 origin，一律拒绝；
 * 防未来把 redirect 交给 window.location 赋值时开出开放重定向。
 */
function isSafeInternalRedirect(raw: string): boolean {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return false
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return false
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    // 编码斜杠兜底：解码后仍以 // 或 /\ 开头的一律拒绝
    const decoded = decodeURIComponent(url.pathname + url.search)
    if (decoded.startsWith('//') || decoded.startsWith('/\\')) return false
  } catch {
    return false
  }
  return true
}

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  // REQ-038: 开箱设置初始化守卫
  // 跳过已初始化检查的路由，避免无限循环；存储一律走 safe 封装（G-5：存储禁用不卡路由）
  if (to.name !== 'SetupWizard' && to.name !== 'ArtistLogin' && to.name !== 'NotFound') {
    const setupDone = safeGetItem('setup_initialized')
    if (setupDone !== '1') {
      try {
        const res = await fetch('/api/setup/status')
        if (!res.ok && res.status === 503) {
          // a3: 服务端重置后（503 SETUP_REQUIRED）清陈旧缓存并跳开箱向导，与 api 拦截器行为对齐
          try {
            const data = await res.json()
            if (data?.code === 'SETUP_REQUIRED') {
              safeRemoveItem('setup_initialized')
              return next({ name: 'SetupWizard' })
            }
          } catch { /* 非 JSON 错误体，按放行处理 */ }
        }
        // res.ok 守卫：其余 404/5xx 的 JSON 不带 initialized，不得误触重定向
        if (res.ok) {
          const data = await res.json()
          if (data.initialized === false) {
            return next({ name: 'SetupWizard' })
          }
          // 缓存已初始化状态
          safeSetItem('setup_initialized', '1')
        }
      } catch (err) {
        // 网络异常，放行避免卡死
        // eslint-disable-next-line no-console -- setup 守卫 fail-open 降级链路需留痕
        console.warn('[setup] 初始化状态检查失败，放行', err)
      }
    }
  }
  // 已初始化状态下访问 /setup → 重定向到 /login
  if (to.name === 'SetupWizard' && safeGetItem('setup_initialized') === '1') {
    return next({ name: 'ArtistLogin' })
  }
  // P2-C: 页面标题通过 i18n key 动态渲染
  const titleKey = to.meta.titleKey
  if (titleKey) {
    document.title = `${i18n.global.t(titleKey)} - ${i18n.global.t('landing.title')}`
  } else {
    document.title = i18n.global.t('landing.title')
  }

  // 后台 token 作用域统一由路由守卫管理（根治深色模式切页闪白）：
  // 进入 requiresAuth/requiresAdmin/登录页时提前挂 data-artist-theme，组件懒加载期间 token 不丢；
  // 离开后台路由时摘除，客户端路由零影响（ArtistLayout/AdminLayout 不再自行摘除）。
  // 登录页属后台作用域：与 dashboard 同域，login→后台过渡全程 attr 不摘，
  // 否则 onUnmounted 摘除竞态会造成墨黑登录闪白（2026-08-12 用户实测抓出）
  const themeStore = useThemeStore()
  if (to.meta.requiresAuth || to.meta.requiresAdmin || to.name === 'ArtistLogin') {
    themeStore.enterArtistScope()
  } else {
    themeStore.leaveArtistScope()
  }

  // 检查认证（token 在 httpOnly cookie 中，JS 不可读）
  // REQ-043 I6-e: 单一数据源 = Pinia store（store 初始化时读 localStorage 快速路径，
  // 写入一律走 store action，守卫不再直接读写 localStorage）
  const artistStore = useArtistStore()
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    // P3-10: 存储禁用/未登录时按未登录处理（跳登录页），不让守卫抛错白屏
    if (!artistStore.loggedIn) {
      return next({ name: 'ArtistLogin', query: { redirect: to.fullPath } })
    }
  }

  if (to.meta.requiresAdmin && !artistStore.isAdmin) {
    return next({ name: 'ArtistDashboard' })
  }

  // 反向守卫：已登录访问 /login 直接回后台（不在登录页逗留）；
  // 带 redirect 参数则回原目标（仅放行站内路径，防开放重定向）
  if (to.name === 'ArtistLogin' && artistStore.loggedIn) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : ''
    if (isSafeInternalRedirect(redirect)) return next(redirect)
    return next({ name: 'ArtistDashboard' })
  }

  next()
})

export default router
