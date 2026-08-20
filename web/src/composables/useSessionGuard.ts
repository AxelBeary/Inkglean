// REQ-037 批2 A4: 后台会话服务端强校验（ArtistLayout/AdminLayout 重复代码收敛）
// 路由守卫的 store 检查只管 UX 快速路径（未登录先跳登录页）；
// 真实边界在布局挂载后调 /api/auth/me 以服务端为准校验：
// 成功 → isAdmin 以服务端为准修正 store（localStorage 只由 store action 写，此处不再镜像）；
// 401/403 → 复用既有登出逻辑清标记跳登录。
import { useRouter } from 'vue-router'
import { useArtistStore } from '../stores/artist'
import { artistApi } from '../api/index'

export function useSessionGuard() {
  const store = useArtistStore()
  const router = useRouter()

  async function validateSession(): Promise<void> {
    try {
      const me = await artistApi.getMe()
      const serverAdmin = !!me.isAdmin
      if (serverAdmin !== store.isAdmin) {
        store.isAdmin = serverAdmin
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401 || status === 403) {
        await store.logout()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          router.push({ name: 'ArtistLogin' })
        }
      }
    }
  }

  return { validateSession }
}
