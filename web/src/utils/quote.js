// 报价单生成工具（812-tools-a：①报价单生成，REQ-014 F4 Web 先行简版）
// 设计：单模板填空——纯函数负责「文字版」与「画布绘制」，视图只做输入收集与导出。
// 金额一律以内部整数分参与计算，展示走 money.js formatYuan 单一事实源。
import { formatYuan } from './money.js'

/** 条目合计（分），忽略非法输入 */
export function quoteTotalCents(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.cents) || 0), 0)
}

/** 模板占位符替换（{name}/{total}/{note}），labels 由视图按当前语言传入 */
function fill(template, map) {
  return template.replace(/\{(\w+)\}/g, (raw, key) => (key in map ? map[key] : raw))
}

/**
 * 纯文字版报价（一键复制用）
 * @param {object} opts
 * @param {string} opts.clientName 客户称呼（可空）
 * @param {Array<{name:string,cents:number}>} opts.items 条目（金额为分）
 * @param {string} opts.note 备注（可空）
 * @param {object} opts.labels { title, clientLine, totalLine, noteLine, footer }
 */
export function buildQuoteText({ clientName = '', items = [], note = '', labels }) {
  const total = quoteTotalCents(items)
  const lines = [labels.title]
  if (clientName.trim()) lines.push(fill(labels.clientLine, { name: clientName.trim() }))
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name} ${formatYuan(it.cents)}`)
  })
  lines.push(fill(labels.totalLine, { total: formatYuan(total) }))
  if (note.trim()) lines.push(fill(labels.noteLine, { note: note.trim() }))
  lines.push(`— ${labels.footer}`)
  return lines.join('\n')
}

/** 画布字体栈（canvas 不继承 CSS 字体，跨平台回退安全） */
const FONT_DISPLAY = '"LXGW WenKai", "Kaiti SC", "STKaiti", serif'
const FONT_BODY = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 固定宽度（纸墨简版报价单：单模板，不做自由布局） */
export const QUOTE_CANVAS_W = 800

/** 按条目数计算画布高度（纯函数，便于测试与后续扩展） */
export function quoteCanvasHeight(itemCount, hasNote) {
  const PAD = 48
  const title = 70
  const meta = 34
  const items = 44
  const total = 58
  const note = hasNote ? 70 : 0
  const footer = 46
  return PAD * 2 + title + meta * 2 + items * Math.max(1, itemCount) + total + note + footer
}

/** 简单换行（中文逐字 + 英文按词，maxWidth 内截断） */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of text) {
    const probe = line + ch
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = probe
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * 纸墨风报价单绘制（米白纸底 + 条目横线 + 合计 + 平台小字）
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {string} opts.title 标题（如「报价单」）
 * @param {string} opts.date 日期（ISO 短格式）
 * @param {string} opts.clientLabel 客户行前缀（含冒号，如「客户：」）
 * @param {string} opts.clientName 客户称呼
 * @param {Array<{name:string,cents:number}>} opts.items
 * @param {string} opts.totalLabel 合计行前缀（含冒号，如「合计：」）
 * @param {string} opts.noteLabel 备注行前缀（含冒号，如「备注：」）
 * @param {string} opts.note
 * @param {string} opts.footer 平台小字（如「拾绘 Inkglean 生成」）
 * @returns {HTMLCanvasElement} 同一 canvas（已按内容设置尺寸）
 */
export function renderQuoteCanvas(canvas, opts) {
  const {
    title = '',
    date = '',
    clientLabel = '',
    clientName = '',
    items = [],
    totalLabel = '',
    noteLabel = '',
    note = '',
    footer = ''
  } = opts
  const W = QUOTE_CANVAS_W
  const H = quoteCanvasHeight(items.length, Boolean(note.trim()))
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const PAD = 48
  const paper = '#FAF9F6'
  const ink = '#262520'
  const ink2 = '#5A564B'
  const ink3 = '#757062'
  const lineColor = '#E7E4D9'
  const zs = '#BC3A2B'

  // 纸底 + 内框线
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1
  ctx.strokeRect(PAD / 2, PAD / 2, W - PAD, H - PAD)

  let y = PAD + 12
  // 标题（文楷）+ 日期
  ctx.fillStyle = ink
  ctx.font = `600 30px ${FONT_DISPLAY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, PAD, y + 30)
  ctx.fillStyle = ink3
  ctx.font = `400 13px ${FONT_BODY}`
  ctx.textAlign = 'right'
  ctx.fillText(date, W - PAD, y + 22)
  ctx.strokeStyle = lineColor
  ctx.beginPath()
  ctx.moveTo(PAD, y + 52)
  ctx.lineTo(W - PAD, y + 52)
  ctx.stroke()
  y += 70

  // 客户行
  ctx.textAlign = 'left'
  ctx.fillStyle = ink2
  ctx.font = `400 14px ${FONT_BODY}`
  const clientText = clientName.trim() ? `${clientLabel}${clientName.trim()}` : ''
  if (clientText) ctx.fillText(clientText, PAD, y)
  y += 34

  // 条目行（名称左、金额右，横线分隔）
  items.forEach((it, i) => {
    ctx.fillStyle = ink
    ctx.font = `400 15px ${FONT_BODY}`
    ctx.fillText(String(i + 1).padStart(2, '0'), PAD, y)
    ctx.fillText(it.name, PAD + 44, y)
    ctx.fillStyle = ink2
    ctx.textAlign = 'right'
    ctx.fillText(formatYuan(it.cents), W - PAD, y)
    ctx.textAlign = 'left'
    ctx.strokeStyle = lineColor
    ctx.beginPath()
    ctx.setLineDash([3, 3])
    ctx.moveTo(PAD, y + 16)
    ctx.lineTo(W - PAD, y + 16)
    ctx.stroke()
    ctx.setLineDash([])
    y += 44
  })

  // 合计（朱砂强调）
  y += 6
  ctx.strokeStyle = lineColor
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += 34
  ctx.fillStyle = ink
  ctx.font = `400 14px ${FONT_BODY}`
  ctx.fillText(totalLabel, PAD, y)
  ctx.fillStyle = zs
  ctx.font = `600 24px ${FONT_BODY}`
  ctx.textAlign = 'right'
  ctx.fillText(formatYuan(quoteTotalCents(items)), W - PAD, y)
  ctx.textAlign = 'left'
  y += 58

  // 备注（最多 3 行换行）
  const noteText = note.trim()
  if (noteText) {
    ctx.fillStyle = ink3
    ctx.font = `400 13px ${FONT_BODY}`
    const prefix = noteLabel
    const bodyLines = wrapText(ctx, noteText, W - PAD * 2 - ctx.measureText(prefix).width)
    bodyLines.slice(0, 3).forEach((line, i) => {
      ctx.fillText(i === 0 ? `${prefix}${line}` : line, PAD, y + i * 20)
    })
    y += 70
  }

  // 平台小字（居中）
  ctx.fillStyle = ink3
  ctx.font = `400 12px ${FONT_BODY}`
  ctx.textAlign = 'center'
  ctx.fillText(footer, W / 2, H - PAD + 6)
  return canvas
}
