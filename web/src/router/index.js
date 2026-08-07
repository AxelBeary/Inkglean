import { createRouter, createWebHistory } from 'vue-router'
import i18n from '../i18n/index.js'
import { useArtistStore } from '../stores/artist.js'

// ============================================
// 路由配置
// P2-C: meta.titleKey 使用 i18n key，不再硬编码中文
// ============================================

const routes = [
  // ─── 客户端（公开） ───
  { path: '/', name: 'Landing', component: () => import('../views/client/LandingPage.vue'), meta: { titleKey: 'pageTitle.home' } },
  { path: '/artist/:subdomain', name: 'ClientHome', component: () => import('../views/client/ArtistHome.vue'), meta: { titleKey: 'pageTitle.artistHome' } },
  { path: '/artist/:subdomain/order', name: 'ClientOrder', component: () => import('../views/client/OrderForm.vue'), meta: { titleKey: 'pageTitle.order' } },
  { path: '/artist/:subdomain/track', name: 'ClientTrack', component: () => import('../views/client/TrackOrder.vue'), meta: { titleKey: 'pageTitle.track' } },
  { path: '/artist/:subdomain/delivery/:orderNo', name: 'ClientDelivery', component: () => import('../views/client/DeliveryPage.vue'), meta: { titleKey: 'pageTitle.delivery' } },

  // ─── 画师后台 ───
  { path: '/login', name: 'ArtistLogin', component: () => import('../views/artist/Login.vue'), meta: { titleKey: 'pageTitle.login' } },
  { path: '/dashboard', name: 'ArtistDashboard', component: () => import('../views/artist/Dashboard.vue'), meta: { titleKey: 'menu.dashboard', requiresAuth: true } },
  { path: '/queue', name: 'ArtistQueue', component: () => import('../views/artist/QueueBoard.vue'), meta: { titleKey: 'menu.queue', requiresAuth: true } },
  { path: '/orders', name: 'ArtistOrders', component: () => import('../views/artist/OrderList.vue'), meta: { titleKey: 'menu.orders', requiresAuth: true } },
  { path: '/orders/new', name: 'ArtistManualOrder', component: () => import('../views/artist/ManualOrder.vue'), meta: { titleKey: 'menu.manualOrder', requiresAuth: true } },
  { path: '/orders/:id', name: 'ArtistOrderDetail', component: () => import('../views/artist/OrderDetail.vue'), meta: { titleKey: 'common.detail', requiresAuth: true } },
  // REQ-015: 旧手动录单链接重定向到新独立页面（不断链）
  { path: '/manual-order', redirect: '/orders/new' },
  { path: '/settings', name: 'ArtistSettings', component: () => import('../views/artist/Settings.vue'), meta: { titleKey: 'menu.settings', requiresAuth: true } },
  // #44: 偏好独立页面（从主页设置拆出，主页对外/偏好对内）
  { path: '/preferences', name: 'ArtistPreferences', component: () => import('../views/artist/Preferences.vue'), meta: { titleKey: 'menu.preferences', requiresAuth: true } },
  // REQ-035 批D: 今天吃什么（工具页）
  { path: '/tools/food', name: 'ArtistFoodMenu', component: () => import('../views/artist/FoodMenu.vue'), meta: { titleKey: 'menu.foodMenu', requiresAuth: true } },
  // REQ-031 A1: 收入导出 CSV（工具页）
  { path: '/tools/export', name: 'ArtistToolsExport', component: () => import('../views/artist/ToolsExport.vue'), meta: { titleKey: 'menu.toolsExport', requiresAuth: true } },
  { path: '/stats', name: 'ArtistStats', component: () => import('../views/artist/StatsPage.vue'), meta: { titleKey: 'menu.stats', requiresAuth: true } },
  { path: '/tiers', name: 'ArtistTiers', component: () => import('../views/artist/TierManage.vue'), meta: { titleKey: 'menu.tiers', requiresAuth: true } },
  { path: '/artworks', name: 'ArtistArtworks', component: () => import('../views/artist/ArtworkManage.vue'), meta: { titleKey: 'menu.artworks', requiresAuth: true } },
  // #1: 留言管理独立页面（v0.24-C）
  { path: '/guestbook', name: 'ArtistGuestbook', component: () => import('../views/artist/GuestbookManage.vue'), meta: { titleKey: 'menu.guestbook', requiresAuth: true } },
  // v0.26 C: 开稿管理独立页（名额/额度/队列行为，从设置页移出）
  { path: '/slots', name: 'ArtistSlots', component: () => import('../views/artist/SlotManage.vue'), meta: { titleKey: 'menu.slots', requiresAuth: true } },
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
      // HC: 系统自检
      { path: 'health', name: 'AdminHealthCheck', component: () => import('../views/admin/HealthCheck.vue'), meta: { titleKey: 'pageTitle.healthCheck', requiresAdmin: true } },
      // REQ-033 埋点看板
      { path: 'analytics', name: 'AdminAnalytics', component: () => import('../views/admin/TrackingAnalytics.vue'), meta: { titleKey: 'admin.tracking.title', requiresAdmin: true } }
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

// 路由守卫
router.beforeEach((to, from, next) => {
  // P2-C: 页面标题通过 i18n key 动态渲染
  const titleKey = to.meta.titleKey
  if (titleKey) {
    document.title = `${i18n.global.t(titleKey)} - ${i18n.global.t('landing.title')}`
  } else {
    document.title = i18n.global.t('landing.title')
  }

  // 检查认证（token 在 httpOnly cookie 中，JS 不可读；用非敏感标记判断）
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const loggedIn = localStorage.getItem('artist_logged_in') === '1'
    if (!loggedIn) {
      return next({ name: 'ArtistLogin', query: { redirect: to.fullPath } })
    }
  }

  if (to.meta.requiresAdmin) {
    // 从 Pinia store 读取（单一数据源），避免 localStorage key 不一致
    const artistStore = useArtistStore()
    if (!artistStore.isAdmin) return next({ name: 'ArtistDashboard' })
  }

  next()
})

export default router
