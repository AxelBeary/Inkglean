import { ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { h } from 'vue'
import { artistApi } from '../api/index'
import type { OrderPriority, OrderStatus } from '../api/types'
import { formatCents } from '../utils/money'
import { trackEvent } from '../utils/track'
import { useSlideConfirm } from './useSlideConfirm'
import type { EnrichedOrderDetail } from '../api/types'

// 运行时附带字段：签名 URL/参考图主键/下载锁/修改记录等（类型库未声明）
export type DetailReferenceRow = { file_path: string; original_name?: string | null; source?: string; id?: number; url?: string }
export type DetailNoteRow = { id?: number; image_path: string | null; imageUrl?: string }
export type DetailDeliverableRow = { id: number; file_path: string; original_name?: string | null; file_size?: number | null; url?: string; download_locked?: number }
export type RevisionRecordRow = { type: string; fromStage?: string | null; toStage?: string | null; at: string }
export type OrderDetailState = Omit<EnrichedOrderDetail, 'references' | 'notes' | 'deliverables'> & {
  references?: DetailReferenceRow[]
  notes?: DetailNoteRow[]
  deliverables?: DetailDeliverableRow[]
  revisionRecords?: RevisionRecordRow[]
}
export interface ApiErrShape { code?: string; message: string; detail?: { paidCents?: number } }

/**
 * 订单详情页操作集（从 OrderDetail.vue 二轮拆分抽出，纯搬移零行为变化）：
 * 再来一单 / QQ 跳转复制 / 追踪链接补发 / 优先级 / 状态变更 / 取消滑块流 / 交付再许可 / 删参考图。
 * loadOrder 与 statusAction 仍由宿主持有并经参数注入（workflow composable 与 changeStatus 共享 statusAction）。
 * applyOrder（M-9 审计 260830）：统一写入口，响应 version 单调不回退——本集内所有整体替换 order 的
 * 写回都经它，防与 loadOrder 并发时晚到旧快照覆盖新状态（诱发 409 误报）。
 */
export function useOrderActions({ order, routeId, statusAction, prevPriority, loadOrder, applyOrder }: {
  order: Ref<OrderDetailState | null>
  routeId: number
  statusAction: Ref<string>
  prevPriority: Ref<OrderPriority | null>
  loadOrder: () => Promise<void>
  applyOrder: (next: OrderDetailState | null) => void
}) {
  const { t } = useI18n()
  const router = useRouter()

  // ─── 818-D + 819-J: 再来一单回填选项（默认勾选描述 + 款式尺寸 + 参考图；备注默认不勾——
  // 备注常含内部沟通，画师按需勾选；参考图为客户需求图，随单复用默认带上） ───
  const reorderDialogVisible = ref(false)
  const reorderFill = ref(['desc', 'style', 'refs'])

  function openReorderDialog() {
    // 每次打开重置为默认勾选（避免上次选择残留）
    reorderFill.value = ['desc', 'style', 'refs']
    reorderDialogVisible.value = true
  }

  function confirmReorder() {
    const fill = reorderFill.value.join(',')
    reorderDialogVisible.value = false
    // 埋点（REQ-033 §4.2 口径）：再来一单流程启动
    trackEvent('artist_action', { action: 'reorder_start', fromOrderId: order.value?.id, fill })
    router.push({ path: '/orders/new', query: { from: order.value?.id, fill } })
  }

  // ─── R58-6: 客户 QQ 跳转 + 复制 ───
  function jumpToQq(qq: string) {
    window.open(`tencent://message/?uin=${encodeURIComponent(qq)}`, '_self')
  }
  async function copyQq(qq: string) {
    try {
      await navigator.clipboard.writeText(qq)
      ElMessage.success(t('orderDetail.qqCopied'))
    } catch {
      ElMessage.warning(qq) // 剪贴板不可用时直接展示 QQ 号供手动复制
    }
  }

  // ─── F1 围剿：画师补发客户追踪链接（简化方案：新令牌作废旧令牌） ───
  const regeneratingToken = ref(false)
  async function regenerateAndCopyLink() {
    try {
      await ElMessageBox.confirm(t('orderDetail.regenerateTokenConfirm'), t('orderDetail.copyTrackLink'), {
        type: 'warning',
        confirmButtonText: t('orderDetail.regenerateTokenConfirmBtn'),
        cancelButtonText: t('common.cancel')
      })
    } catch {
      return // 用户取消
    }
    regeneratingToken.value = true
    try {
      const res = await artistApi.regenerateCustomerToken(routeId)
      const full = new URL(res.trackUrl, window.location.origin).href
      // K1-2：令牌重生成成功即为成功；剪贴板失败单独提示手动复制，不回滚不作废
      try {
        await navigator.clipboard.writeText(full)
        ElMessage.success(t('orderDetail.regenerateTokenSuccess'))
      } catch {
        ElMessageBox.alert(
          h('div', [
            h('p', { style: 'margin:0 0 8px' }, t('orderDetail.regenerateTokenManualHint')),
            h('code', { style: 'word-break:break-all;font-size:12px;line-height:1.6' }, full)
          ]),
          t('orderDetail.regenerateTokenManualTitle'),
          { confirmButtonText: t('common.confirm'), dangerouslyUseHTMLString: false }
        ).catch(() => {})
      }
    } catch (err) {
      ElMessage.error((err as ApiErrShape).message || t('orderDetail.regenerateTokenFailed'))
    } finally {
      regeneratingToken.value = false
    }
  }

  // ─── R17: 优先级（点击即保存，失败回滚） ───
  // 围剿 a1-3: 请求序号守卫——快切优先级时仅最新序号可写 prevPriority/回滚（对齐 changeStatus 的 statusAction 模式），
  // 旧响应不得用过期快照覆盖已确认的优先级（prevPriority 由宿主持有：loadOrder 重置基线也写它）
  let prioritySeq = 0
  async function changePriority(priority: string | number | boolean | undefined) {
    const mySeq = ++prioritySeq
    try {
      await artistApi.updatePriority(routeId, priority as OrderPriority)
      if (mySeq !== prioritySeq) return
      prevPriority.value = priority as OrderPriority
      ElMessage.success(t('orderDetail.priorityUpdated'))
    } catch (err) {
      if (mySeq !== prioritySeq) return
      order.value!.priority = prevPriority.value!
      ElMessage.error((err as ApiErrShape).message)
    }
  }

  // T3: 状态变更共享守卫——推进/打回/固定状态按钮快速连点会重复发请求。
  // statusAction 记录飞行动作（''=空闲；'advance'/'back'/目标状态值），精准控制哪个按钮转 loading
  // （statusAction ref 由宿主提前定义，workflow composable 与 changeStatus 共享）
  async function changeStatus(status: OrderStatus) {
    if (statusAction.value) return
    statusAction.value = status
    try {
      // 815 审计 P1-3：乐观锁接线——携带当前 version，双开标签页旧快照写入会被后端 409 拦下
      const opts = order.value?.version != null ? { version: order.value.version } : {}
      // M-9: 写回经统一入口（旧快照拒收）——互斥锁只防按钮连点，管不住与 loadOrder 的跨路并发
      applyOrder(await artistApi.updateStatus(routeId, status, opts))
      ElMessage.success(t('orderDetail.statusUpdated'))
      trackEvent('artist_action', { action: 'order_status_change', status })
    } catch (err) {
      // 815 审计 P1-3：冲突时提示并重拉服务端真相，不再静默覆盖
      const e = err as ApiErrShape
      if (e?.code === 'ORDER_CONFLICT') {
        ElMessage.warning(t('common.orderConflict'))
        await loadOrder()
      } else {
        ElMessage.error(e.message)
      }
    } finally {
      statusAction.value = ''
    }
  }

  // ─── R39：取消订单滑块确认（R30e 交互，C59 高代价操作用滑块） ───
  // 815 拍板 #1：取消走带 5 秒撤销窗口的新端点（队列重排延迟结算）
  const cancelUndo = ref<{ visible: boolean; orderId: number | string | null; label: string; windowMs: number }>({ visible: false, orderId: null, label: '', windowMs: 5000 })

  /** 取消成功后亮撤销提示 */
  function showCancelUndo(updated: { id?: number; order_no?: string }, windowMs: number | undefined) {
    cancelUndo.value = {
      visible: true,
      orderId: updated.id ?? routeId,
      label: updated.order_no || String(routeId),
      windowMs: windowMs ?? 5000
    }
  }

  /** 撤销取消：成功恢复订单；窗口已过（410）提示 */
  async function onUndoCancel() {
    const id = cancelUndo.value.orderId
    cancelUndo.value.visible = false
    if (id == null) return
    try {
      applyOrder(await artistApi.undoCancelOrder(Number(id))) // M-9: 统一写入口（旧快照拒收）
      ElMessage.success(t('orderDetail.cancelUndone'))
    } catch (err) {
      const e = err as ApiErrShape
      ElMessage.error(e.code === 'CANCEL_UNDO_EXPIRED' ? t('orderDetail.cancelUndoExpired') : e.message)
      await loadOrder()
    }
  }

  /** 取消订单提交（滑块滑到底与键盘替代按钮共用）；提交期间锁住滑块/按钮，防重复触发 */
  const cancelSubmitting = ref(false)

  async function confirmCancelOrder() {
    if (cancelSubmitting.value) return
    cancelSubmitting.value = true
    try {
      const res = await artistApi.cancelOrder(Number(routeId))
      applyOrder(res) // M-9: 统一写入口（旧快照拒收）
      showCancelUndo(res, res.undoWindowMs)
      ElMessage.success(t('orderDetail.statusUpdated'))
    } catch (err) {
      // R-2: 已收款订单取消被后端拦截（409 CANCEL_WITH_PAYMENT，Batch A 契约）——
      // 二次确认「已收 ¥X、资金需线下退还」，确认后带 confirmPaidCancel 重发
      const e = err as ApiErrShape
      if (e.code === 'CANCEL_WITH_PAYMENT' && e.detail?.paidCents != null) {
        try {
          await ElMessageBox.confirm(
            t('orderDetail.cancelPaidConfirm', { amount: formatCents(e.detail.paidCents) }),
            t('orderDetail.confirmTitle'),
            { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
          )
        } catch {
          return // 用户取消二次确认：不取消订单
        }
        try {
          const res = await artistApi.cancelOrder(Number(routeId), { confirmPaidCancel: true })
          applyOrder(res) // M-9: 统一写入口（旧快照拒收）
          showCancelUndo(res, res.undoWindowMs)
          ElMessage.success(t('orderDetail.statusUpdated'))
        } catch (err) {
          ElMessage.error((err as ApiErrShape).message)
        }
      } else {
        ElMessage.error((err as ApiErrShape).message)
      }
    } finally {
      cancelSubmitting.value = false
    }
  }

  const {
    active: slideCancelActive,
    progress: slideCancelProgress,
    open: openSlideCancel,
    close: closeSlideCancel,
    onStart: slideOnStart,
    onMove: slideOnMove,
    onEnd: slideOnEnd
  } = useSlideConfirm({
    onConfirm: confirmCancelOrder
  })

  /** 提交在途时滑块不再响应（防拖拽路径二次触发） */
  function handleSlideStart(e: PointerEvent) {
    if (cancelSubmitting.value) return
    slideOnStart(e)
  }

  function handleSlideMove(e: PointerEvent) {
    if (cancelSubmitting.value) return
    slideOnMove(e)
  }

  async function handleSlideEnd() {
    if (cancelSubmitting.value) return
    await slideOnEnd()
  }

  // ─── 815 拍板 #4：画师再许可交付文件下载 ───
  const repermittingId = ref<number | null>(null)

  async function repermitDeliverable(d: DetailDeliverableRow) {
    if (repermittingId.value !== null) return
    repermittingId.value = d.id
    try {
      applyOrder(await artistApi.repermitDeliverable(Number(routeId), d.id)) // M-9: 统一写入口（旧快照拒收）
      ElMessage.success(t('orderDetail.deliverableRepermitted'))
    } catch (err) {
      ElMessage.error((err as ApiErrShape).message)
    } finally {
      repermittingId.value = null
    }
  }

  // UI-1: 删除参考图（悬停显示，确认后删除，焦点图由后端自动清理）
  async function deleteReference(reference: DetailReferenceRow) {
    try {
      await ElMessageBox.confirm(
        t('orderDetail.deleteRefConfirm'),
        t('orderDetail.confirmTitle'),
        { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
      )
    } catch { return }
    try {
      await artistApi.deleteReference(routeId, reference.id!)
      await loadOrder()
      ElMessage.success(t('orderDetail.deleteRefSuccess'))
    } catch (err) {
      ElMessage.error((err as ApiErrShape).message)
    }
  }

  function openFile(url: string | undefined) {
    // H-1 修复：使用后端返回的签名 URL（references/deliverables 非公开目录）
    window.open(url, '_blank', 'noopener')
  }

  return {
    reorderDialogVisible, reorderFill, openReorderDialog, confirmReorder,
    jumpToQq, copyQq, regeneratingToken, regenerateAndCopyLink,
    changePriority, changeStatus,
    cancelUndo, cancelSubmitting, confirmCancelOrder, onUndoCancel,
    slideCancelActive, slideCancelProgress, openSlideCancel, closeSlideCancel,
    handleSlideStart, handleSlideMove, handleSlideEnd,
    repermittingId, repermitDeliverable, deleteReference, openFile
  }
}
