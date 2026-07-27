import axios from 'axios'

// ============================================
// API 请求封装
// ============================================

const API_TIMEOUT_MS = 15000

const api = axios.create({
  baseURL: '/api',
  timeout: API_TIMEOUT_MS
})

// 请求拦截器：自动附加 Token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('artist_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  res => res.data,
  async err => {
    const msg = err.response?.data?.error || '网络错误，请稍后重试'
    // 401 时清除所有本地认证状态并跳转登录页
    if (err.response?.status === 401) {
      localStorage.removeItem('artist_token')
      localStorage.removeItem('artist_is_admin')
      // 动态导入避免循环依赖（store/router 依赖本模块）
      try {
        const { useArtistStore } = await import('../stores/artist.js')
        const { default: router } = await import('../router/index.js')
        const store = useArtistStore()
        store.$reset()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          router.push({ name: 'ArtistLogin' })
        }
      } catch {
        // 兜底：硬跳转
        window.location.href = '/login'
      }
    }
    return Promise.reject(new Error(msg))
  }
)

export default api

// ─── 认证 ───
export const authApi = {
  sendCode: (qqNumber) => api.post('/auth/send-code', { qqNumber }),
  verify: (qqNumber, code) => api.post('/auth/verify', { qqNumber, code }),
  me: () => api.get('/auth/me')
}

// ─── 画师公开主页 ───
export const artistPublicApi = {
  getAll: () => api.get('/artists'),
  getProfile: (subdomain) => api.get(`/artists/${subdomain}`),
  getWorkflow: (subdomain) => api.get(`/artists/${subdomain}/workflow`)
}

// ─── 画师后台 ───
export const artistApi = {
  getProfile: () => api.get('/artist/profile'),
  updateProfile: (data) => api.put('/artist/profile', data),
  // 档位
  getTiers: () => api.get('/artist/tiers'),
  createTier: (data) => api.post('/artist/tiers', data),
  updateTier: (id, data) => api.put(`/artist/tiers/${id}`, data),
  deleteTier: (id) => api.delete(`/artist/tiers/${id}`),
  // 作品
  getArtworks: () => api.get('/artist/artworks'),
  createArtwork: (data) => api.post('/artist/artworks', data),
  deleteArtwork: (id) => api.delete(`/artist/artworks/${id}`),
  // 须知
  getRules: () => api.get('/artist/rules'),
  updateRules: (content) => api.put('/artist/rules', { content }),
  // 订单
  getOrders: (status, { page, pageSize } = {}) => api.get('/artist/orders', { params: { status, page, pageSize } }),
  getQueue: () => api.get('/artist/queue'),
  getOrder: (id) => api.get(`/artist/orders/${id}`),
  createManualOrder: (data) => api.post('/artist/orders/manual', data),
  updateStatus: (id, status) => api.put(`/artist/orders/${id}/status`, { status }),
  updatePriority: (id, priority) => api.put(`/artist/orders/${id}/priority`, { priority }),
  reorderQueue: (orderedIds) =>
    api.put('/artist/queue/reorder', { orderedIds }),
  addNote: (id, content) => api.post(`/artist/orders/${id}/notes`, { content }),
  deliver: (id, data) => api.post(`/artist/orders/${id}/deliver`, data),
  addReference: (id, data) => api.post(`/artist/orders/${id}/references`, data),
  // 统计
  getStats: () => api.get('/artist/stats'),
  // 问候语
  getGreeting: () => api.get('/artist/greeting'),
  // 流程与比例
  getWorkflow: () => api.get('/artist/workflow'),
  addStage: (data) => api.post('/artist/workflow', data),
  updateStage: (id, data) => api.put(`/artist/workflow/${id}`, data),
  deleteStage: (id) => api.delete(`/artist/workflow/${id}`),
  reorderStages: (orderedIds) => api.put('/artist/workflow/reorder', { orderedIds }),
  savePayment: (nodes) => api.put('/artist/workflow/payment', { nodes })
}

