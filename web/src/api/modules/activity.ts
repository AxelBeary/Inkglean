// 端点方法 · v86 事件流水幕布（2026-11-28 立项）
// 由 api/index.ts（barrel）再导出，调用方 import 路径统一走 '@/api'。

import { getJson } from './http'
import type { ActivityEventQuery, ActivityEventsResult, ActivityEventFiltersResult } from '../types'

// ─── 管理员事件流水（步 1 后端，步 2 幕布消费） ───
export const activityApi = {
  /**
   * 查事件流水（管理员 + step-up 双守卫；未升级会话会拿到 401 STEP_UP_REQUIRED）。
   * 轮询调用方负责节流与可见性暂停（见 components/admin/useActivityFeedPolling.ts）。
   */
  getActivityEvents: (params?: ActivityEventQuery): Promise<ActivityEventsResult> =>
    getJson('/admin/activity-events', { params: params ?? {} }),
  /** 筛选下拉枚举（action 白名单 + actorKind 四态，与后端 ACTIONS 常量同源） */
  getActivityFilters: (): Promise<ActivityEventFiltersResult> =>
    getJson('/admin/activity-events/filters')
}
