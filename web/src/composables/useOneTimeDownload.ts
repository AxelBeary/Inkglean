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
  await downloadAsset(url, fileName ?? undefined)
  return confirmOneTimeDownload(orderNo, fileId, token, confirmationToken, onConfirmed)
}
