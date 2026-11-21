import { onScopeDispose, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '../api/index'
import { confirmOneTimeDownload, downloadOneTimeFile } from './useOneTimeDownload'

type DownloadOrder = { orderNo: string; token: string }

export function useTrackDownloads() {
  const { t } = useI18n()
  const downloadingId = ref<number | null>(null)
  const pendingConfirmationTokens = reactive(new Map<number, string>())
  const pendingAdminDownloadIds = reactive(new Set<number>())
  /** Files confirmed in this session: server marks them locked, so the button must not invite a doomed retry. */
  const confirmedIds = reactive(new Set<number>())
  /** 下载代际：同单重查会释放 downloadingId，迟到的 finally 不得清掉新一轮的忙碌标记。 */
  let downloadGeneration = 0
  let activeOrder: DownloadOrder | undefined

  function showDownloadOrder(order?: DownloadOrder) {
    // A fresh lookup can retry a start that was blocked by a now-expired admin link.
    pendingAdminDownloadIds.clear()
    // 同单同令牌重查：保留在途下载与其确认令牌（卡死由下载超时兜底，不靠重查打断）。
    if (order && activeOrder?.orderNo === order.orderNo && activeOrder.token === order.token) return
    // 换单/换令牌：旧代际作废，迟到的 finally 与回调不得再改这一单的状态。
    downloadGeneration++
    activeOrder = order ? { ...order } : undefined
    downloadingId.value = null
    pendingConfirmationTokens.clear()
    confirmedIds.clear()
  }

  onScopeDispose(() => { activeOrder = undefined })

  async function downloadDeliverable(id: number, fileName: string | null | undefined) {
    const order = activeOrder
    if (!order || downloadingId.value !== null || pendingAdminDownloadIds.has(id) || pendingConfirmationTokens.has(id)) return
    const generation = ++downloadGeneration
    downloadingId.value = id
    try {
      const result = await downloadOneTimeFile(order.orderNo, id, order.token, fileName, () => {
        if (activeOrder === order && generation === downloadGeneration) confirmedIds.add(id)
      })
      if (activeOrder !== order || generation !== downloadGeneration) return
      if (result.status === 'confirm-expired') {
        ElMessage.warning(t('delivery.confirmExpired'))
      } else if (result.status === 'confirm-failed') {
        pendingConfirmationTokens.set(id, result.confirmationToken)
        ElMessage.warning(t('delivery.confirmFailed'))
      }
    } catch (err) {
      if (activeOrder !== order || generation !== downloadGeneration) return
      const apiErr = err as ApiError
      if (apiErr?.code === 'DOWNLOAD_LOCKED') {
        confirmedIds.add(id)
        ElMessage.warning(t('delivery.downloadLockedMsg'))
      } else if (apiErr?.code === 'ORDER_CONFLICT' && apiErr.status === 409) {
        pendingAdminDownloadIds.add(id)
      } else if (apiErr?.code === 'DOWNLOAD_TIMEOUT') {
        ElMessage.warning(t('delivery.downloadTimeout'))
      } else if (apiErr?.code === 'DOWNLOAD_COOLDOWN') {
        const retryMs = Number(apiErr.detail?.retryAfterMs)
        const seconds = Number.isFinite(retryMs) && retryMs > 0 ? Math.ceil(retryMs / 1000) : 0
        ElMessage.warning(t('delivery.downloadCooldown', { n: seconds }))
      } else {
        ElMessage.error(t('delivery.downloadFailed'))
      }
    } finally {
      if (activeOrder === order && generation === downloadGeneration) downloadingId.value = null
    }
  }

  async function retryDeliverableConfirm(id: number) {
    const order = activeOrder
    const confirmationToken = pendingConfirmationTokens.get(id)
    if (!order || downloadingId.value !== null || !confirmationToken) return
    downloadingId.value = id
    try {
      const result = await confirmOneTimeDownload(order.orderNo, id, order.token, confirmationToken, () => {
        if (activeOrder === order) confirmedIds.add(id)
      })
      if (activeOrder !== order) return
      if (result.status === 'confirm-failed') {
        ElMessage.warning(t('delivery.confirmFailed'))
        return
      }
      pendingConfirmationTokens.delete(id)
      if (result.status === 'confirmed') ElMessage.success(t('delivery.confirmSuccess'))
      else ElMessage.warning(t('delivery.confirmExpired'))
    } finally {
      if (activeOrder === order) downloadingId.value = null
    }
  }

  return { downloadingId, pendingConfirmationTokens, pendingAdminDownloadIds, confirmedIds, showDownloadOrder, downloadDeliverable, retryDeliverableConfirm }
}
