import { defineStore } from 'pinia'
import { authApi, artistApi } from '../api/index'
import { i18n } from '../i18n/index'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage'
import type { AuthVerifyResult, ArtistProfileResult, ArtistStats } from '../api/types'

// ============================================
// 画师状态管理
// token 存 httpOnly cookie（JS 不可读），localStorage 只保留非敏感标记
// REQ-043 I6-e: 单一数据源 = Pinia store；localStorage 仅在 store 初始化时作
// 快速路径引导读取（刷新后免等 /auth/me），写入一律走 store action（applySession/logout），
// 路由守卫只读 store，不再各自读写 localStorage
// ============================================

/** 登录会话画像（authApi.verify 返回的 artist 子集） */
type SessionProfile = AuthVerifyResult['artist']

/** state.profile 可承载登录画像或完整资料 */
type ProfileState = SessionProfile | ArtistProfileResult | null

interface ArtistState {
  loggedIn: boolean
  profile: ProfileState
  stats: ArtistStats | null
  loading: boolean
  isAdmin: boolean
}

// WEB-12: 会话序号守卫——logout/applySession 时递增，使旧在途请求失效；
// 对比 useOrderPayments.ts:23 / ArtStyleManager.vue:564 已有 loadSeq 模式，
// 布尔守卫 if(!this.loggedIn) 无法拦截「logout→login(B) 后 A 的在途响应到达」场景
let sessionSeq = 0

/** WEB-13: 客户查单令牌 localStorage key（logout 时一并清理） */
const TRACK_LINKS_KEY = 'huiyue_track_links'

export const useArtistStore = defineStore('artist', {
  state: (): ArtistState => ({
    // P3-10: 存储禁用/隐私模式时安全读取，失败按未登录降级（防 state 工厂抛错白屏）
    loggedIn: safeGetItem('artist_logged_in') === '1',
    profile: null,
    stats: null,
    loading: false,
    isAdmin: safeGetItem('artist_is_admin') === '1'
  }),

  getters: {
    isLoggedIn: (state): boolean => state.loggedIn,
    artistName: (state): string => state.profile?.name || i18n.global.t('common.artist'),
    subdomain: (state): string => state.profile?.subdomain || ''
  },

  actions: {
    /**
     * 会话落地（登录/入驻/Passkey/开箱设置共用）：
     * 同步 store 状态 + 写 localStorage 非敏感标记（唯一写入口之一）
     */
    applySession(profile: ProfileState, isAdmin: boolean): void {
      // WEB-12: 新会话递增序号，使旧在途请求（fetchProfile/fetchStats）失效
      ++sessionSeq
      this.loggedIn = true
      this.isAdmin = !!isAdmin
      this.profile = profile || null
      // a3: 换会话时清掉上一画师的统计残留（B 登录后 fetchStats 返回前不闪 A 的数据）
      this.stats = null
      // WEB-12: 新会话重置 loading（旧在途请求的 finally 不再负责熄灭）
      this.loading = false
      safeSetItem('artist_logged_in', '1')
      safeSetItem('artist_is_admin', this.isAdmin ? '1' : '0')
    },

    // 登录
    async login(qqNumber: string, code: string): Promise<AuthVerifyResult> {
      const res = await authApi.verify(qqNumber, code)
      // token 已由后端设为 httpOnly cookie，前端只记录非敏感标记
      this.applySession(res.artist, res.isAdmin)
      return res
    },

    // 获取当前画师信息
    async fetchProfile(): Promise<void> {
      if (!this.loggedIn) return
      // WEB-12: 捕获当前会话序号（不递增——同一会话内并发 fetchProfile 不互斥）
      const mySeq = sessionSeq
      this.loading = true
      try {
        const profile = await artistApi.getProfile()
        // WEB-12: 会话已切换（logout/applySession 递增了 sessionSeq）→ 丢弃旧响应
        if (mySeq !== sessionSeq) return
        this.profile = profile
      } catch (err) {
        // WEB-12: 会话已切换 → 不触发 logout（旧会话的 401 不应影响新会话）
        if (mySeq !== sessionSeq) throw err
        // 仅 Token 失效（401）登出；其余异常原样抛出，由调用方决定兜底
        if ((err as { status?: number }).status === 401) this.logout()
        throw err
      } finally {
        // WEB-12: 过期响应不得提前熄灭新请求的 loading
        if (mySeq === sessionSeq) this.loading = false
      }
    },

    // 获取统计数据
    async fetchStats(): Promise<void> {
      if (!this.loggedIn) return
      // WEB-12: 捕获当前会话序号
      const mySeq = sessionSeq
      const stats = await artistApi.getStats()
      // WEB-12: 会话已切换 → 丢弃旧响应，不得回写新画师 stats
      if (mySeq !== sessionSeq) return
      this.stats = stats
    },

    // 登出
    async logout(): Promise<void> {
      // WEB-12: 登出递增序号，使旧在途请求失效
      ++sessionSeq
      // WEB-12: 重置 loading（旧在途请求的 finally 不再负责熄灭）
      this.loading = false
      try { await authApi.logout() } catch { /* 静默 */ }
      this.loggedIn = false
      this.profile = null
      this.stats = null
      this.isAdmin = false
      safeRemoveItem('artist_logged_in')
      safeRemoveItem('artist_is_admin')
      // WEB-13: 登出时清理客户查单令牌（明文 token 不得跨会话驻留）
      safeRemoveItem(TRACK_LINKS_KEY)
    }
  }
})
