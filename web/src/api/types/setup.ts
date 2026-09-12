// API 边界 DTO · REQ-038 开箱向导（入驻方式）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── REQ-038/039: 开箱向导「入驻方式」一步（写入通道 9/12 补齐） ───

/** 画师入驻模式：invite=画师拿邀请码自助入驻；manual=登录页不显示入驻入口，仅由管理员在后台建号 */
export type OnboardingMode = 'invite' | 'manual'

/** POST /api/setup/onboarding-mode 响应（仅 setup 阶段可用；非法值服务端 400 SETUP_ONBOARDING_MODE_INVALID，初始化完成后 410） */
export interface SetOnboardingModeResult {
  ok: true
  mode: OnboardingMode
}
