import axios from 'axios'
import { safeRemoveItem } from '../utils/storage.js'

// ============================================
// API 请求封装
// ============================================

const API_TIMEOUT_MS = 15000

const api = axios.create({
  baseURL: '/api',
  timeout: API_TIMEOUT_MS,
  withCredentials: true // 发送 httpOnly cookie
})

// 响应拦截器：统一错误处理 + i18n 翻译
api.interceptors.response.use(
  res => res.data,
  async err => {
    const data = err.response?.data
    const code = data?.code
    let msg = data?.error || ''

    // 尝试用 i18n 翻译错误码
    if (code) {
      try {
        const { i18n } = await import('../i18n/index.js')
        const t = i18n.global.t
        const key = `errors.${code}`
        // detail 作为 i18n 命名插值参数（如 STAGES_RESET_BLOCKED 的 {count}）
        const params = data.detail && typeof data.detail === 'object' ? data.detail : undefined
        const translated = t(key, params)
        // 如果翻译成功（不是返回 key 本身），使用翻译后的消息
        if (translated !== key) {
          msg = translated
          // 如果有 detail，附加上下文
          if (data.detail?.name) msg = `${data.detail.name}：${msg}`
          if (data.detail?.code) msg = `${msg}（${data.detail.code}）`
        }
      } catch (err) {
        // L1: i18n 加载失败，使用原始消息（补 console.warn，避免静默吞错）
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 i18n 翻译失败静默吞错
        console.warn('[api] i18n error translation failed, using raw message', err)
      }
    }

    // D3: 无错误码/无 error 字段（网络错误等）时，兜底文案走 i18n 键
    if (!msg) {
      try {
        const { i18n } = await import('../i18n/index.js')
        msg = i18n.global.t('common.networkError')
      } catch {
        // i18n 加载失败（极端兜底）：退回简单英文文案，避免空白提示
        msg = 'Network error, please try again later'
      }
    }

    // 401 时清除本地认证状态并跳转登录页
    // P1-3 修复：登录相关错误码（CODE_INVALID/CODE_EXPIRED 等）不触发登出，只提示
    const LOGIN_CODES = ['CODE_INVALID', 'CODE_EXPIRED', 'CODE_TOO_MANY_ATTEMPTS', 'QQ_NOT_REGISTERED', 'MISSING_CREDENTIALS']
    if (err.response?.status === 401 && !LOGIN_CODES.includes(code)) {
      // P3-10: 存储禁用时 401 清标记也不得抛错（否则登出软跳转被吞）
      safeRemoveItem('artist_logged_in')
      safeRemoveItem('artist_is_admin')
      // 动态导入避免循环依赖（store/router 依赖本模块）
      try {
        const { useArtistStore } = await import('../stores/artist.js')
        const { default: router } = await import('../router/index.js')
        const store = useArtistStore()
        store.$reset()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          router.push({ name: 'ArtistLogin' })
        }
      } catch (err) {
        // L1: 兜底硬跳转（保留原行为，补 console.warn 避免静默吞错）
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 401 软跳转失败静默吞错
        console.warn('[api] 401 soft-redirect failed, falling back to hard redirect', err)
        window.location.href = '/login'
      }
    }
    // 05D-I1/E1: 错误对象附加 status/code（调用方可特判 404 等场景），不改变既有错误消息行为
    const wrapped = new Error(msg)
    if (err.response?.status) wrapped.status = err.response.status
    if (code) wrapped.code = code
    // 登录页重构（2026-08-10）：附带 detail（如 CODE_TOO_MANY_ATTEMPTS 的 remainingLockMs），
    // 调用方可做字段级呈现；纯增量，不影响既有 msg/status/code 行为
    if (data?.detail && typeof data.detail === 'object') wrapped.detail = data.detail
    return Promise.reject(wrapped)
  }
)

export default api

// ─── 认证 ───
export const authApi = {
  // REQ-027: QQ 号 + TOTP 动态口令登录（替代旧登录码）
  verify: (qqNumber, code) => api.post('/auth/verify', { qqNumber, code }),
  me: () => api.get('/auth/me'),
  // H-2 修复：补全登出接口，清除 httpOnly cookie
  logout: () => api.post('/auth/logout')
}

