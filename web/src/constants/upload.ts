/**
 * 上传限制单源（b1: 10MB/5 张/50MB 曾散落 ArtworkManage/ManualOrderLeft/OrderDetail/
 * QuickActions/DeliverDialog/QueueBoardList/useOrderForm/useOrderGallery/usePasteUpload 等处）
 */

/** 单张参考图/作品图大小上限（MB） */
export const MAX_IMAGE_MB = 10
/** 单张参考图/作品图大小上限（字节） */
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024
/** 单次参考图/作品图数量上限（张） */
export const MAX_IMAGE_COUNT = 5
/** 交付文件大小上限（MB） */
export const DELIVER_MAX_MB = 50
/** 交付文件大小上限（字节） */
export const DELIVER_MAX_BYTES = DELIVER_MAX_MB * 1024 * 1024
