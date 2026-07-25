import { createRouter, createWebHistory } from 'vue-router'

// ============================================
// 路由配置
// ============================================

const routes = [
  // ─── 客户端（公开） ───
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/client/LandingPage.vue'),
    meta: { title: '画师约稿平台' }
  },
  {
    path: '/home',
    name: 'ClientHome',
    component: () => import('../views/client/ArtistHome.vue'),
    meta: { title: '画师主页' }
  },
  {
    path: '/order',
    name: 'ClientOrder',
    component: () => import('../views/client/OrderForm.vue'),
    meta: { title: '我要约稿' }
  },
  {
    path: '/track',
    name: 'ClientTrack',
    component: () => import('../views/client/TrackOrder.vue'),
    meta: { title: '查询进度' }
  },
  {
    path: '/delivery/:orderNo',
    name: 'ClientDelivery',
    component: () => import('../views/client/DeliveryPage.vue'),
    meta: { title: '下载作品' }
  },

  // ─── 画师后台 ───
  {
    path: '/login',
    name: 'ArtistLogin',
    component: () => import('../views/artist/Login.vue'),
    meta: { title: '画师登录' }
  },
  {
    path: '/dashboard',
    name: 'ArtistDashboard',
    component: () => import('../views/artist/Dashboard.vue'),
    meta: { title: '仪表盘', requiresAuth: true }
  },
  {
    path: '/queue',
    name: 'ArtistQueue',
    component: () => import('../views/artist/QueueBoard.vue'),
    meta: { title: '排期看板', requiresAuth: true }
  },
  {
    path: '/orders',
    name: 'ArtistOrders',
    component: () => import('../views/artist/OrderList.vue'),
    meta: { title: '订单管理', requiresAuth: true }
  },
  {
    path: '/orders/:id',
    name: 'ArtistOrderDetail',
    component: () => import('../views/artist/OrderDetail.vue'),
    meta: { title: '订单详情', requiresAuth: true }
  },
  {
    path: '/manual-order',
    name: 'ArtistManualOrder',
    component: () => import('../views/artist/ManualOrder.vue'),
    meta: { title: '手动录单', requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'ArtistSettings',
    component: () => import('../views/artist/Settings.vue'),
    meta: { title: '主页设置', requiresAuth: true }
  },
  {
    path: '/tiers',
    name: 'ArtistTiers',
    component: () => import('../views/artist/TierManage.vue'),
    meta: { title: '价格管理', requiresAuth: true }
  },
  {
    path: '/artworks',
    name: 'ArtistArtworks',
    component: () => import('../views/artist/ArtworkManage.vue'),
    meta: { title: '作品管理', requiresAuth: true }
  },
  {
    path: '/rules',
    name: 'ArtistRules',
    component: () => import('../views/artist/RulesEditor.vue'),
    meta: { title: '须知编辑', requiresAuth: true }
  },

  // ─── 管理员后台 ───
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { title: '管理员后台', requiresAdmin: true }
  },
  {
    path: '/admin/artists',
    name: 'AdminArtists',
    component: () => import('../views/admin/ArtistManage.vue'),
    meta: { title: '画师管理', requiresAdmin: true }
  },

  // ─── 404 ───
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/client/LandingPage.vue'),
    meta: { title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - 画师约稿` : '画师约稿平台'

  // 检查认证
  if (to.meta.requiresAuth || to.meta.requiresAdmin) {
    const token = localStorage.getItem('artist_token')
    if (!token) {
      return next({ name: 'ArtistLogin', query: { redirect: to.fullPath } })
    }
  }

  next()
})

export default router
