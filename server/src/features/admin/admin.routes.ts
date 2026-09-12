import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { adminSystemRoutes } from './admin-system.routes.js'
import { adminArtistRoutes } from './admin-artist.routes.js'
import { adminArtistSecurityRoutes } from './admin-artist-security.routes.js'
import { adminGreetingRoutes } from './admin-greeting.routes.js'
import { adminAddonTemplateRoutes } from './admin-addon-template.routes.js'
import { adminWorkflowRoutes } from './admin-workflow.routes.js'
import { adminArtistSettingsRoutes } from './admin-artist-settings.routes.js'
import { adminPlatformRoutes } from './admin-platform.routes.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 管理员路由 - 多画师管理
// ============================================
// F-09 巨型文件清偿（拆分批）：端点按资源域拆入同目录子路由模块，本文件保留为注册入口。
// 子模块一律以「同一实例上的普通函数」方式挂载（对齐 order.routes.ts 组合器范式，
// 不走 fastify.register 子作用域）——封装上下文与拆分前完全一致，
// registerAdminStepUpHooks 的 onRoute 守卫覆盖范围、路由路径/方法/schema/响应全部不变。
//   1. admin-system.routes.ts            step-up 探测、版本、统计、回收站、更换管理员、平台公告
//   2. admin-artist.routes.ts            画师在册/建号/移除恢复/订单/主页状态
//   3. admin-artist-security.routes.ts   画师 TOTP 绑定确认重置 + 桌面设备清单踢出
//   4. admin-greeting.routes.ts          问候语通用库/画师专属库 + 特别日
//   5. admin-addon-template.routes.ts    系统增项模板
//   6. admin-workflow.routes.ts          默认流程模板 + 画师流程与比例代理
//   7. admin-artist-settings.routes.ts   画师全设置代理（资料/价格概览/作品/须知）
//   8. admin-platform.routes.ts          社交平台字典 CRUD
// 统一 params schema 与 requireExistingArtist 见 admin-route-utils.ts
// ============================================

export default async function adminRoutes(fastify: FastifyInstance) {

  // REQ-041：批量挂载 step-up 守卫（所有 /api/admin 路由，追加在 requireAdmin 之后；
  // /api/admin/transfer 自动改用动作级 requireAdminReauth——60 秒强制再验）
  registerAdminStepUpHooks(fastify)

  await adminSystemRoutes(fastify)
  await adminArtistRoutes(fastify)
  await adminArtistSecurityRoutes(fastify)
  await adminGreetingRoutes(fastify)
  await adminAddonTemplateRoutes(fastify)
  await adminWorkflowRoutes(fastify)
  await adminArtistSettingsRoutes(fastify)
  await adminPlatformRoutes(fastify)
}
