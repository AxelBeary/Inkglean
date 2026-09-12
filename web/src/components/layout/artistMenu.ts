// F-09 巨型文件拆分：ArtistLayout.vue 的「纯数据注册表」原样搬入本文件——
// 只放常量与无状态函数（埋点事件名表、菜单项表、菜单分组表），不含 ref/computed/生命周期/路由联动；
// menuGroups、drawerMenuGroups、pageTitle 三个派生 computed 与轮询、可见性暂停、路由 watch 全部留在 ArtistLayout.vue。
import type { Component } from 'vue'
import { trackEvent } from '../../utils/track'
import { Odometer, List, Box, Money, Picture, Setting, ChatLineSquare, Tickets, Document, EditPen, TrendCharts, Tools, UserFilled } from '@element-plus/icons-vue'

// ─── 埋点：后台页面浏览（REQ-033 §4 / 施工图《01-to-02-埋点前端批》§3.3） ───
// 事件名严格用后端白名单；/slots、/admin 无白名单事件名（后端 400），不埋
// 画师已登录（后台登录守卫）→ 后端自动记 artist_id，前端只需发事件
export const PAGE_VIEW_EVENT_MAP: Record<string, string> = {
  '/dashboard': 'dashboard_view',
  '/queue': 'queue_view',
  '/orders': 'orders_view',
  '/orders/new': 'manual_view',
  '/tiers': 'tiers_view',
  '/artworks': 'artworks_view',
  '/guestbook': 'guestbook_view',
  '/settings': 'settings_view',
  '/preferences': 'preferences_view'
}
export function trackPageView(path: string) {
  const eventName = PAGE_VIEW_EVENT_MAP[path]
  if (eventName) trackEvent(eventName, { page: path })
}

// ─── R21: 菜单项注册表（侧边栏与抽屉共用） ───
/** 后台菜单项形状（BASE_MENU_ITEMS 与 TOOL_BOX_CATEGORIES 拼接 pageTitle 时 group 可缺省） */
export interface ArtistMenuItem {
  index: string
  icon: Component
  labelKey: string
  group?: string
  hasBadge?: boolean
  hasOrderBadge?: boolean
  badge?: number
}
// REQ-016 C: 手动录单移出菜单（订单管理页已有按钮），菜单分三组：工作/经营/门面
export const BASE_MENU_ITEMS: ArtistMenuItem[] = [
  { index: '/dashboard', icon: Odometer, labelKey: 'menu.dashboard', group: 'work' },
  { index: '/queue', icon: List, labelKey: 'menu.queue', group: 'work' },
  // I0（REQ-039 拍板）: 订单管理待确认角标（pending 数，5 分钟轮询）
  { index: '/orders', icon: Box, labelKey: 'menu.orders', group: 'work', hasOrderBadge: true },
  // #8: 录单入口归位（从订单管理页移回侧边栏「工作」分组）
  { index: '/orders/new', icon: EditPen, labelKey: 'menu.manualOrder', group: 'work' },
  // v0.26 C: 开稿管理（排期看板后面）
  { index: '/slots', icon: Tickets, labelKey: 'menu.slots', group: 'biz' },
  { index: '/tiers', icon: Money, labelKey: 'menu.tiers', group: 'biz' },
  { index: '/artworks', icon: Picture, labelKey: 'menu.artworks', group: 'biz' },
  // #1: 留言管理（作品管理下方，待审核角标）
  { index: '/guestbook', icon: ChatLineSquare, labelKey: 'menu.guestbook', hasBadge: true, group: 'biz' },
  // 工具箱收纳（纸墨提案 §5.5）：侧栏只留一个把手，13 个工具收进四分类抽屉（见 TOOL_BOX_CATEGORIES）
  { index: '/tools', icon: Tools, labelKey: 'menu.toolbox', group: 'tools' },
  // R42b: 须知编辑合并进设置页，菜单项移除
  { index: '/stats', icon: TrendCharts, labelKey: 'menu.stats', group: 'front' },
  { index: '/settings', icon: Setting, labelKey: 'menu.settings', group: 'front' },
  // #44: 偏好独立导航（主页对外/偏好对内）
  { index: '/preferences', icon: Document, labelKey: 'menu.preferences', group: 'front' },
  // REQ-040: 账号与安全
  { index: '/account', icon: UserFilled, labelKey: 'menu.account', group: 'front' }
]
// REQ-016 C: 菜单分组渲染（工作/经营/门面）；工具组收窄为单个工具箱把手（纸墨提案 §5.5）
export const MENU_GROUPS = [
  { key: 'work', labelKey: 'menu.groupWork' },
  { key: 'biz', labelKey: 'menu.groupBiz' },
  // 工具箱把手（组标题保持「工具」，组内单项 = 工具箱入口）
  { key: 'tools', labelKey: 'menu.groupTools' },
  { key: 'front', labelKey: 'menu.groupFront' }
]
