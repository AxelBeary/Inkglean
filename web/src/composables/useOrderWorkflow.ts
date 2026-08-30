import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../api/index'
import type { ApiError } from '../api/index'
import { trackEvent } from '../utils/track'
import type { EnrichedOrderDetail, WorkflowStageDTO, VersionedOptions } from '../api/types'

/**
 * 订单工作流状态机（从 OrderDetail.vue 拆分，纯搬移零行为变化）
 * @param ctx
 * @param ctx.order - 订单 ref（父组件持有，内部改 value 外部可见）
 * @param ctx.routeId - 订单 id（route.params.id）
 * @param ctx.statusAction - 防连点锁 ref（父组件持有）
 * @param ctx.onConflict - 815 审计 P1-3：乐观锁冲突（409）后的重拉回调（可选）
 * @param ctx.applyOrder - M-9（审计 260830）：统一写入口——响应 version 单调不回退，
 *        防本处写回与 loadOrder 并发时晚到旧快照覆盖新状态（互斥锁管不住跨路并发）
 */
export function useOrderWorkflow({ order, routeId, statusAction, onConflict, applyOrder }: {
  order: Ref<EnrichedOrderDetail | null>
  routeId: number
  statusAction: Ref<string>
  onConflict?: () => Promise<void> | void
  applyOrder: (next: EnrichedOrderDetail | null) => void
}) {
  const { t } = useI18n()

  // 815 审计 P1-3：乐观锁接线——写请求携带当前 version，冲突（409 ORDER_CONFLICT）时提示并重拉服务端真相
  const versionOpt = (): VersionedOptions => {
    const v = order.value?.version
    return v != null ? { version: v } : {}
  }
  async function handleConflict(err: unknown) {
    if ((err as ApiError)?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('common.orderConflict'))
      if (onConflict) await onConflict()
      return true
    }
    return false
  }

  // ─── R39 方案B：状态区派生状态 ───
  const hasWorkflow = computed(() => order.value?.currentStageId != null)
  const isTerminal = computed(() => ['delivered', 'cancelled'].includes(order.value?.status as string))

  // ─── R30d: 流程状态机（进度条 + 推进/打回 + 关闭跟踪） ───
  const workflowStages = ref<WorkflowStageDTO[]>([])

  /** 当前节点在排序后列表中的索引（-1 = 未接入/节点已删） */
  const currentStageIdx = computed(() =>
    workflowStages.value.findIndex(s => s.id === order.value?.currentStageId)
  )

  /** 进度 { current, total }（后端未返回时前端兜底计算） */
  const stageProgress = computed(() =>
    order.value?.stageProgress || { current: currentStageIdx.value + 1, total: workflowStages.value.length }
  )

  /** 下一节点（用于推进按钮文案） */
  const nextStage = computed(() =>
    currentStageIdx.value !== -1 ? workflowStages.value[currentStageIdx.value + 1] : null
  )
  const nextStageName = computed(() => nextStage.value?.name || '')

  /** 可推进：有 stage、非终态、存在下一节点 */
  const canAdvanceStage = computed(() =>
    order.value?.currentStageId != null
    && !['delivered', 'cancelled'].includes(order.value?.status as string)
    && !!nextStage.value
  )

  /** 可打回：有 stage、非终态、存在上一节点 */
  const canBackStage = computed(() =>
    order.value?.currentStageId != null
    && !['delivered', 'cancelled'].includes(order.value?.status as string)
    && currentStageIdx.value > 0
  )

  async function advanceStage() {
    if (!nextStage.value || statusAction.value) return
    statusAction.value = 'advance'
    try {
      // M-9: 写回经统一入口（旧快照拒收，防与 loadOrder 并发互相覆盖）
      applyOrder(await artistApi.advanceStage(routeId, nextStage.value.id, versionOpt()))
      ElMessage.success(t('orderDetail.stageUpdated'))
      trackEvent('artist_action', { action: 'order_status_change', stage: 'advance' })
    } catch (err) {
      if (!(await handleConflict(err))) ElMessage.error((err as ApiError).message)
    } finally {
      statusAction.value = ''
    }
  }

  async function backStage() {
    const prev = workflowStages.value[currentStageIdx.value - 1]
    if (!prev) return
    try {
      await ElMessageBox.confirm(
        t('orderDetail.stageBackConfirm', { name: prev.name }),
        t('orderDetail.confirmTitle'),
        { type: 'warning' }
      )
    } catch { return }
    // T3: 守卫须在 try 外——try 内 return 会触发 finally 误清飞行中请求的锁
    if (statusAction.value) return
    statusAction.value = 'back'
    try {
      applyOrder(await artistApi.stageBack(routeId, prev.id, versionOpt())) // M-9 同 advanceStage
      ElMessage.success(t('orderDetail.stageUpdated'))
      trackEvent('artist_action', { action: 'order_status_change', stage: 'back' })
    } catch (err) {
      if (!(await handleConflict(err))) ElMessage.error((err as ApiError).message)
    } finally {
      statusAction.value = ''
    }
  }

  async function turnOffStageTracking() {
    try {
      await ElMessageBox.confirm(
        t('orderDetail.stageOffConfirm'),
        t('orderDetail.confirmTitle'),
        { type: 'warning' }
      )
    } catch { return }
    // a3: 与 advanceStage/backStage 共用 statusAction 锁，防止关闭跟踪与推进/打回并发写
    if (statusAction.value) return
    statusAction.value = 'off'
    try {
      applyOrder(await artistApi.stageOff(routeId, versionOpt())) // M-9 同 advanceStage
      ElMessage.success(t('orderDetail.stageOffDone'))
    } catch (err) {
      if (!(await handleConflict(err))) ElMessage.error((err as ApiError).message)
    } finally {
      statusAction.value = ''
    }
  }

  // ─── R39/C53：老订单启用流程跟踪（后端 track-on：设第一节点，status 保持不变） ───
  const trackOnLoading = ref(false)
  async function enableTracking() {
    trackOnLoading.value = true
    try {
      applyOrder(await artistApi.trackOn(routeId, versionOpt())) // M-9 同 advanceStage
      ElMessage.success(t('orderDetail.trackingEnabled'))
    } catch (err) {
      if (!(await handleConflict(err))) ElMessage.error((err as ApiError).message)
    } finally {
      trackOnLoading.value = false
    }
  }

  // ─── M-11（审计 260830）: 工作流加载失败不再静默——置标志供页面出错误条 + 重试
  //     （对齐 QueueBoardList workflowLoadFailed 模式）；进度显示不受影响（后端 stageProgress 兜底） ───
  const workflowLoadFailed = ref(false)
  async function loadWorkflowStages() {
    try {
      const res = await artistApi.getWorkflow()
      workflowStages.value = res.stages || []
      workflowLoadFailed.value = false
    } catch {
      workflowLoadFailed.value = true
    }
  }

  return {
    hasWorkflow, isTerminal,
    workflowStages, currentStageIdx, stageProgress, nextStage, nextStageName,
    canAdvanceStage, canBackStage,
    advanceStage, backStage, turnOffStageTracking,
    trackOnLoading, enableTracking, loadWorkflowStages, workflowLoadFailed
  }
}
