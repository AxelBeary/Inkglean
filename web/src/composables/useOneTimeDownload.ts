import { orderApi } from '../api/index'
import type { ApiError } from '../api/modules/http'
import { downloadAsset } from '../utils/download'

export type OneTimeDownloadResult = 'confirmed' | 'confirm-failed'

/** 完成确认是下载链路的独立步骤；失败时不再让调用方把「文件已收到」误报成「下载失败」。 */
export async function confirmOneTimeDownload(
  orderNo: string,
  fileId: number,
  token: string,
  onConfirmed: () => void
): Promise<OneTimeDownloadResult> {
  try {
    await orderApi.deliveryDownloadConfirm(orderNo, fileId, token)
    onConfirmed()
    return 'confirmed'
  } catch (err) {
    if ((err as ApiError)?.code === 'DOWNLOAD_LOCKED') {
      onConfirmed()
      return 'confirmed'
    }
    return 'confirm-failed'
  }
}

export async function downloadOneTimeFile(
  orderNo: string,
  fileId: number,
  token: string,
  fileName: string | null | undefined,
  onConfirmed: () => void
): Promise<OneTimeDownloadResult> {
  const { url } = await orderApi.deliveryDownloadStart(orderNo, fileId, token)
  await downloadAsset(url, fileName ?? undefined)
  return confirmOneTimeDownload(orderNo, fileId, token, onConfirmed)
}
