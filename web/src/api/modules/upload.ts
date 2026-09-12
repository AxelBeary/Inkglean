// 端点方法 · 上传（图片/参考图/交付物/备注附图）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { postJson } from './http'
import type { UploadImageResult, UploadFileResult } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── 上传 ───
// P2-#14: 上传请求覆盖 timeout（50MB 交付物在慢速网络需 >15s）
const UPLOAD_TIMEOUT_MS = 120_000

/** 上传专用选项（仅合并调用方 header，如 G-7 的 x-anon-token） */
interface UploadOptions {
  headers?: Record<string, string>
}

export const uploadApi = {
  image: (file: Blob): Promise<UploadImageResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  // G-7（P2-13 前端侧）: 参考图上传需 x-anon-token（后端 F-10 契约），options 合并调用方 header
  reference: (file: Blob, options: UploadOptions = {}): Promise<UploadImageResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/reference', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...(options.headers || {}) },
      timeout: UPLOAD_TIMEOUT_MS
    })
  },
  deliverable: (file: Blob): Promise<UploadFileResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/deliverable', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  // R19: 备注附图（需登录，notes/{artistId}/ 目录，签名 URL 返回）
  noteImage: (file: Blob): Promise<UploadFileResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/note-image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  }
}