// ─── 画师公开主页 ───
export const artistPublicApi = {
  getAll: () => api.get('/artists'),
  getProfile: (subdomain) => api.get(`/artists/${subdomain}`),
  getWorkflow: (subdomain) => api.get(`/artists/${subdomain}/workflow`),
  // 价格计算器
  getPricing: (subdomain) => api.get(`/public/pricing/${subdomain}`),
  // v0.31 F3: 折扣码验证（公开，限流 20次/5分钟）
  validateDiscount: (data) => api.post('/public/validate-discount', data),
  // v0.32 REQ-023 Phase2: 多画风公开配置 + 价格计算
  getPublicStyles: (subdomain) => api.get(`/public/styles/${subdomain}`),
  calculateStylePrice: (data) => api.post('/public/calculate-style-price', data),
  // v0.35 F6: 画廊专用端点（作品 size_tags/描述 + filterSizes 筛选档位）
  getPublicGallery: (subdomain) => api.get(`/public/gallery/${subdomain}`),
  // v0.42 Step 6: 公开作品分页（10/页 + 加载更多；封面置顶）
  getPublicArtworksPaged: (artistId, { page = 1, pageSize = 10 } = {}) => api.get(`/public/artworks/${artistId}`, { params: { page, pageSize } }),
  // F1: 作品点赞（匿名公开）
  likeArtwork: (id) => api.post(`/public/artworks/${id}/like`),
  unlikeArtwork: (id) => api.delete(`/public/artworks/${id}/like`),
  // F4: 留言板（公开）
  getMessages: (subdomain, page = 1, pageSize = 20) => api.get(`/public/artist/${subdomain}/messages`, { params: { page, pageSize } }),
  postMessage: (subdomain, data) => api.post(`/public/artist/${subdomain}/messages`, data),
  // REQ-022 F2: 社交平台列表（公开，仅启用）
  getPlatforms: () => api.get('/platforms')
}

