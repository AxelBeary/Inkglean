// 图片水印合成工具（REQ-035 批D：图片水印工具页，纯前端 canvas，零依赖）
// 设计：布局计算抽成纯函数（便于 vitest 单测，不依赖 canvas）；
//       drawWatermark 只负责把水印叠加到已画好背景的 ctx 上；
//       composeWatermarked 封装完整链路：加载图片 → 画背景 → 叠水印 → 导出 dataURL。
// 同源铁律：作品图/完稿图均为 /uploads 同域（fastifyStatic 托管），canvas 不污染；
//           新传图走 FileReader dataURL，无跨域问题；不提供外部 URL 输入入口。

// ─── 常量 ───
/** 单枚水印位置（派工单：四角 + 中央，5 选 1） */
export const WM_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']
/** 四角模式的默认 position 值：四角各一枚 */
export const WM_POSITION_CORNERS = 'corners'
/** 平铺模式文字的经典斜向角度（-45°） */
export const TILE_TEXT_ROTATE = -Math.PI / 4
/** 水印文字字体栈（canvas 绘图字体，与 UI 字体无关，跨平台回退安全） */
export const WM_FONT_FAMILY = '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

// ─── 布局计算（纯函数，可单测） ───

/**
 * 单枚水印锚点：返回水印左上角坐标
 * @param {number} canvasW 画布宽
 * @param {number} canvasH 画布高
 * @param {number} wmW 水印元素宽
 * @param {number} wmH 水印元素高
 * @param {string} position top-left/top-right/bottom-left/bottom-right/center
 * @param {number} margin 距边距离（px）
 */
export function wmAnchor(canvasW: number, canvasH: number, wmW: number, wmH: number, position: string, margin: number): { x: number, y: number } {
  const m = Math.max(0, margin)
  switch (position) {
    case 'top-right':
      return { x: canvasW - wmW - m, y: m }
    case 'bottom-left':
      return { x: m, y: canvasH - wmH - m }
    case 'bottom-right':
      return { x: canvasW - wmW - m, y: canvasH - wmH - m }
    case 'center':
      return { x: Math.max(0, (canvasW - wmW) / 2), y: Math.max(0, (canvasH - wmH) / 2) }
    case 'top-left':
    default:
      return { x: m, y: m }
  }
}

/**
 * 四角各一枚（派工单「四角」模式）：返回 4 个左上角坐标
 * @param {number} canvasW 画布宽
 * @param {number} canvasH 画布高
 * @param {number} wmW 水印元素宽
 * @param {number} wmH 水印元素高
 * @param {number} margin 距边距离（px）
 */
export function wmCorners(canvasW: number, canvasH: number, wmW: number, wmH: number, margin: number): Array<{ x: number, y: number }> {
  const m = Math.max(0, margin)
  return [
    { x: m, y: m },
    { x: canvasW - wmW - m, y: m },
    { x: m, y: canvasH - wmH - m },
    { x: canvasW - wmW - m, y: canvasH - wmH - m }
  ]
}

/**
 * 平铺网格（派工单「平铺」模式）：从 (0,0) 起按 (元素尺寸 + 间距) 步进，返回左上角坐标数组
 * @param {number} canvasW 画布宽
 * @param {number} canvasH 画布高
 * @param {number} wmW 水印元素宽
 * @param {number} wmH 水印元素高
 * @param {number} spacing 间距（px）
 */
export function wmTileGrid(canvasW: number, canvasH: number, wmW: number, wmH: number, spacing: number): Array<{ x: number, y: number }> {
  const out: Array<{ x: number, y: number }> = []
  if (wmW <= 0 || wmH <= 0 || spacing < 0) return out
  const stepX = Math.max(1, wmW + spacing)
  const stepY = Math.max(1, wmH + spacing)
  for (let y = 0; y < canvasH; y += stepY) {
    for (let x = 0; x < canvasW; x += stepX) {
      out.push({ x, y })
    }
  }
  return out
}

// ─── 尺寸计算 ───

/**
 * 水印元素尺寸
 * 文字：fontSize 决定字号，宽度经 ctx.measureText 测量；
 * LOGO：logoScale（0~1）= LOGO 宽度相对画布宽的比例，高度按原始宽高比换算。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW 画布宽
 * @param {{ logo?: HTMLImageElement, text?: string, fontSize?: number, logoScale?: number }} opts
 */
export function wmElementSize(ctx: CanvasRenderingContext2D, canvasW: number, { logo = null, text = '', fontSize = 48, logoScale = 0.2 }: { logo?: HTMLImageElement | null, text?: string, fontSize?: number, logoScale?: number } = {}): { w: number, h: number } {
  if (logo) {
    const scale = logoScale > 0 ? logoScale : 0.2
    const w = canvasW * scale
    const h = w * (logo.naturalHeight / (logo.naturalWidth || 1))
    return { w, h }
  }
  const size = Math.max(1, fontSize)
  ctx.font = `600 ${size}px ${WM_FONT_FAMILY}`
  return { w: ctx.measureText(text || '').width, h: size }
}

