// 压图改尺寸工具（812-tools-a：③压图改尺寸）
// 设计：纯前端 File API + canvas，图片不出网；尺寸计算抽成纯函数便于 vitest。
// 精确尺寸预设（小红书/头像/自定义宽高）采用居中 cover 裁切填满，
// 微博预设只定宽、高度等比自适应（不裁切）。

/** 尺寸预设（height 为 0 = 高度等比自适应） */
export const IMAGE_PRESETS = [
  { key: 'xhs', width: 1242, height: 1660 },
  { key: 'weibo', width: 1080, height: 0 },
  { key: 'avatar', width: 500, height: 500 }
]

/**
 * 解析目标尺寸：preset 命中则取预设；否则自定义（宽必填，高可空=等比）
 * @returns {{ width: number, height: number|null }}
 */
export function targetSize(presetKey, customW, customH) {
  const preset = IMAGE_PRESETS.find((p) => p.key === presetKey)
  if (preset) return { width: preset.width, height: preset.height || null }
  const width = Math.round(Number(customW))
  const height = customH === '' || customH === null || customH === undefined
    ? null
    : Math.round(Number(customH))
  return { width, height }
}

/** 等比高度（微博 1080 宽：按源图比例换算，至少 1px） */
export function autoHeight(srcW, srcH, dstW) {
  if (!srcW || !srcH || !dstW) return null
  return Math.max(1, Math.round((srcH * dstW) / srcW))
}

/**
 * 居中 cover 裁切矩形（填满目标画布，超出的部分裁掉）
 * @returns {{ dw:number, dh:number, dx:number, dy:number }}
 */
export function coverRect(srcW, srcH, dstW, dstH) {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const dw = srcW * scale
  const dh = srcH * scale
  return { dw, dh, dx: (dstW - dw) / 2, dy: (dstH - dh) / 2 }
}

/** 体积展示（B/KB/MB，保留 1 位小数） */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** 校验自定义尺寸：1-10000 的整数 */
export function isValidCustomDims(width, height) {
  const nums = [width, height].filter((v) => v !== null && v !== undefined && v !== '')
  if (!nums.length) return false
  return nums.every((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 10000)
}

/**
 * 813-fq-tail-shared 战役 S：canvas 链路错误码化（不再内置英文用户文案）。
 * 调用方 ElMessage 统一走 i18n（当前统一映射 imageResize.processFailed）；
 * 需要细分时可把 IMAGE_RESIZE_ERROR.* 映射到对应 i18n 键。
 */
export const IMAGE_RESIZE_ERROR = Object.freeze({
  INVALID_TARGET_SIZE: 'INVALID_TARGET_SIZE',
  CANVAS_2D_UNAVAILABLE: 'CANVAS_2D_UNAVAILABLE',
  WEBP_ENCODE_FAILED: 'WEBP_ENCODE_FAILED'
})

/**
 * 完整压缩链路：canvas 缩放 → WebP 导出（质量联动；PNG 透明通道天然保留，
 * 不铺底不填色，alpha 原样进入 WebP）。
 * @param {HTMLImageElement} image 已加载的原图
 * @param {{ width:number, height:number|null, quality:number }} opts
 * @returns {Promise<Blob>}
 */
export function resizeImageToBlob(image, { width, height, quality }) {
  return new Promise((resolve, reject) => {
    const dstW = Math.round(width)
    const dstH = height ? Math.round(height) : autoHeight(image.naturalWidth, image.naturalHeight, dstW)
    if (!Number.isInteger(dstW) || dstW < 1 || dstW > 10000 || !dstH || !Number.isInteger(dstH) || dstH < 1 || dstH > 10000) {
      reject(new Error(IMAGE_RESIZE_ERROR.INVALID_TARGET_SIZE))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = dstW
    canvas.height = dstH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error(IMAGE_RESIZE_ERROR.CANVAS_2D_UNAVAILABLE))
      return
    }
    const { dw, dh, dx, dy } = coverRect(image.naturalWidth, image.naturalHeight, dstW, dstH)
    ctx.drawImage(image, dx, dy, dw, dh)
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(IMAGE_RESIZE_ERROR.WEBP_ENCODE_FAILED))),
      'image/webp',
      quality
    )
  })
}