// ─── 画师后台 ───
export const artistApi = {
  getProfile: () => api.get('/artist/profile'),
  updateProfile: (data) => api.put('/artist/profile', data),
  // REQ-022 F1: 发布交付物为作品（delivered 门槛，一图一作品）
  publishArtwork: (orderId, data) => api.post(`/artist/orders/${orderId}/publish-artwork`, data),
  // 作品
  getArtworks: () => api.get('/artist/artworks'),
  // v0.42 Step 6: 画师端作品分页（20/页 + el-pagination；封面置顶）
  getArtworksPaged: ({ page = 1, pageSize = 20 } = {}) => api.get('/artist/artworks/paged', { params: { page, pageSize } }),
  createArtwork: (data) => api.post('/artist/artworks', data),
  deleteArtwork: (id) => api.delete(`/artist/artworks/${id}`),
  // v0.35 波3 (REQ-024 F6): 作品编辑（标题/自由描述）+ 档位标注（替换语义）
  updateArtwork: (id, data) => api.put(`/artist/artworks/${id}`, data),
  setArtworkTags: (id, sizeIds) => api.put(`/artist/artworks/${id}/tags`, { sizeIds }),
  // v0.25 A: 封面图（设为封面 / 取消封面；GET artworks 与公开主页返回 is_cover 字段）
  setArtworkCover: (id) => api.put(`/artist/artworks/${id}/cover`),
  unsetArtworkCover: (id) => api.delete(`/artist/artworks/${id}/cover`),
  // v0.31: 封面排序（多封面轮播顺序）
  reorderCovers: (orderedIds) => api.put('/artist/artworks/cover-order', { orderedIds }),
  // v0.31 F3: 折扣码管理
  getDiscountCodes: () => api.get('/artist/discount-codes'),
  toggleDiscount: (enabled) => api.put('/artist/discount-codes/toggle', { enabled }),
  createDiscountCode: (data) => api.post('/artist/discount-codes', data),
  updateDiscountCode: (id, data) => api.put(`/artist/discount-codes/${id}`, data),
  deleteDiscountCode: (id) => api.delete(`/artist/discount-codes/${id}`),
  // 须知
  getRules: () => api.get('/artist/rules'),
  // F4: 留言审核
  getMessages: () => api.get('/artist/messages'),
  approveMessage: (id) => api.put(`/artist/messages/${id}/approve`),
  rejectMessage: (id) => api.put(`/artist/messages/${id}/reject`),
  replyMessage: (id, reply) => api.put(`/artist/messages/${id}/reply`, { reply }),
  updateRules: (content) => api.put('/artist/rules', { content }),
  // 05D-I1: 散单记账（原裸 fetch 收口 → 401 自动登出/15s 超时/i18n 翻译统一走拦截器）
  getStandaloneIncomes: (params = {}) => api.get('/artist/tools/standalone-incomes', { params }),
  createStandaloneIncome: (data) => api.post('/artist/tools/standalone-incomes', data),
  deleteStandaloneIncome: (id) => api.delete(`/artist/tools/standalone-incomes/${id}`),
  // 订单
  getOrders: (status, { page, pageSize, q } = {}) => api.get('/artist/orders', { params: { status, page, pageSize, q } }),
  // 05D-W1/P1: 拉全量订单（下拉选择用；pageSize 上限 200 循环，订单多时稍慢但可选到任意早期订单）
  getAllOrders: async (q) => {
    const pageSize = 200
    const all = []
    const first = await api.get('/artist/orders', { params: { page: 1, pageSize, q } })
    const firstItems = first.items ?? first
    all.push(...firstItems)
    const totalCount = first.total ?? firstItems.length
    const pages = Math.ceil(totalCount / pageSize)
    for (let p = 2; p <= pages; p++) {
      const res = await api.get('/artist/orders', { params: { page: p, pageSize, q } })
      const items = res.items ?? res
      if (items.length) all.push(...items)
    }
    return all
  },
  getQueue: (zone) => api.get('/artist/queue', zone ? { params: { zone } } : undefined),
  getOrder: (id) => api.get(`/artist/orders/${id}`),
  createManualOrder: (data) => api.post('/artist/orders/manual', data),
  // R-2: 取消已收款订单需 confirmPaidCancel 确认（Batch A 契约：不带则 409 CANCEL_WITH_PAYMENT）；
  // options 透传为 body 附加字段，既有调用方不传时行为不变
  updateStatus: (id, status, options = {}) => api.put(`/artist/orders/${id}/status`, { status, ...options }),
  updatePriority: (id, priority) => api.put(`/artist/orders/${id}/priority`, { priority }),
  reorderQueue: (orderedIds) =>
    api.put('/artist/queue/reorder', { orderedIds }),
  addNote: (id, data) => api.post(`/artist/orders/${id}/notes`, data),
  // R46: 备注删除（系统备注后端拒绝 403，带图备注由 GC 清理）
  deleteNote: (id, noteId) => api.delete(`/artist/orders/${id}/notes/${noteId}`),
  // SPEC-003: 附加工作项（添加/删除后返回完整订单，final_price_cents 已重算）
  addExtraItem: (id, data) => api.post(`/artist/orders/${id}/extra-items`, data),
  deleteExtraItem: (id, itemId) => api.delete(`/artist/orders/${id}/extra-items/${itemId}`),
  // SPEC-004: 递补（buffer → formal，返回完整订单）
  promoteOrder: (id) => api.post(`/artist/orders/${id}/promote`),
  deliver: (id, data) => api.post(`/artist/orders/${id}/deliver`, data),
  // 方案 B: 无文件交付（修复工作流订单最后节点交付卡死）
  deliverNoFile: (id) => api.post(`/artist/orders/${id}/deliver-no-file`),
  addReference: (id, data) => api.post(`/artist/orders/${id}/references`, data),
  deleteReference: (id, refId) => api.delete(`/artist/orders/${id}/references/${refId}`),
  // R4: 焦点图（off/small/large）
  setFocusImage: (id, data) => api.put(`/artist/orders/${id}/focus-image`, data),
  updatePrice: (id, data) => api.put(`/artist/orders/${id}/price`, data),
  // B7: 额度池收款（记录/流水/撤销=负数记录）
  getPayments: (id) => api.get(`/artist/orders/${id}/payments`),
  addPayment: (id, data) => api.post(`/artist/orders/${id}/payments`, data),
  // v0.31 REQ-021 F1: 操作日志（分页 + ?type= 筛选）
  getOrderLogs: (id, { page = 1, pageSize = 50, type } = {}) => api.get(`/artist/orders/${id}/logs`, { params: { page, pageSize, type } }),
  // R33: 签名 URL 批量刷新（防 15min 过期 403）
  refreshSignatures: (paths) => api.post('/artist/refresh-signatures', { paths }),
  // R30d: 流程状态机（推进/打回/关闭跟踪；stageId 为目标节点 ID，SPEC-002 必填）
  advanceStage: (id, stageId) => api.put(`/artist/orders/${id}/stage`, { stageId }),
  stageBack: (id, stageId) => api.put(`/artist/orders/${id}/stage-back`, { stageId }),
  stageOff: (id) => api.put(`/artist/orders/${id}/stage`, { stageId: null }),
  trackOn: (id) => api.put(`/artist/orders/${id}/track-on`),
  // 统计
  getStats: () => api.get('/artist/stats'),
  // REQ-033 埋点看板：画师自己的事件统计（门面区块，管理员开关控制显隐）
  getMyTrackingSummary: (days = 14) => api.get('/artist/tracking/summary', { params: { days } }),
  // v0.18 仪表盘（收入统计/待办合并列表/最近活动流）
  getDashboardRevenue: (period) => api.get('/artist/dashboard/revenue', { params: { period } }),
  getDashboardTodo: () => api.get('/artist/dashboard/todo'),
  getDashboardActivity: () => api.get('/artist/dashboard/activity'),
  // R51: 截稿日
  getUpcomingDeadlines: () => api.get('/artist/orders/upcoming-deadlines'),
  updateDeadline: (id, deadline) => api.put(`/artist/orders/${id}/deadline`, { deadline }),
  // v0.26 B: 开工日
  updateStartDate: (id, startDate) => api.put(`/artist/orders/${id}/start-date`, { startDate }),
  // 问候语
  getGreeting: () => api.get('/artist/greeting'),
  // 流程与比例
  getWorkflow: () => api.get('/artist/workflow'),
  addStage: (data) => api.post('/artist/workflow', data),
  updateStage: (id, data) => api.put(`/artist/workflow/${id}`, data),
  deleteStage: (id) => api.delete(`/artist/workflow/${id}`),
  reorderStages: (orderedIds) => api.put('/artist/workflow/reorder', { orderedIds }),
  savePayment: (nodes) => api.put('/artist/workflow/payment', { nodes }),
  resetWorkflow: () => api.post('/artist/workflow/reset'),
  // 增项
  // L0 (v0.36 波1): 旧增项模型六个封装已删（零调用点；后端端点同步删除）
  // SPEC-PRICE-2 (v50): 旧倍率 CRUD 已随 price_multipliers 表清退移除；
  // 用途/加急统一为增项库 category 维度（见 addonTemplate 系列）
  // v0.32 REQ-023 Phase1: 增项库（addon_templates）
  getAddonTemplates: () => api.get('/artist/addon-templates'),
  createAddonTemplate: (data) => api.post('/artist/addon-templates', data),
  updateAddonTemplate: (id, data) => api.put(`/artist/addon-templates/${id}`, data),
  deleteAddonTemplate: (id) => api.delete(`/artist/addon-templates/${id}`),
  // v0.32 REQ-023 Phase1: 画风（art_styles + sizes + addons + overrides）
  getArtStyles: () => api.get('/artist/art-styles'),
  createArtStyle: (data) => api.post('/artist/art-styles', data),
  updateArtStyle: (id, data) => api.put(`/artist/art-styles/${id}`, data),
  deleteArtStyle: (id) => api.delete(`/artist/art-styles/${id}`),
  createStyleSize: (styleId, data) => api.post(`/artist/art-styles/${styleId}/sizes`, data),
  updateStyleSize: (styleId, sizeId, data) => api.put(`/artist/art-styles/${styleId}/sizes/${sizeId}`, data),
  deleteStyleSize: (styleId, sizeId) => api.delete(`/artist/art-styles/${styleId}/sizes/${sizeId}`),
  setStyleAddons: (styleId, items) => api.put(`/artist/art-styles/${styleId}/addons`, { items }),
  // SPEC-PRICE-2 (v50): 画风增项解绑（移除=解绑，不动增项库）
  removeStyleAddon: (styleId, saId) => api.delete(`/artist/art-styles/${styleId}/addons/${saId}`),
  // SPEC-PRICE-2 (v50): 尺寸覆盖只读查询（替代 PUT 空 items 伪装读取）
  getSizeOverrides: (styleId, sizeId) => api.get(`/artist/art-styles/${styleId}/sizes/${sizeId}/overrides`),
  setSizeOverrides: (styleId, sizeId, items) => api.put(`/artist/art-styles/${styleId}/sizes/${sizeId}/overrides`, { items }),
  // REQ-035 批A: 客户标记 + 老客召回（后端 tools.routes.ts 已就绪）
  getToolsClients: (qq) => api.get('/artist/tools/clients', { params: { qq } }),
  getToolsClient: (qq) => api.get(`/artist/tools/clients/${qq}`),
  saveToolsClient: (qq, data) => api.put(`/artist/tools/clients/${qq}`, data),
  deleteToolsClient: (qq) => api.delete(`/artist/tools/clients/${qq}`),
  getReturningClients: (days) => api.get('/artist/tools/returning-clients', { params: { days } }),
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
// P2-#14: 上传请求覆盖 timeout（50MB 交付物在慢速网络需 >15s）
const UPLOAD_TIMEOUT_MS = 120_000

export const uploadApi = {
  image: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  reference: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/reference', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  deliverable: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/deliverable', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  // R19: 备注附图（需登录，notes/{artistId}/ 目录，签名 URL 返回）
  noteImage: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/note-image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  }
}

