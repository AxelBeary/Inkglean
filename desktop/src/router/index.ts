// 路由（825 波0 地基批）：hash 模式（tauri file 协议友好）；未登录一律回登录页。
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/Login.vue'
import HomeView from '../views/Home.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
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
  if (to.meta.requiresAuth && !auth.loggedIn) return { name: 'login' }
  if (to.name === 'login' && auth.loggedIn) return { name: 'home' }
  return true
})

export default router
