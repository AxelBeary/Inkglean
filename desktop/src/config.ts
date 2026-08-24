// 桌面端运行配置（825 波0 地基批）
// API_BASE：桌面登录依赖公网后端 v73（设备账本/桌面登录接口）。
// - 开发：默认连本地 `cd server && npm run dev`（localhost:3000），可用 VITE_API_BASE 覆盖
// - 发布构建：必须注入真实公网域名（发布前待办清单 1 号：公网后端升 v73 完成后定值）
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)
  ?? (import.meta.env.DEV ? 'http://localhost:3000' : '')

/** 发布构建未注入 API_BASE 时 fail-fast，避免静默连空地址 */
export function requireApiBase(): string {
  if (!API_BASE) throw new Error('API_BASE 未配置：发布构建须注入 VITE_API_BASE')
  return API_BASE
}
