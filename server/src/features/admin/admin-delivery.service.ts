import { realpathSync, statSync } from 'fs'
import { resolve } from 'path'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { FILE_TTL_MS, signedUrl } from '../../shared/file-sign.js'
import { writeAdminAction } from '../compliance/compliance.service.js'
import { issueAdminDeliverableDownload } from '../order/order-gallery.service.js'

interface PaidDeliveryOrder {
  id: number
  order_no: string
  artist_id: number
}

interface DeliveryFileSummary {
  id: number
  original_name: string | null
  file_size: number | null
  download_locked: number
}

function getPaidDeliveryOrder(orderNo: string): PaidDeliveryOrder {
  // 按完整订单号精确匹配，软删等状态不影响已有交付的管理端查询。
  const order = db.prepare(`
    SELECT id, order_no, artist_id FROM orders
    WHERE order_no = ? AND status = 'delivered' AND paid_total_cents > 0
  `).get(orderNo) as PaidDeliveryOrder | undefined
  if (!order) throw new AppError(E.ORDER_NOT_FOUND, 404)
  return order
}

export function getAdminDelivery(orderNo: string) {
  const order = getPaidDeliveryOrder(orderNo)
  const files = db.prepare(`
    SELECT id, original_name, file_size, download_locked FROM deliverables WHERE order_id = ? ORDER BY id
  `).all(order.id) as DeliveryFileSummary[]
  return {
    orderNo: order.order_no,
    deliverables: files.map(file => ({
      id: file.id,
      fileName: file.original_name,
      fileSize: file.file_size,
      downloadLocked: file.download_locked === 1
    }))
  }
}

function assertStoredDeliveryFile(filePath: string, artistId: number): void {
  // 仅签发该画师交付目录中已登记的常规文件。拒绝路径别名和重定向到其他文件的链接。
  if (!filePath.startsWith(`deliverables/${artistId}/`) || /[\\%?#:]/.test(filePath) ||
      filePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new AppError(E.MISSING_FILE, 404)
  }
  try {
    const uploadRoot = realpathSync(resolve(process.env.UPLOAD_DIR || './uploads'))
    const expected = resolve(uploadRoot, filePath)
    if (realpathSync(expected) === expected && statSync(expected).isFile()) return
  } catch {
    // 文件不可用统一返回 404，响应和日志不带磁盘路径。
  }
  throw new AppError(E.MISSING_FILE, 404)
}

export function reissueAdminDeliveryLink(orderNo: string, fileId: number, adminId: number, adminIp: string) {
  return db.transaction(() => {
    const order = getPaidDeliveryOrder(orderNo)
    const file = db.prepare('SELECT file_path FROM deliverables WHERE id = ? AND order_id = ?')
      .get(fileId, order.id) as { file_path: string } | undefined
    if (!file) throw new AppError(E.MISSING_FILE, 404)
    assertStoredDeliveryFile(file.file_path, order.artist_id)

    const { nonce, issuedAt } = issueAdminDeliverableDownload(order.id, fileId)
    writeAdminAction(adminId, 'delivery_link_reissue', 'deliverable', fileId, order.order_no, adminIp)
    return {
      url: signedUrl(file.file_path, { deliverableId: fileId, nonce }, issuedAt),
      expiresInSeconds: FILE_TTL_MS / 1000
    }
  })()
}
