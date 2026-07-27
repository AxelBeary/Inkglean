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
  { path: '/orders/:id', name: 'ArtistOrderDetail', component: () => import('../views/artist/OrderDetail.vue'), meta: { titleKey: 'common.detail', requiresAuth: true } },
  { path: '/manual-order', name: 'ArtistManualOrder', component: () => import('../views/artist/ManualOrder.vue'), meta: { titleKey: 'menu.manualOrder', requiresAuth: true } },
  { path: '/settings', name: 'ArtistSettings', component: () => import('../views/artist/Settings.vue'), meta: { titleKey: 'menu.settings', requiresAuth: true } },
  { path: '/tiers', name: 'ArtistTiers', component: () => import('../views/artist/TierManage.vue'), meta: { titleKey: 'menu.tiers', requiresAuth: true } },
  { path: '/artworks', name: 'ArtistArtworks', component: () => import('../views/artist/ArtworkManage.vue'), meta: { titleKey: 'menu.artworks', requiresAuth: true } },
  { path: '/rules', name: 'ArtistRules', component: () => import('../views/artist/RulesEditor.vue'), meta: { titleKey: 'menu.rules', requiresAuth: true } },

  // ─── 管理员后台 ───
  { path: '/admin', name: 'AdminDashboard', component: () => import('../views/admin/AdminDashboard.vue'), meta: { titleKey: 'admin.panelTitle', requiresAdmin: true } },
  { path: '/admin/artists', name: 'AdminArtists', component: () => import('../views/admin/ArtistManage.vue'), meta: { titleKey: 'admin.manageArtists', requiresAdmin: true } },

  // ─── 404 ───
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/client/LandingPage.vue'), meta: { titleKey: 'pageTitle.notFound' } }
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

  // 检查认证
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const token = localStorage.getItem('artist_token')
    if (!token) {
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
