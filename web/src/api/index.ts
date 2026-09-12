// ============================================
// API 请求封装入口（F-09 巨型文件拆分 2026-09-12）
// 端点方法已按域搬至 ./modules/<域>.ts，本文件退化为再导出 barrel。
// 下游 import 路径（'@/api'、'../api/index'、'../../api/index.js' 等）、默认导出与命名导出集合逐字不变；
// 新增端点方法请落到对应 ./modules/<域>.ts，不要回填本文件。
// ============================================

export type { ApiError } from './modules/http'
export { default } from './modules/http'
export { webauthnApi, totpRebindApi, stepUpApi, setupApi, inviteApi, authApi } from './modules/auth'
export { calendarFeedApi } from './modules/calendar-feed'
export { artistPublicApi } from './modules/artist-public'
export { artistApi } from './modules/artist'
export { orderApi } from './modules/order'
export { uploadApi } from './modules/upload'
export { adminApi } from './modules/admin'
export { complianceApi } from './modules/compliance'