// ─── 管理员 ───
export const adminApi = {
  getArtists: () => api.get('/admin/artists'),
  createArtist: (data) => api.post('/admin/artists', data),
  deleteArtist: (id) => api.delete(`/admin/artists/${id}`),
  // REQ-027: TOTP 绑定/重置
  totpBindInit: (id) => api.post(`/admin/artists/${id}/totp/bind-init`),
  totpBindConfirm: (id, code) => api.post(`/admin/artists/${id}/totp/bind-confirm`, { code }),
  totpReset: (id) => api.post(`/admin/artists/${id}/totp/reset`),
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
  // SPEC-PRICE-2 (v50): 旧档位 CRUD 已退役；管理员价格概览（画风/尺寸只读）
  getArtistPricingOverview: (id) => api.get(`/admin/artists/${id}/pricing-overview`),
  getArtistArtworks: (id) => api.get(`/admin/artists/${id}/artworks`),
  createArtistArtwork: (id, data) => api.post(`/admin/artists/${id}/artworks`, data),
  deleteArtistArtwork: (id, aid) => api.delete(`/admin/artists/${id}/artworks/${aid}`),
  getArtistRules: (id) => api.get(`/admin/artists/${id}/rules`),
  updateArtistRules: (id, content) => api.put(`/admin/artists/${id}/rules`, { content }),
  // 回收站（事故修复：孤儿文件可恢复）
  getRecycleBin: ({ page, pageSize } = {}) => api.get('/admin/recycle-bin', { params: { page, pageSize } }),
  emptyRecycleBin: () => api.delete('/admin/recycle-bin'),
  // F4: 留言管理（跨画师）；REQ-022 F5: 可选筛选 { artistId, status, replied }
  getMessages: (filters = {}) => api.get('/admin/messages', { params: filters }),
  deleteMessage: (id) => api.delete(`/admin/messages/${id}`),
  // REQ-022 F2: 社交平台管理（增删改 + 停用/启用）
  getPlatforms: () => api.get('/admin/platforms'),
  createPlatform: (data) => api.post('/admin/platforms', data),
  updatePlatform: (id, data) => api.put(`/admin/platforms/${id}`, data),
  deletePlatform: (id) => api.delete(`/admin/platforms/${id}`),
  // HC: 系统自检
  getHealth: () => api.get('/admin/health'),
  // REQ-033 埋点看板
  getTrackingSummary: (days = 30) => api.get('/admin/tracking/summary', { params: { days } }),
  getTrackingConfig: () => api.get('/admin/tracking-config'),
  setTrackingConfig: (statsMode) => api.put('/admin/tracking-config', { statsMode })
}