// ─── 绘制 ───

/**
 * 在 (x, y) 绘制一枚水印（文字或 LOGO），绕元素中心旋转
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number, text?: string, logo?: HTMLImageElement, opacity?: number, rotate?: number }} opts
 */
export function paintWatermarkAt(ctx: CanvasRenderingContext2D, { x, y, w, h, text = '', logo = null, opacity = 0.25, rotate = 0 }: { x: number, y: number, w: number, h: number, text?: string, logo?: HTMLImageElement | null, opacity?: number, rotate?: number }): void {
  if (w <= 0 || h <= 0) return
  const alpha = Math.min(1, Math.max(0, opacity))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x + w / 2, y + h / 2)
  if (rotate) ctx.rotate(rotate)
  if (logo) {
    ctx.drawImage(logo, -w / 2, -h / 2, w, h)
  } else {
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)
  }
  ctx.restore()
}

/** drawWatermark 选项（image 为兼容派工单签名保留，当前布局不依赖） */
interface DrawWatermarkOptions {
  image?: HTMLImageElement
  mode?: 'corner' | 'stretch' | 'tile'
  position?: string
  opacity?: number
  fontSize?: number
  spacing?: number
  margin?: number
  logo?: HTMLImageElement | null
  text?: string
  logoScale?: number
}

/**
 * 把水印叠加到已画好背景的 ctx 上（image 参数为兼容派工单签名保留，当前布局不依赖）
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   image?: HTMLImageElement,
 *   mode?: 'corner' | 'stretch' | 'tile',
 *   position?: string,
 *   opacity?: number,
 *   fontSize?: number,
 *   spacing?: number,
 *   margin?: number,
 *   logo?: HTMLImageElement | null,
 *   text?: string,
 *   logoScale?: number
 * }} options
 */
export function drawWatermark(ctx: CanvasRenderingContext2D, options: DrawWatermarkOptions = {}): void {
  const {
    mode = 'corner',
    position = WM_POSITION_CORNERS,
    opacity = 0.25,
    fontSize = 48,
    spacing = 160,
    margin = 24,
    logo = null,
    text = '',
    logoScale = 0.2
  } = options
  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  if (canvasW <= 0 || canvasH <= 0) return

  const size = wmElementSize(ctx, canvasW, { logo, text, fontSize, logoScale })
  if (size.w <= 0 || size.h <= 0) return

  if (mode === 'stretch') {
    // 拉伸：水印铺满全图（半透明铺底）。LOGO 等比 cover 铺满（不变形，裁掉溢出）；文字居中大字号。
    if (logo) {
      const scale = Math.max(canvasW / (logo.naturalWidth || 1), canvasH / (logo.naturalHeight || 1))
      const w = logo.naturalWidth * scale
      const h = logo.naturalHeight * scale
      paintWatermarkAt(ctx, { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h, logo, opacity })
    } else {
      paintWatermarkAt(ctx, { x: 0, y: 0, ...size, text, opacity })
    }
    return
  }

  if (mode === 'tile') {
    // 平铺：水印重复排列覆盖全图；文字斜置（经典平铺样式），LOGO 正置
    const anchors = wmTileGrid(canvasW, canvasH, size.w, size.h, spacing)
    const rotate = logo ? 0 : TILE_TEXT_ROTATE
    for (const a of anchors) {
      paintWatermarkAt(ctx, { ...a, ...size, text, logo, opacity, rotate })
    }
    return
  }

  // corner 模式：position='corners' → 四角各一枚；否则按所选单枚位置
  if (position === WM_POSITION_CORNERS) {
    const anchors = wmCorners(canvasW, canvasH, size.w, size.h, margin)
    for (const a of anchors) {
      paintWatermarkAt(ctx, { ...a, ...size, text, logo, opacity })
    }
  } else {
    const a = wmAnchor(canvasW, canvasH, size.w, size.h, position, margin)
    paintWatermarkAt(ctx, { ...a, ...size, text, logo, opacity })
  }
}

// ─── 完整链路封装 ───

/** 加载图片（同源 URL 或 FileReader dataURL 均可） */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/**
 * 合成水印并导出 PNG dataURL
 * @param {string} src 原图（同源 URL 或 FileReader dataURL）
 * @param {object} options drawWatermark 参数
 * @returns {Promise<string>}
 */
export async function composeWatermarked(src: string, options: DrawWatermarkOptions): Promise<string> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  drawWatermark(ctx, { ...options, image: img })
  return canvas.toDataURL('image/png')
}
