// API 边界 DTO · REQ-043 开张任务卡 + 平台公告（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ═══ REQ-043 I2/I4: 开张任务卡 + 平台公告 ═══

/** GET /api/artist/onboarding 任务项（share=建议项，恒 false，不阻塞完成） */
export interface OnboardingTask {
  key: 'artwork' | 'tier' | 'share'
  done: boolean
}

/** GET /api/artist/onboarding 响应 */
export interface OnboardingState {
  dismissed: boolean
  tasks: OnboardingTask[]
}

/** GET /api/artist/announcement 响应（标题与内容均为空 = 无公告，返回 null） */
export interface PlatformAnnouncement {
  title: string
  content: string
  updatedAt: string | null
}

/** PUT /api/admin/announcement 请求体（标题+内容都为空 = 清空公告） */
export interface SaveAnnouncementRequest {
  title?: string | null
  content?: string | null
}
