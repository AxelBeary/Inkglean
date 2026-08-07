import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../api/index.js'
import { trackEvent } from '../utils/track.js'

/**
 * 订单工作流状态机（从 OrderDetail.vue 拆分，纯搬移零行为变化）
 * @param {object} ctx
 * @param {import('vue').Ref} ctx.order - 订单 ref（父组件持有，内部改 value 外部可见）
 * @param {string} ctx.routeId - 订单 id（route.params.id）
 * @param {import('vue').Ref<string>} ctx.statusAction - 防连点锁 ref（父组件持有）
 */
export function useOrderWorkflow({ order, routeId, statusAction }) {
  const { t } = useI18n()

  // ─── R39 方案B：状态区派生状态 ───
  const hasWorkflow = computed(() => order.value?.currentStageId != null)
  const isTerminal = computed(() => ['delivered', 'cancelled'].includes(order.value?.status))

  // ─── R30d: 流程状态机（进度条 + 推进/打回 + 关闭跟踪） ───
  const workflowStages = ref([])

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
    && !['delivered', 'cancelled'].includes(order.value?.status)
    && !!nextStage.value
  )

  /** 可打回：有 stage、非终态、存在上一节点 */
  const canBackStage = computed(() =>
    order.value?.currentStageId != null
    && !['delivered', 'cancelled'].includes(order.value?.status)
    && currentStageIdx.value > 0
  )

  async function advanceStage() {
    if (!nextStage.value || statusAction.value) return
    statusAction.value = 'advance'
    try {
      order.value = await artistApi.advanceStage(routeId, nextStage.value.id)
      ElMessage.success(t('orderDetail.stageUpdated'))
      trackEvent('artist_action', { action: 'order_status_change', stage: 'advance' })
    } catch (err) {
      ElMessage.error(err.message)
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
      order.value = await artistApi.stageBack(routeId, prev.id)
      ElMessage.success(t('orderDetail.stageUpdated'))
      trackEvent('artist_action', { action: 'order_status_change', stage: 'back' })
    } catch (err) {
      ElMessage.error(err.message)
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
    try {
      order.value = await artistApi.stageOff(routeId)
      ElMessage.success(t('orderDetail.stageOffDone'))
    } catch (err) {
      ElMessage.error(err.message)
    }
  }

  // ─── R39/C53：老订单启用流程跟踪（后端 track-on：设第一节点，status 保持不变） ───
  const trackOnLoading = ref(false)
  async function enableTracking() {
    trackOnLoading.value = true
    try {
      order.value = await artistApi.trackOn(routeId)
      ElMessage.success(t('orderDetail.trackingEnabled'))
    } catch (err) {
      ElMessage.error(err.message)
    } finally {
      trackOnLoading.value = false
    }
  }

  async function loadWorkflowStages() {
    try {
      const res = await artistApi.getWorkflow()
      workflowStages.value = res.stages || []
    } catch {
      // 静默失败：无工作流时流程卡片不显示（currentStageId 为 null）
    }
  }

  return {
    hasWorkflow, isTerminal,
    workflowStages, currentStageIdx, stageProgress, nextStage, nextStageName,
    canAdvanceStage, canBackStage,
    advanceStage, backStage, turnOffStageTracking,
    trackOnLoading, enableTracking, loadWorkflowStages
  }
}
