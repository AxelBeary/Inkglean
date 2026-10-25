// issue-51 拆分批：约稿条 canvas 绘制模块（原住 PriceCard.vue <script setup> 内）
// 纯拆搬零改动：布局 A/B 绘制、高度预算（含 SHR-01 组间距回归口径）、字体自适应、
// 例图缓存/加载全部原样迁移；form/props 依赖改为 DrawCardInput 显式入参。
// 竖版长图 PNG 纸墨风：米白底 + 墨线分栏 + 朱砂「拾绘」落款
import { formatYuan, yuanToCents } from '../../utils/money'
import { INK_PALETTE } from '../../utils/ink-palette'
import type { ExamplePick, PriceCardTier, TierGroup, PriceCardLayout, TFn } from './types'

/** 绘制入参（组件层在落笔时刻组好：标题/联系/布局/分组/例图/翻译函数） */
export interface DrawCardInput {
  title: string
  contact: string
  layout: PriceCardLayout
  groups: TierGroup[]
  picks: ExamplePick[]
  t: TFn
}

const CARD_W = 900
const { paper: PAPER, ink: INK, ink2: INK2, ink3: INK3, line: LINE, line2: LINE2, zs: ZS, white: WHITE } = INK_PALETTE
const FONT_DISPLAY = '"LXGW WenKai","Kaiti SC","STKaiti",serif'
const FONT_BODY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'

