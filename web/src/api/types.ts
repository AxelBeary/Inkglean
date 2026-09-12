// ============================================
// API 边界 DTO 类型库（派工C）
// 形状以后端 routes/service 代码为唯一事实源，逐一核对（2026-08-11）
// 命名约定：实体 snake_case 与后端一致；camelCase 为后端显式映射过的形态
// ============================================

// F-09 巨型文件拆分（2026-09-12）：上述契约类型库已按域搬至 ./types/<域>.ts，本文件退化为再导出 barrel。
// 下游 import 路径（'@/api/types'、'../api/types'、'../../api/types'）与导出名集合逐字不变；
// 新增/修改 DTO 请落到对应 ./types/<域>.ts，不要回填本文件。

export * from './types/common'
export * from './types/auth'
export * from './types/artist'
export * from './types/artwork'
export * from './types/guestbook'
export * from './types/platform'
export * from './types/workflow'
export * from './types/greeting'
export * from './types/discount'
export * from './types/pricing'
export * from './types/gallery'
export * from './types/addon'
export * from './types/style'
export * from './types/order'
export * from './types/upload'
export * from './types/dashboard'
export * from './types/tracking'
export * from './types/tools'
export * from './types/admin'
export * from './types/webauthn'
export * from './types/calendar'
export * from './types/devices'
export * from './types/compliance'
export * from './types/step-up'
export * from './types/setup'
export * from './types/invite'
export * from './types/onboarding'