// ─── 客户端订单 ───
export const orderApi = {
  create: (data) => api.post('/orders', data),
  track: (orderNo, qq) => api.get(`/orders/track/${orderNo}`, { params: { qq } }),
  delivery: (orderNo, qq) => api.get(`/orders/delivery/${orderNo}`, { params: { qq } }),
  /** 凭 QQ 号查询在某画师处的所有订单（"不知道订单号"场景） */
  myOrders: (subdomain, qq) => api.get('/orders/my', { params: { subdomain, qq } }),
  /** 凭 QQ 号检查是否有订单（不记得订单号场景），返回联系信息 */
  lookup: (subdomain, qq) => api.get('/orders/lookup', { params: { subdomain, qq } })
}

// ─── 上传 ───
export const uploadApi = {
  image: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  reference: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/reference', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deliverable: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/deliverable', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}

// ─── 管理员 ───
export const adminApi = {
  getArtists: () => api.get('/admin/artists'),
  createArtist: (data) => api.post('/admin/artists', data),
  deleteArtist: (id) => api.delete(`/admin/artists/${id}`),
  getStats: () => api.get('/admin/stats'),
  getArtistOrders: (id) => api.get(`/admin/artists/${id}/orders`),
  updateArtistStatus: (id, status) => api.put(`/admin/artists/${id}/status`, { status }),
  transferAdmin: (data) => api.post('/admin/transfer', data),
  // 问候语 — 通用库
  getGreetings: (slot) => api.get('/admin/greetings', { params: { slot } }),
  createGreeting: (data) => api.post('/admin/greetings', data),
  updateGreeting: (id, data) => api.put(`/admin/greetings/${id}`, data),
  deleteGreeting: (id) => api.delete(`/admin/greetings/${id}`),
  // 问候语 — 画师专属库
  getArtistGreetings: (artistId) => api.get(`/admin/artists/${artistId}/greetings`),
  createArtistGreeting: (artistId, data) => api.post(`/admin/artists/${artistId}/greetings`, data),
  updateArtistGreeting: (artistId, gid, data) => api.put(`/admin/artists/${artistId}/greetings/${gid}`, data),
  deleteArtistGreeting: (artistId, gid) => api.delete(`/admin/artists/${artistId}/greetings/${gid}`),
  // 流程与比例 — 默认模板
  getDefaultWorkflow: () => api.get('/admin/default-workflow'),
  updateDefaultWorkflow: (nodes) => api.put('/admin/default-workflow', { nodes }),
  resetDefaultWorkflow: () => api.post('/admin/default-workflow/reset'),
  // 流程与比例 — 画师
  getArtistWorkflow: (artistId) => api.get(`/admin/artists/${artistId}/workflow`),
  adminAddStage: (artistId, data) => api.post(`/admin/artists/${artistId}/workflow`, data),
  adminUpdateStage: (artistId, sid, data) => api.put(`/admin/artists/${artistId}/workflow/${sid}`, data),
  adminDeleteStage: (artistId, sid) => api.delete(`/admin/artists/${artistId}/workflow/${sid}`),
  adminReorderStages: (artistId, orderedIds) => api.put(`/admin/artists/${artistId}/workflow/reorder`, { orderedIds }),
  adminSavePayment: (artistId, nodes) => api.put(`/admin/artists/${artistId}/workflow/payment`, { nodes }),
  // 画师全设置代理
  getArtistProfile: (id) => api.get(`/admin/artists/${id}/profile`),
  updateArtistProfile: (id, data) => api.put(`/admin/artists/${id}/profile`, data),
  getArtistTiers: (id) => api.get(`/admin/artists/${id}/tiers`),
  createArtistTier: (id, data) => api.post(`/admin/artists/${id}/tiers`, data),
  updateArtistTier: (id, tid, data) => api.put(`/admin/artists/${id}/tiers/${tid}`, data),
  deleteArtistTier: (id, tid) => api.delete(`/admin/artists/${id}/tiers/${tid}`),
  getArtistArtworks: (id) => api.get(`/admin/artists/${id}/artworks`),
  createArtistArtwork: (id, data) => api.post(`/admin/artists/${id}/artworks`, data),
  deleteArtistArtwork: (id, aid) => api.delete(`/admin/artists/${id}/artworks/${aid}`),
  getArtistRules: (id) => api.get(`/admin/artists/${id}/rules`),
  updateArtistRules: (id, content) => api.put(`/admin/artists/${id}/rules`, { content })
}
