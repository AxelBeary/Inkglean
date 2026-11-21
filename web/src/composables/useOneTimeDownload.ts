import { orderApi } from '../api/index'
import type { ApiError } from '../api/modules/http'
import { downloadAsset } from '../utils/download'

export type OneTimeDownloadResult =
  | { status: 'confirmed' }
  | { status: 'confirm-failed'; confirmationToken: string }
  | { status: 'confirm-expired' }

/** Keep the receipt token with a received file so a failed confirmation can be retried safely. */
export async function confirmOneTimeDownload(
  orderNo: string,
  fileId: number,
  token: string,
  confirmationToken: string,
  onConfirmed: () => void
): Promise<OneTimeDownloadResult> {
  try {
    await orderApi.deliveryDownloadConfirm(orderNo, fileId, token, confirmationToken)
    onConfirmed()
    return { status: 'confirmed' }
  } catch (err) {
    const apiError = err as ApiError
    if (apiError?.code === 'DOWNLOAD_LOCKED') {
      onConfirmed()
      return { status: 'confirmed' }
    }
    if (apiError?.code === 'ORDER_CONFLICT' && apiError.status === 409) {
      return { status: 'confirm-expired' }
    }
    return { status: 'confirm-failed', confirmationToken }
  }
}

export async function downloadOneTimeFile(
  orderNo: string,
  fileId: number,
  token: string,
  fileName: string | null | undefined,
  onConfirmed: () => void
): Promise<OneTimeDownloadResult> {
  const { url, confirmationToken } = await orderApi.deliveryDownloadStart(orderNo, fileId, token)
  try {
    await downloadAsset(url, fileName ?? undefined)
  } catch (err) {
    // 传输超时/中断时文件并未落盘，不能进入确认态；保留 start 签发的尝试，交给服务端半途防护结算。
    if ((err as Error)?.message === 'DOWNLOAD_TIMEOUT') throw Object.assign(new Error('DOWNLOAD_TIMEOUT'), { code: 'DOWNLOAD_TIMEOUT' })
    throw err
  }
  return confirmOneTimeDownload(orderNo, fileId, token, confirmationToken, onConfirmed)
}
