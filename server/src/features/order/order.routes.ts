import { orderClientRoutes } from './order-client.routes.js'
import { orderListRoutes } from './order-list.routes.js'
import { orderActionRoutes } from './order-action.routes.js'
import { orderDeliveryRoutes } from './order-delivery.routes.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// 组合器：端点已按归属拆分为子插件，注册顺序与拆分前一致——
//   1. order-client.routes.ts   客户端公开端点（/orders/*）
//   2. order-list.routes.ts     画师端列表/队列/统计/手动录单/签名刷新
//   3. order-action.routes.ts   画师订单动作（状态/字段/备注/改价/增项/收款/递补）
//   4. order-delivery.routes.ts 交付/图库/流程节点动作
// 共享守卫与响应增强见 order-route-utils.ts
// ============================================

export default async function orderRoutes(fastify: FastifyInstance) {
  await orderClientRoutes(fastify)
  await orderListRoutes(fastify)
  await orderActionRoutes(fastify)
  await orderDeliveryRoutes(fastify)
}
