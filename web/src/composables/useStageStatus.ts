/**
 * useStageStatus — 工作流节点 → 订单状态映射（F4）
 *
 * 复刻后端 mapStageToStatus（server/src/features/order/order-workflow.service.ts）：
 *   第 1 个节点 → pending
 *   第 2 个节点且为收款节点 → confirmed
 *   中间节点 → wip
 *   最后一个节点 → done
 *
 * 用途：录单页判断"初始节点状态"选项的可达性——有工作流但无对应节点时禁用选项。
 * 前端复刻后端映射是为了在 UI 层提前禁用不可达选项，后端仍是最终裁决者。
 */
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'

/** 工作流节点最小形状（camelCase，含 takesPayment） */
export interface StageLike {
  id?: number
  takesPayment?: boolean | null
}

/** 初始节点状态候选值 */
export type OrderInitStatus = 'pending' | 'confirmed' | 'wip' | 'done'

/** 节点索引 → 订单状态（与后端 mapStageToStatus 一致） */
export function mapStageToStatus(stages: StageLike[], idx: number): OrderInitStatus {
  if (idx === 0) return 'pending'
  if (idx === stages.length - 1) return 'done'
  if (idx === 1 && stages[idx].takesPayment) return 'confirmed'
  return 'wip'
}

/** 找到映射到目标状态的第一个节点（无工作流或不可达时返回 null） */
export function findStageForStatus(stages: StageLike[], status: OrderInitStatus): StageLike | null {
  for (let i = 0; i < stages.length; i++) {
    if (mapStageToStatus(stages, i) === status) {
      return stages[i]
    }
  }
  return null
}

/**
 * 初始节点状态选项管理
 *
 * @param stages 工作流节点列表（camelCase，含 takesPayment）
 */
export function useStageStatus(stages: Ref<StageLike[]>) {
  const initialStatus = ref<OrderInitStatus>('pending')

  /** 三个选项：待确认（默认）/ 已确认 / 进行中；有工作流但无对应节点时禁用 */
  const options = computed(() => {
    const hasWorkflow = stages.value.length > 0
    return [
      { value: 'pending', disabled: false },
      { value: 'confirmed', disabled: hasWorkflow && !findStageForStatus(stages.value, 'confirmed') },
      { value: 'wip', disabled: hasWorkflow && !findStageForStatus(stages.value, 'wip') }
    ]
  })

  /** 工作流变化导致当前选项不可达时，回退到默认值 */
  watch(options, (opts) => {
    const current = opts.find(o => o.value === initialStatus.value)
    if (current?.disabled) initialStatus.value = 'pending'
  })

  /** 找到当前选中状态对应的目标节点（提交时用） */
  function findTarget(): StageLike | null {
    return findStageForStatus(stages.value, initialStatus.value)
  }

  return { initialStatus, options, findTarget }
}
