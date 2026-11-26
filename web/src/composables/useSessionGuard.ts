// REQ-037 批2 A4: 后台会话服务端强校验（ArtistLayout/AdminLayout 重复代码收敛）
// 路由守卫的 store 检查只管 UX 快速路径（未登录先跳登录页）；
// 真实边界在布局挂载后调 /api/auth/me 以服务端为准校验：
// 成功 → isAdmin 以服务端为准修正 store，走 store action 同步持久标记（issue #52-3）；
//         下修（管理员→非管理员）且仍停留在管理页时强制重定向离开（F0247）；
// 401/403 → 复用既有登出逻辑清标记跳登录；
// 其余错误 → 不登出但留痕，不再无痕吞掉（F0248）。
import { useRouter } from 'vue-router'
import { useArtistStore } from '../stores/artist'
import { artistApi } from '../api/index'
import { ElMessage } from 'element-plus'
import i18n from '../i18n/index'

export function useSessionGuard() {
  const store = useArtistStore()
  const router = useRouter()

  async function validateSession(): Promise<void> {
    try {
      const me = await artistApi.getMe()
      const serverAdmin = !!me.isAdmin
      if (serverAdmin !== store.isAdmin) {
        // F0247: 下修只改 store 不重定向，陈旧管理员标志可继续停留后台页直到下次导航；
        // 与路由守卫 U28(b) 同款口径——requiresAdmin 路由上提示并踢回画师首页（画师页本就有权停留）。
        const demoted = !serverAdmin
        store.setAdminFlag(serverAdmin)
        if (demoted && router.currentRoute.value?.meta?.requiresAdmin) {
          ElMessage.warning(i18n.global.t('router.insufficientPermission'))
          router.push({ name: 'ArtistDashboard' })
        }
      }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401 || status === 403) {
        await store.logout()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          router.push({ name: 'ArtistLogin' })
        }
      } else {
        // F0248: 非鉴权错误（网络/5xx）此前被静默吞掉、零反馈零留痕；此处留痕便于排障。
        // 不弹打断性 UI、不登出：瞬时故障不该踢掉有效会话，与 G-1 静默骨架口径兼容。
        console.warn('[useSessionGuard] 会话服务端校验失败（非 401/403，保持当前会话）', err) // eslint-disable-line no-console -- F0248 失败留痕，不改变降级行为
      }
    }
  }

  return { validateSession }
}