/** 组内价格区间（元；filled 保证至少一档） */
function groupRange(tiers: PriceCardTier[]): { min: number; max: number } {
  const prices = tiers.map(td => Number(td.priceYuan))
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** 图片加载缓存（作品图直载地址与 dataURL 均可入 canvas） */
const imgCache = new Map<string, HTMLImageElement>()
function loadImage(src: string): Promise<HTMLImageElement | null> {
  const hit = imgCache.get(src)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => { imgCache.set(src, img); resolve(img) }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
async function loadPickImages(picks: ExamplePick[]): Promise<HTMLImageElement[]> {
  const out: HTMLImageElement[] = []
  for (const pick of picks) {
    const img = await loadImage(pick.src)
    if (img) out.push(img)
  }
  return out
}

/** cover 裁剪绘制（居中裁切填满目标矩形） */
function drawCropped(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.naturalWidth / Math.max(1, img.naturalHeight)
  const tr = w / Math.max(1, h)
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0
  if (ir > tr) { sw = img.naturalHeight * tr; sx = (img.naturalWidth - sw) / 2 }
  else { sh = img.naturalWidth / tr; sy = (img.naturalHeight - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxFont: number, family: string, weight = '') {
  let font = maxFont
  ctx.font = `${weight ? weight + ' ' : ''}${font}px ${family}`
  while (font > 14 && ctx.measureText(text).width > maxWidth) {
    font -= 2
    ctx.font = `${weight ? weight + ' ' : ''}${font}px ${family}`
  }
  return font
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: number, family: string) {
  ctx.font = `${font}px ${family}`
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
  return out.length < text.length ? out + '…' : out
}

/** 公共头（纸底 + 双线外框 + 标题 + 墨线菱点）→ 返回内容起始 y */
function drawHead(ctx: CanvasRenderingContext2D, canvasH: number, title: string): number {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_W, canvasH)
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.strokeRect(20, 20, CARD_W - 40, canvasH - 40)
  ctx.strokeStyle = LINE2
  ctx.lineWidth = 1
  ctx.strokeRect(26, 26, CARD_W - 52, canvasH - 52)

  const y = 80
  const text = title.trim()
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, text, 680, 52, FONT_DISPLAY)
  ctx.fillText(text, CARD_W / 2, y + 48)

  // 标题下墨线 + 朱砂菱点
  const lineY = y + 72
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(88, lineY)
  ctx.lineTo(CARD_W - 88, lineY)
  ctx.stroke()
  ctx.fillStyle = ZS
  ctx.font = `14px ${FONT_BODY}`
  ctx.textAlign = 'center'
  ctx.fillText('◆', CARD_W / 2, lineY + 5)
  return lineY + 40
}

/** 公共落款（联系方式居中 + 朱砂印章） */
function drawFooter(ctx: CanvasRenderingContext2D, y: number, contact: string, t: TFn) {
  if (contact.trim()) {
    const text = t('priceCard.contactLine', { contact: contact.trim() })
    ctx.fillStyle = INK2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(ellipsis(ctx, text, 600, 24, FONT_BODY), CARD_W / 2, y)
  }
  y += 64
  const sealSize = 56
  const sealX = CARD_W - 88 - sealSize
  ctx.save()
  ctx.translate(sealX + sealSize / 2, y + sealSize / 2)
  ctx.rotate(-4 * Math.PI / 180)
  ctx.fillStyle = ZS
  ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize)
  ctx.fillStyle = WHITE
  ctx.font = `22px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t('priceCard.sealText'), 0, 2)
  ctx.restore()
}

/** 单行价目（名称左 + 价格右 + 备注）；返回消耗高度 */
function drawPriceRow(ctx: CanvasRenderingContext2D, tier: PriceCardTier, y: number): number {
  const name = tier.name.trim()
  const price = formatYuan(yuanToCents(tier.priceYuan))
  const note = tier.note.trim()
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, name, 440, 30, FONT_DISPLAY, '600')
  ctx.fillText(name, 88, y + 30)
  ctx.textAlign = 'right'
  fitFont(ctx, price, 240, 30, FONT_BODY, '700')
  ctx.fillText(price, CARD_W - 88, y + 30)
  if (note) {
    ctx.fillStyle = INK3
    ctx.textAlign = 'left'
    ctx.fillText(ellipsis(ctx, note, 560, 18, FONT_BODY), 88, y + 60)
  }
  return 92
}

/** 节头（画风名 + 「¥xx 起」+ 下划线）；返回消耗高度 */
function drawSectionHead(ctx: CanvasRenderingContext2D, group: TierGroup, y: number, t: TFn): number {
  const label = group.name || t('priceCard.groupDefault')
  const { min } = groupRange(group.tiers)
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, label, 400, 34, FONT_DISPLAY, '700')
  ctx.fillText(label, 88, y + 32)
  const rangeText = `${formatYuan(yuanToCents(min))}${t('priceCard.rangeFrom')}`
  ctx.fillStyle = INK3
  ctx.font = `20px ${FONT_BODY}`
  ctx.textAlign = 'right'
  ctx.fillText(rangeText, CARD_W - 88, y + 32)
  ctx.strokeStyle = LINE2
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(88, y + 46)
  ctx.lineTo(CARD_W - 88, y + 46)
  ctx.stroke()
  return 56
}

/** 行间虚线分隔 */
function drawRowDivider(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = LINE2
  ctx.lineWidth = 1
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(88, y)
  ctx.lineTo(CARD_W - 88, y)
  ctx.stroke()
  ctx.setLineDash([])
}

/** 布局 A：菜单长条式（顶部例图横排 + 按画风分节价目，对标 oimimo 长条视图） */
function drawLayoutA(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, images: HTMLImageElement[], input: DrawCardInput) {
  const groups = input.groups
  const thumbCell = images.length ? Math.min(200, Math.floor((CARD_W - 176 - (images.length - 1) * 16) / images.length)) : 0
  const thumbH = images.length ? thumbCell + 48 : 0
  const rowsH = groups.reduce((acc, g) => acc + 56 + g.tiers.length * 92, 0)
  // SHR-01: 组间距 24×(g−1) 计入高度预算，防 g≥3 时落款/印章被裁出画布
  const gapsH = Math.max(0, groups.length - 1) * 24
  const canvasH = 80 + 72 + 40 + thumbH + rowsH + gapsH + 24 + 64 + 88
  canvas.width = CARD_W
  canvas.height = canvasH
  let y = drawHead(ctx, canvasH, input.title)

  // 例图横排（居中等宽方阵，墨线框）
  if (images.length && thumbCell > 0) {
    const gap = 16
    const total = images.length * thumbCell + (images.length - 1) * gap
    let x = (CARD_W - total) / 2
    for (const img of images) {
      drawCropped(ctx, img, x, y, thumbCell, thumbCell)
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, thumbCell, thumbCell)
      x += thumbCell + gap
    }
    y += thumbH
  }

  // 按画风分节
  groups.forEach((group, gi) => {
    y += drawSectionHead(ctx, group, y, input.t)
    group.tiers.forEach((tier, ti) => {
      y += drawPriceRow(ctx, tier, y)
      if (ti < group.tiers.length - 1) drawRowDivider(ctx, y - 24)
    })
    if (gi < groups.length - 1) {
      drawRowDivider(ctx, y - 24)
      y += 24
    }
  })

  y += 24
  drawFooter(ctx, y, input.contact, input.t)
}

/** 布局 B：画风卡片式（一组一卡：横幅例图轮换 + 尺寸清单，对标 oimimo 卡片视图） */
function drawLayoutB(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, images: HTMLImageElement[], input: DrawCardInput) {
  const groups = input.groups
  const cardX = 88
  const cardW = CARD_W - 176
  const bannerH = images.length ? Math.round((cardW - 48) * 8 / 21) : 0
  const cardBox = (g: TierGroup) => 24 + 40 + (bannerH ? bannerH + 16 : 0) + g.tiers.length * 44 + 16
  const cardsH = groups.reduce((acc, g) => acc + cardBox(g), 0) + Math.max(0, groups.length - 1) * 24
  const canvasH = 80 + 72 + 40 + cardsH + 64 + 88
  canvas.width = CARD_W
  canvas.height = canvasH
  let y = drawHead(ctx, canvasH, input.title)

  groups.forEach((group, gi) => {
    const label = group.name || input.t('priceCard.groupDefault')
    const { min, max } = groupRange(group.tiers)
    const banner = images.length ? images[gi % images.length] : null
    const boxH = cardBox(group)

    // 卡片底（白宣 + 细墨线）
    ctx.fillStyle = '#FFFDF7'
    ctx.fillRect(cardX, y, cardW, boxH)
    ctx.strokeStyle = LINE2
    ctx.lineWidth = 1
    ctx.strokeRect(cardX, y, cardW, boxH)

    // 卡头：画风名 + 价格区间 + 墨线托底
    let cy = y + 24
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    fitFont(ctx, label, 360, 32, FONT_DISPLAY, '700')
    ctx.fillText(label, cardX + 24, cy + 28)
    const rangeText = min === max
      ? formatYuan(yuanToCents(min))
      : `${formatYuan(yuanToCents(min))} – ${formatYuan(yuanToCents(max))}`
    ctx.fillStyle = INK3
    ctx.font = `20px ${FONT_BODY}`
    ctx.textAlign = 'right'
    ctx.fillText(rangeText, cardX + cardW - 24, cy + 28)
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cardX + 24, cy + 40)
    ctx.lineTo(cardX + cardW - 24, cy + 40)
    ctx.stroke()
    cy += 56

    // 横幅例图（例图轮换展示，墨线框）
    if (banner) {
      drawCropped(ctx, banner, cardX + 24, cy, cardW - 48, bannerH)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.strokeRect(cardX + 24, cy, cardW - 48, bannerH)
      cy += bannerH + 16
    }

    // 尺寸清单（一行一尺寸，虚线分隔）
    group.tiers.forEach((tier, ti) => {
      const name = tier.note.trim() ? `${tier.name.trim()} · ${tier.note.trim()}` : tier.name.trim()
      const price = formatYuan(yuanToCents(tier.priceYuan))
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      ctx.font = `22px ${FONT_BODY}`
      ctx.fillText(ellipsis(ctx, name, cardW - 220, 22, FONT_BODY), cardX + 24, cy + 28)
      ctx.textAlign = 'right'
      ctx.font = `700 22px ${FONT_BODY}`
      ctx.fillText(price, cardX + cardW - 24, cy + 28)
      cy += 44
      if (ti < group.tiers.length - 1) {
        ctx.strokeStyle = LINE
        ctx.lineWidth = 1
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(cardX + 24, cy - 14)
        ctx.lineTo(cardX + cardW - 24, cy - 14)
        ctx.stroke()
        ctx.setLineDash([])
      }
    })

    y += boxH + 24
  })

  drawFooter(ctx, y, input.contact, input.t)
}

/** 绘制编排：按布局分流（例图异步加载后才落笔） */
export async function drawCard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, input: DrawCardInput) {
  const images = await loadPickImages(input.picks)
  if (input.layout === 'B') drawLayoutB(ctx, canvas, images, input)
  else drawLayoutA(ctx, canvas, images, input)
}
