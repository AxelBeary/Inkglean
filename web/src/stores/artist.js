import { defineStore } from 'pinia'
import { authApi, artistApi } from '../api/index.js'

// ============================================
// 画师状态管理
// token 存 httpOnly cookie（JS 不可读），localStorage 只保留非敏感标记
// ============================================

export const useArtistStore = defineStore('artist', {
  state: () => ({
    loggedIn: localStorage.getItem('artist_logged_in') === '1',
    profile: null,
    stats: null,
    loading: false,
    isAdmin: localStorage.getItem('artist_is_admin') === '1'
  }),

  getters: {
    isLoggedIn: (state) => state.loggedIn,
    artistName: (state) => state.profile?.name || '画师',
    subdomain: (state) => state.profile?.subdomain || ''
  },

  actions: {
    // 登录
    async login(qqNumber, code) {
      const res = await authApi.verify(qqNumber, code)
      // token 已由后端设为 httpOnly cookie，前端只记录非敏感标记
      this.loggedIn = true
      this.isAdmin = !!res.isAdmin
      localStorage.setItem('artist_logged_in', '1')
      localStorage.setItem('artist_is_admin', res.isAdmin ? '1' : '0')
      this.profile = res.artist
      return res
    },

    // 获取当前画师信息
    async fetchProfile() {
      if (!this.loggedIn) return
      this.loading = true
      try {
        this.profile = await artistApi.getProfile()
      } catch (err) {
        // 仅 Token 失效（401）登出；其余异常原样抛出，由调用方决定兜底
        if (err.status === 401) this.logout()
        throw err
      } finally {
        this.loading = false
      }
    },

    // 获取统计数据
    async fetchStats() {
      if (!this.loggedIn) return
      this.stats = await artistApi.getStats()
    },

    // 登出
    async logout() {
      try { await authApi.logout() } catch { /* 静默 */ }
      this.loggedIn = false
      this.profile = null
      this.stats = null
      this.isAdmin = false
      localStorage.removeItem('artist_logged_in')
      localStorage.removeItem('artist_is_admin')
    }
  }
})
