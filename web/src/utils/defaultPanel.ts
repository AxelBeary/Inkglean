/**
 * 「进入后台时先打开」落地映射（822 批：原设置只存不消费属死功能，本批真正接通）
 *
 * 口径：值为 dashboard / null / 未知 → 不跳转（停在仪表盘，即默认行为）；
 * 其余合法值映射到对应后台路由。手动录单沿用候选池口径（/orders 带 action 参数）。
 * Dashboard.vue 消费：进入仪表盘页且 profile 就绪后一次性 router.replace。
 */

/** 面板值 → 后台路由（dashboard 不在此表 = 不跳转） */
export const DEFAULT_PANEL_ROUTES: Record<string, string> = {
  queue: '/queue',
  orders: '/orders',
  manual: '/orders?action=manual',
  tiers: '/tiers'
}

/** 解析「先打开」面板值为目标路由；无需跳转（仪表盘/未设置/非法值）返回 null */
export function resolveDefaultPanelRoute(panel: string | null | undefined): string | null {
  if (!panel || panel === 'dashboard') return null
  return DEFAULT_PANEL_ROUTES[panel] ?? null
}
