// API 边界 DTO · 工作流（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 工作流（workflow.service.ts，camelCase 输出） ───

export interface WorkflowStageDTO {
  id: number
  name: string
  description: string | null
  sortOrder: number
  takesPayment: boolean
  basisPoints: number
  isFinal: boolean
  speechTemplate: string | null
  randomTemplate: boolean
}

/** GET workflow / 公开 workflow 响应 */
export interface WorkflowResult {
  stages: WorkflowStageDTO[]
}

/** PUT workflow/payment 响应（appliesToNewOrdersOnly 仅存量订单有节点时附带） */
export interface SavePaymentResult {
  stages: WorkflowStageDTO[]
  appliesToNewOrdersOnly?: boolean
}

/** 删除节点响应 */
export interface DeleteStageResult {
  success: boolean
}

/** 默认工作流模板行（snake_case） */
export interface DefaultWorkflowNode {
  id: number
  name: string
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number
}

/** PUT /artist/workflow/payment 节点项 */
export interface SavePaymentNode {
  id: number
  basisPoints: number
}
