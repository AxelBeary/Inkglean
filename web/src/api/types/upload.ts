// API 边界 DTO · 上传（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 上传（upload.routes.ts） ───

/** 图片/参考图上传响应（含格式劝告 typeWarning） */
export interface UploadImageResult {
  filePath: string
  url: string
  originalName: string
  mimeType: string
  size: number
  typeWarning: string | null
}

/** 交付文件/备注附图上传响应（无 typeWarning） */
export interface UploadFileResult {
  filePath: string
  url: string
  originalName: string
  mimeType: string
  size: number
}

/**
 * 参考图现签响应（issue #82 补：草稿恢复补缩略图）
 * ⚠️ 只包含签得出来的条目——他人上传的、已随订单提交的、文件已不存在的路径不会出现，
 * 调用方须按「缺席 = 已失效」处理，不能假定顺序或长度与请求一致。
 */
export interface SignReferenceResult {
  items: Array<{ filePath: string; url: string }>
}
