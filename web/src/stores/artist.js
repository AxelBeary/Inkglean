import { defineStore } from 'pinia'
import { authApi, artistApi } from '../api/index.js'

// ============================================
// 画师状态管理
// ============================================

export const useArtistStore = defineStore('artist', {
  state: () => ({
    token: localStorage.getItem('artist_token') || null,
    profile: null,
    stats: null,
    loading: false,
    isAdmin: localStorage.getItem('artist_is_admin') === '1'
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    artistName: (state) => state.profile?.name || '画师',
    subdomain: (state) => state.profile?.subdomain || ''
  },

  actions: {
    // 登录
    async login(qqNumber, code) {
      const res = await authApi.verify(qqNumber, code)
      this.token = res.token
      this.isAdmin = !!res.isAdmin
      localStorage.setItem('artist_token', res.token)
      localStorage.setItem('artist_is_admin', res.isAdmin ? '1' : '0')
      this.profile = res.artist
      return res
    },

    // 获取当前画师信息
    async fetchProfile() {
      if (!this.token) return
      this.loading = true
      try {
        this.profile = await artistApi.getProfile()
      } catch (err) {
        // Token 失效
        this.logout()
        throw err
      } finally {
        this.loading = false
      }
    },

    // 获取统计数据
    async fetchStats() {
      if (!this.token) return
      this.stats = await artistApi.getStats()
    },

    // 登出
    logout() {
      this.token = null
      this.profile = null
      this.stats = null
      this.isAdmin = false
      localStorage.removeItem('artist_token')
      localStorage.removeItem('artist_is_admin')
    }
  }
})
