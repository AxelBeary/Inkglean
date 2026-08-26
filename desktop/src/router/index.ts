// 路由（825 波0 地基批）：hash 模式（tauri file 协议友好）。
// 方向 A 落码批：双模式守卫（已登录 或 本地模式均可进首页/悬浮窗）+ 撕悬浮三件内容路由。
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/Login.vue'
import HomeView from '../views/Home.vue'
import FloatView from '../components/home/FloatView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    // 撕悬浮三件：壳层按 prefs.torn 拉起独立小窗指向这些路由（纸墨小卡，各自取数）
    { path: '/float/timer', name: 'float-timer', component: FloatView, props: { kind: 'timer' }, meta: { requiresAuth: true } },
    { path: '/float/today-todo', name: 'float-today-todo', component: FloatView, props: { kind: 'today-todo' }, meta: { requiresAuth: true } },
    { path: '/float/deadline', name: 'float-deadline', component: FloatView, props: { kind: 'deadline' }, meta: { requiresAuth: true } },
    // 工具箱（波2）：价目分享卡（F3）/ 小票打印机（F4）——shared 哑组件的桌面宿主壳，双模式均可用（纯离线工具）
    { path: '/tools/price-card', name: 'tool-price-card', component: () => import('../views/tools/PriceCardTool.vue'), meta: { requiresAuth: true } },
    { path: '/tools/receipt', name: 'tool-receipt', component: () => import('../views/tools/ReceiptTool.vue'), meta: { requiresAuth: true } },
    { path: '/tools/profile', name: 'tool-profile', component: () => import('../views/tools/ProfileTool.vue'), meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

let restored = false
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!restored) {
    restored = true
    await auth.restore()
  }
  // 双模式纪律：已登录（云端）或本地模式均可进首页与悬浮窗路由
  if (to.meta.requiresAuth && !auth.loggedIn && !auth.localMode) return { name: 'login' }
  if (to.name === 'login' && auth.loggedIn) return { name: 'home' }
  return true
})

export default router
