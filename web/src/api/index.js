import axios from 'axios'

// ============================================
// API 请求封装
// ============================================

const api = axios.create({
  baseURL: '/api',
  timeout: 15000
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
  err => {
    const msg = err.response?.data?.error || '网络错误，请稍后重试'
    // 401 时清除本地 Token
    if (err.response?.status === 401) {
      localStorage.removeItem('artist_token')
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
  getProfile: (subdomain) => api.get(`/artists/${subdomain}`)
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
  getOrders: (status) => api.get('/artist/orders', { params: { status } }),
  getQueue: () => api.get('/artist/queue'),
  getOrder: (id) => api.get(`/artist/orders/${id}`),
  createManualOrder: (data) => api.post('/artist/orders/manual', data),
  updateStatus: (id, status) => api.put(`/artist/orders/${id}/status`, { status }),
  updatePriority: (id, priority) => api.put(`/artist/orders/${id}/priority`, { priority }),
  reorderQueue: (draggedOrderId, targetPosition) =>
    api.put('/artist/queue/reorder', { draggedOrderId, targetPosition }),
  addNote: (id, content) => api.post(`/artist/orders/${id}/notes`, { content }),
  deliver: (id, data) => api.post(`/artist/orders/${id}/deliver`, data),
  // 统计
  getStats: () => api.get('/artist/stats')
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
  getStats: () => api.get('/admin/stats')
}
