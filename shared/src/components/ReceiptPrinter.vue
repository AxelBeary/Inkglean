<template>
  <div class="receipt-page">
    <h2 class="od-page-title">{{ t('receipt.title') }}</h2>
    <p class="page-sub">{{ t('receipt.subtitle') }}</p>

    <div class="rc-grid">
      <!-- ═══ 编辑区 ═══ -->
      <section class="page-card rc-panel">
        <div class="group-head">{{ t('receipt.groupEdit') }}</div>

        <!-- 标题 -->
        <div class="row">
          <div class="field-text">
            <div class="lab"><label for="rc-title">{{ t('receipt.titleLabel') }}</label></div>
            <div class="desc">{{ t('receipt.titleDesc') }}</div>
          </div>
          <div class="ctrl">
            <input id="rc-title" v-model="form.title" type="text" class="field rc-input" :placeholder="t('receipt.titlePlaceholder')" maxlength="24" />
          </div>
        </div>

        <!-- 制品行 -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ t('receipt.itemsLabel') }} <em class="rc-count">{{ form.items.length }}/10</em></div>
            <div class="desc">{{ t('receipt.itemsDesc') }}</div>
          </div>
          <div class="ctrl ctrl--items">
            <div class="rc-items">
              <!-- 822 重做：一行制品 = 一枚纸签，名称独占一行，数量/单价/赠/删除收进次行，窄宽自动换行不挤压 -->
              <div v-for="(item, i) in form.items" :key="item.id" class="rc-item" :class="{ 'rc-item--gift': item.gift }">
                <input v-model="item.name" type="text" class="field rc-input rc-item-name" :placeholder="t('receipt.itemNamePlaceholder')" maxlength="20" />
                <div class="rc-item-sub">
                  <input v-model.number="item.qty" type="number" min="1" step="1" class="field rc-input rc-item-qty" :aria-label="t('receipt.qtyLabel')" />
                  <input v-model.number="item.priceYuan" type="number" min="0" step="0.01" class="field rc-input rc-item-price" :placeholder="t('receipt.pricePlaceholder')" :disabled="item.gift" />
                  <label class="rc-gift">
                    <input v-model="item.gift" type="checkbox" />
                    <span>{{ t('receipt.giftLabel') }}</span>
                  </label>
                  <button type="button" class="rc-mini-btn" :disabled="form.items.length <= 1" :aria-label="t('receipt.removeItem')" @click="removeItem(i)">{{ t('receipt.removeItem') }}</button>
                </div>
              </div>
              <button type="button" class="rc-btn rc-btn--ghost" :disabled="form.items.length >= 10" @click="addItem">{{ t('receipt.addItem') }}</button>
            </div>
          </div>
        </div>

        <!-- 折扣 + 定金 -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ t('receipt.discountLabel') }}</div>
            <div class="desc">{{ t('receipt.discountDesc') }}</div>
          </div>
          <div class="ctrl rc-money-ctrl">
            <!-- shared-824：自绘分段控件替代原单选按钮组（选中态走纸墨 token，button 原生焦点 + aria-pressed 可达） -->
            <div class="rc-seg" role="group" :aria-label="t('receipt.discountLabel')">
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.discountType === 'none' }" :aria-pressed="form.discountType === 'none'" @click="form.discountType = 'none'">{{ t('receipt.discountNone') }}</button>
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.discountType === 'percent' }" :aria-pressed="form.discountType === 'percent'" @click="form.discountType = 'percent'">{{ t('receipt.discountPercent') }}</button>
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.discountType === 'amount' }" :aria-pressed="form.discountType === 'amount'" @click="form.discountType = 'amount'">{{ t('receipt.discountAmount') }}</button>
            </div>
            <input v-if="form.discountType === 'percent'" v-model.number="form.discountValue" type="number" min="0" max="100" step="1" class="field rc-input rc-money-input" :placeholder="t('receipt.discountPercentPlaceholder')" />
            <input v-if="form.discountType === 'amount'" v-model.number="form.discountValue" type="number" min="0" step="0.01" class="field rc-input rc-money-input" :placeholder="t('receipt.discountAmountPlaceholder')" />
          </div>
        </div>

        <div class="row">
          <div class="field-text">
            <div class="lab"><label for="rc-deposit">{{ t('receipt.depositLabel') }}</label></div>
            <div class="desc">{{ t('receipt.depositDesc') }}</div>
          </div>
          <div class="ctrl">
            <input id="rc-deposit" v-model.number="form.depositYuan" type="number" min="0" step="0.01" class="field rc-input rc-money-input" :placeholder="t('receipt.depositPlaceholder')" />
          </div>
        </div>

        <!-- 文案 -->
        <div class="row">
          <div class="field-text">
            <div class="lab"><label for="rc-bottom-note">{{ t('receipt.noteLabel') }}</label></div>
            <div class="desc">{{ t('receipt.noteDesc') }}</div>
          </div>
          <div class="ctrl">
            <input id="rc-bottom-note" v-model="form.bottomNote" type="text" class="field rc-input" :placeholder="t('receipt.notePlaceholder')" maxlength="40" />
          </div>
        </div>

        <!-- 样式 -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ t('receipt.styleLabel') }}</div>
            <div class="desc">{{ t('receipt.styleDesc') }}</div>
          </div>
          <div class="ctrl">
            <div class="rc-seg" role="group" :aria-label="t('receipt.styleLabel')">
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.style === 'retro' }" :aria-pressed="form.style === 'retro'" @click="form.style = 'retro'">{{ t('receipt.styleRetro') }}</button>
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.style === 'list' }" :aria-pressed="form.style === 'list'" @click="form.style = 'list'">{{ t('receipt.styleList') }}</button>
              <button type="button" class="rc-seg-btn" :class="{ 'rc-seg-btn--on': form.style === 'hand' }" :aria-pressed="form.style === 'hand'" @click="form.style = 'hand'">{{ t('receipt.styleHand') }}</button>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <div class="rc-actions">
            <button type="button" class="btn-primary rc-btn rc-btn--primary" :disabled="exporting" @click="doExport">
              {{ exporting ? t('receipt.exporting') : t('receipt.exportPng') }}
            </button>
            <button type="button" class="rc-btn" @click="copyText">{{ t('receipt.copyText') }}</button>
          </div>
        </div>
      </section>

      <!-- ═══ 预览区 ═══ -->
      <section class="page-card rc-panel rc-preview-panel">
        <div class="group-head">{{ t('receipt.previewLabel') }}</div>
        <canvas ref="previewCanvas" class="rc-canvas"></canvas>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
/** 小票制品行草稿（id 组件内自管，往返可省） */
export interface ReceiptDraftItem { id?: string; name: string; qty: number; priceYuan: number | null; gift: boolean }

/** 小票草稿整体（宿主持久化往返的 payload） */
export interface ReceiptDraft {
  title: string
  items: ReceiptDraftItem[]
  discountType: 'none' | 'percent' | 'amount'
  discountValue: number
  depositYuan: number | null
  bottomNote: string
  style: 'retro' | 'list' | 'hand'
}
</script>

<script setup lang="ts">
// oimimo 吸纳批五：小票打印机——复古小票自己编（制品/赠品/折扣/定金/文案），导 PNG 晒单
// 对标 oimimo 小票的简化版：砍掉单品倍率/附加服务主子行/样式模板库，保留核心晒单链路；
// 纸墨口径：宣纸底 + 墨线 + 朱砂落款 + 锯齿边 + 伪条码，与全站画布工具同源（INK_PALETTE）
//
// shared-824 搬家批：整件迁入 @inkglean/shared 的哑组件化改造——
// i18n 走 props.t/props.locale 注入；草稿经 props.initialDraft 进、emit('draft-change') 出；
// 提示一律 emit('notify')；复制只产文本 emit('copy-text')（剪贴板归宿主）；
// 导出只产 Blob emit('export-png')（下载/保存归宿主）。不发请求、不碰存储、不碰剪贴板。
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { formatYuan, yuanToCents } from '../utils/money'
import { INK_PALETTE } from '../utils/ink-palette'
import { computeReceiptTotals, discountLabel, validItems } from '../receipt/totals'
import type { ReceiptDiscountType, ReceiptItemLike } from '../receipt/totals'

/** i18n 注入签名：宿主传自己的翻译函数 */
type TFn = (key: string, params?: Record<string, unknown>) => string

const props = withDefaults(defineProps<{
  t: TFn
  locale?: string
  initialDraft?: ReceiptDraft | null
}>(), {
  locale: 'zh-CN',
  initialDraft: null
})

const emit = defineEmits<{
  /** 表单任何变化即发，宿主负责持久化 */
  'draft-change': [draft: ReceiptDraft]
  /** 「复制纯文字版」：组件只产出文本，剪贴板与结果提示归宿主 */
  'copy-text': [payload: { text: string }]
  /** 替代一切原站内弹窗提示；text 为已用 props.t 组好的成品 */
  'notify': [payload: { kind: 'success' | 'warning' | 'error' | 'info', text: string }]
  /** canvas.toBlob 成功后发；下载/保存归宿主 */
  'export-png': [payload: { blob: Blob, filename: string }]
}>()

const MAX_ITEMS = 10

interface ReceiptItem extends ReceiptItemLike { id: string }

function emptyItem(): ReceiptItem {
  return { id: 'rc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: '', qty: 1, priceYuan: null, gift: false }
}

const form = reactive({
  title: '',
  items: [emptyItem(), emptyItem()] as ReceiptItem[],
  discountType: 'none' as ReceiptDiscountType,
  discountValue: 0,
  depositYuan: null as number | null,
  bottomNote: '',
  style: 'retro' as 'retro' | 'list' | 'hand'
})
const exporting = ref(false)
const previewCanvas = ref<HTMLCanvasElement | null>(null)

const totals = computed(() => computeReceiptTotals(form.items, form.discountType, form.discountValue, form.depositYuan))

// ─── 草稿往返（宿主持久化：initialDraft 进 / draft-change 出） ───
function loadDraft() {
  const d = props.initialDraft
  if (!d || typeof d !== 'object') return
  if (typeof d.title === 'string') form.title = d.title.slice(0, 24)
  if (typeof d.bottomNote === 'string') form.bottomNote = d.bottomNote.slice(0, 40)
  if (d.discountType === 'percent' || d.discountType === 'amount' || d.discountType === 'none') form.discountType = d.discountType
  if (typeof d.discountValue === 'number' && Number.isFinite(d.discountValue)) form.discountValue = d.discountValue
  if (typeof d.depositYuan === 'number' && Number.isFinite(d.depositYuan)) form.depositYuan = d.depositYuan
  if (d.style === 'retro' || d.style === 'list' || d.style === 'hand') form.style = d.style
  if (Array.isArray(d.items) && d.items.length) {
    form.items = (d.items as Array<Partial<ReceiptItem>>).slice(0, MAX_ITEMS).map((it): ReceiptItem => ({
      id: it.id || emptyItem().id,
      name: typeof it.name === 'string' ? it.name.slice(0, 20) : '',
      qty: typeof it.qty === 'number' && it.qty > 0 ? Math.min(99, Math.floor(it.qty)) : 1,
      priceYuan: typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan) ? it.priceYuan : null,
      gift: !!it.gift
    }))
  }
}

function saveDraft() {
  const payload: ReceiptDraft = {
    title: form.title,
    items: form.items.map((it): ReceiptDraftItem => ({ id: it.id, name: it.name, qty: it.qty, priceYuan: it.priceYuan, gift: it.gift })),
    discountType: form.discountType,
    discountValue: form.discountValue,
    depositYuan: form.depositYuan,
    bottomNote: form.bottomNote,
    style: form.style
  }
  emit('draft-change', payload)
}

// ─── 行管理 ───
function addItem() {
  if (form.items.length >= MAX_ITEMS) return
  form.items.push(emptyItem())
}
function removeItem(i: number) {
  if (form.items.length <= 1) return
  form.items.splice(i, 1)
}

// ─── 纯文字版（组件只产文本，剪贴板与成败提示归宿主） ───
function copyText() {
  const items = validItems(form.items)
  if (!items.length) { emit('notify', { kind: 'warning', text: props.t('receipt.itemsRequired') }); return }
  const lines = [form.title.trim() || props.t('receipt.defaultTitle'), '────────────']
  for (const it of items) {
    const price = it.gift ? props.t('receipt.giftMark') : formatYuan(yuanToCents(it.priceYuan) * it.qty)
    lines.push(`${it.name.trim()} ×${it.qty}  ${price}`)
  }
  lines.push('────────────')
  const tt = totals.value
  if (tt.discountCents > 0) lines.push(`${props.t('receipt.discountLine')} ${discountLabel(form.discountType, form.discountValue, props.locale)}  -${formatYuan(tt.discountCents)}`)
  lines.push(`${props.t('receipt.totalLine')} ${formatYuan(tt.totalCents)}`)
  if (tt.depositCents > 0) {
    lines.push(`${props.t('receipt.depositLine')} ${formatYuan(tt.depositCents)}`)
    lines.push(`${props.t('receipt.balanceLine')} ${formatYuan(tt.balanceCents)}`)
  }
  if (form.bottomNote.trim()) lines.push('', form.bottomNote.trim())
  emit('copy-text', { text: lines.join('\n') })
}

// ─── canvas 绘制（复古小票：锯齿边 / 制品行 / 金额块 / 伪条码 / 朱砂落款） ───
const CARD_W = 640
const { paper2: PAPER, ink: INK, ink2: INK2, ink3: INK3, zs: ZS } = INK_PALETTE
const FONT_DISPLAY = '"LXGW WenKai","Kaiti SC","STKaiti",serif'
const FONT_BODY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
const FONT_MONO = '"JetBrains Mono","SFMono-Regular",Consolas,monospace'

function styleFonts(style: string): { title: string; body: string } {
  if (style === 'hand') return { title: FONT_DISPLAY, body: FONT_DISPLAY }
  if (style === 'list') return { title: FONT_BODY, body: FONT_BODY }
  return { title: FONT_MONO, body: FONT_MONO } // retro
}

/** 锯齿边（小票撕纸口）：沿 y 画等腰三角带 */
function drawZigzag(ctx: CanvasRenderingContext2D, y: number, up: boolean) {
  const tooth = 16, h = 10
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.moveTo(0, y)
  for (let x = 0; x < CARD_W; x += tooth) {
    ctx.lineTo(x + tooth / 2, up ? y - h : y + h)
    ctx.lineTo(x + tooth, y)
  }
  ctx.lineTo(CARD_W, up ? y + 40 : y - 40)
  ctx.lineTo(0, up ? y + 40 : y - 40)
  ctx.closePath()
  ctx.fill()
}

/** 伪条码：按种子文本确定性生成竖条（晒单装饰，非真实编码） */
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: string) {
  let state = 7
  for (const ch of seed) state = (state * 31 + ch.charCodeAt(0)) >>> 0
  ctx.fillStyle = INK
  let cx = x
  while (cx < x + w - 3) {
    state = (state * 1103515245 + 12345) >>> 0
    const bw = (state % 4) + 1
    const gap = ((state >> 8) % 3) + 2
    ctx.fillRect(cx, y, bw, h)
    cx += bw + gap
  }
}

function ellipsisFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: number, family: string) {
  ctx.font = `${font}px ${family}`
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
  return out.length < text.length ? out + '…' : text
}

function layoutHeight(itemCount: number, hasDiscount: boolean, hasDeposit: boolean, hasNote: boolean): number {
  // 顶锯齿 20 + 头 120 + 行 44*n + 金额块（小计/折扣/应收/定金/尾款 最多 5 行×36 + 40）+ 文案 40 + 条码 90 + 落款 70 + 底锯齿 20
  return 20 + 120 + itemCount * 44 + 40 + (hasDiscount ? 36 : 0) + 36 + (hasDeposit ? 72 : 0) + (hasNote ? 44 : 0) + 90 + 70 + 20
}

function drawReceipt(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const items = validItems(form.items)
  const tt = totals.value
  const fonts = styleFonts(form.style)
  const hasNote = !!form.bottomNote.trim()
  const canvasH = layoutHeight(items.length, tt.discountCents > 0, tt.depositCents > 0, hasNote)
  canvas.width = CARD_W
  canvas.height = canvasH

  // 纸底 + 上下锯齿
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_W, canvasH)
  drawZigzag(ctx, 20, true)
  drawZigzag(ctx, canvasH - 20, false)

  const L = 56, R = CARD_W - 56
  let y = 72

  // 头：店名（文楷/等宽随样式）+ 日期行 + 虚线
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const title = form.title.trim() || props.t('receipt.defaultTitle')
  let fs = 40
  ctx.font = `700 ${fs}px ${fonts.title}`
  while (fs > 20 && ctx.measureText(title).width > R - L) {
    fs -= 2
    ctx.font = `700 ${fs}px ${fonts.title}`
  }
  ctx.fillText(title, CARD_W / 2, y + 36)
  y += 56
  ctx.fillStyle = INK3
  ctx.font = `16px ${fonts.body}`
  const today = new Date()
  ctx.fillText(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}  No.${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`, CARD_W / 2, y + 16)
  y += 44
  ctx.strokeStyle = INK2
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke()
  ctx.setLineDash([])
  y += 20

  // 制品行：名称×数量 …… 金额；赠品划线 + 「赠」
  ctx.textAlign = 'left'
  for (const it of items) {
    const name = ellipsisFit(ctx, it.name.trim(), 300, 20, fonts.body)
    ctx.fillStyle = INK
    ctx.font = `20px ${fonts.body}`
    ctx.fillText(name, L, y + 24)
    ctx.fillStyle = INK3
    ctx.font = `16px ${fonts.body}`
    ctx.fillText(`×${it.qty}`, L + ctx.measureText(name).width + 30, y + 24)
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = `700 20px ${fonts.body}`
    if (it.gift) {
      const mark = props.t('receipt.giftMark')
      ctx.fillStyle = INK3
      ctx.fillText(mark, R, y + 24)
      // 划线
      const mw = ctx.measureText(mark).width
      ctx.strokeStyle = INK3
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(R - mw, y + 17); ctx.lineTo(R, y + 17); ctx.stroke()
    } else {
      ctx.fillText(formatYuan(yuanToCents(it.priceYuan) * it.qty), R, y + 24)
    }
    ctx.textAlign = 'left'
    y += 44
  }

  // 金额块
  ctx.strokeStyle = INK2
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke()
  ctx.setLineDash([])
  y += 32

  function moneyLine(label: string, value: string, strong = false) {
    ctx.fillStyle = strong ? INK : INK2
    ctx.textAlign = 'left'
    ctx.font = `${strong ? '700 ' : ''}${strong ? 22 : 18}px ${fonts.body}`
    ctx.fillText(label, L, y)
    ctx.textAlign = 'right'
    ctx.fillText(value, R, y)
    y += strong ? 40 : 36
  }

  if (tt.discountCents > 0) {
    moneyLine(`${props.t('receipt.discountLine')} ${discountLabel(form.discountType, form.discountValue, props.locale)}`, `-${formatYuan(tt.discountCents)}`)
  }
  moneyLine(props.t('receipt.totalLine'), formatYuan(tt.totalCents), true)
  if (tt.depositCents > 0) {
    moneyLine(props.t('receipt.depositLine'), formatYuan(tt.depositCents))
    moneyLine(props.t('receipt.balanceLine'), formatYuan(tt.balanceCents), true)
  }

  // 文案
  if (hasNote) {
    ctx.fillStyle = INK3
    ctx.textAlign = 'center'
    ctx.font = `16px ${fonts.body}`
    ctx.fillText(ellipsisFit(ctx, form.bottomNote.trim(), R - L, 16, fonts.body), CARD_W / 2, y + 16)
    y += 44
  }

  // 伪条码 + 编号
  drawBarcode(ctx, L, y, R - L, 34, title + String(tt.totalCents))
  ctx.fillStyle = INK3
  ctx.textAlign = 'center'
  ctx.font = `12px ${FONT_MONO}`
  ctx.fillText(`INKGLEAN-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`, CARD_W / 2, y + 56)
  y += 76

  // 朱砂落款（小章，居中偏右，微旋）
  const sealSize = 44
  ctx.save()
  ctx.translate(R - sealSize / 2, y + sealSize / 2)
  ctx.rotate(-4 * Math.PI / 180)
  ctx.fillStyle = ZS
  ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `18px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(props.t('receipt.sealText'), 0, 2)
  ctx.restore()
}

function buildReceipt() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawReceipt(ctx, canvas)
  return canvas
}

async function doExport() {
  if (!validItems(form.items).length) { emit('notify', { kind: 'warning', text: props.t('receipt.itemsRequired') }); return }
  if (exporting.value) return
  exporting.value = true
  try {
    const canvas = buildReceipt()
    if (!canvas) throw new Error('no canvas')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
    })
    emit('export-png', { blob, filename: 'receipt.png' })
  } catch {
    emit('notify', { kind: 'error', text: props.t('receipt.exportFailed') })
  } finally {
    exporting.value = false
  }
}

// ─── 预览（150ms 防抖，卸载清理） ───
let previewTimer: ReturnType<typeof setTimeout> | null = null
function renderPreview() {
  const canvas = previewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try { drawReceipt(ctx, canvas) } catch { /* 环境不支持 canvas 2d 静默跳过 */ }
}
function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 150)
}

watch(form, schedulePreview, { deep: true })
watch(form, saveDraft, { deep: true })

onMounted(() => {
  loadDraft()
  schedulePreview()
})
onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

defineExpose({
  /** 离屏整图构建，供宿主自定义导出 */
  buildCanvas: buildReceipt
})
</script>

<style scoped>
/* 纸墨 token 体系，亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 1080px，交给宿主内容容器统一管（--page-max-w） */
.receipt-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }

.rc-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 20px; }
/* 822 重做：双列断点 960→1200（同价目卡口径）——避开「双列已开但半幅面板装不下左右两列」的挤爆区间；
   指名 page 查询容器 = 宿主内容容器，不被面板级容器截胡 */
@container page (max-width: 1199px) { .rc-grid { grid-template-columns: 1fr; } }
.rc-panel { padding: 4px 24px 16px; }
/* 822 重做：编辑面板自身成为命名容器查询上下文（panel）——行断点认面板实宽，不猜外层页宽 */
.rc-panel { container-name: panel; container-type: inline-size; }

.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before { content: ""; width: 8px; height: 8px; flex: none; background: var(--zs); border-radius: var(--r-paper); }

/* 822 重做：控件列废除 minmax(360px,…) 硬下限——硬下限会把弹性说明列挤成逐字竖排；
   说明列保底 140px 不断字，控件列吃剩余宽度、控件自身 max-width 收口 */
.row {
  display: grid; grid-template-columns: minmax(140px, 220px) minmax(0, 1fr); gap: 24px; align-items: start;
  padding: 16px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ctrl > .rc-input { width: 100%; max-width: 420px; }
.ctrl--items { width: 100%; }
.form-actions { display: flex; justify-content: flex-end; padding: 12px 0 0; }
.rc-count { margin-left: 4px; font-style: normal; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

/* 822 重做：一行制品 = 一枚纸签（宣纸底 + 淡墨细线 + 手剪圆角），签间留隙不贴死（竹简纪律）；
   名称独占一行，次行 flex-wrap 窄宽自动换行，不再用五列硬栅格 */
.rc-items { display: flex; flex-direction: column; gap: 12px; }
.rc-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-paper);
}
.rc-item-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rc-item-sub .rc-mini-btn { margin-left: auto; }
.rc-item-qty { width: 64px; }
.rc-item-price { flex: 1; min-width: 90px; max-width: 160px; }
.rc-item--gift .rc-item-price { opacity: 0.5; }
.rc-gift { display: flex; align-items: center; gap: 4px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); white-space: nowrap; }
.rc-money-ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rc-money-input { width: 120px; }

/* shared-824：自绘分段控件（替代原单选按钮组）——选中态走纸墨 token，button 原生焦点可达 */
.rc-seg {
  display: inline-flex;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  overflow: hidden;
}
.rc-seg-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), background-color var(--dur-fast);
}
.rc-seg-btn + .rc-seg-btn { border-left: 1px solid var(--line2); }
.rc-seg-btn:hover:not(.rc-seg-btn--on) { color: var(--hq); }
/* 824 anti-slop 复检拍板：纸签脉选中态（纸底 + 花青状态边 + 朱砂点印，同排期卷轴纸签口径； inset 实现零位移状态边，非装饰阴影） */
.rc-seg-btn--on {
  background: var(--paper2);
  color: var(--ink);
  font-weight: 700;
  box-shadow: inset 0 0 0 2px var(--hq);
  position: relative;
}
.rc-seg-btn--on::after {
  content: "";
  position: absolute; top: 4px; right: 4px;
  width: 6px; height: 6px;
  background: var(--zs);
  border-radius: var(--r-paper);
}
.rc-seg-btn:focus-visible { outline: 2px solid var(--zs); outline-offset: -2px; }

.rc-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.rc-btn {
  padding: 8px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-fast);
}
.rc-btn:hover:not(:disabled) { border-color: var(--hq); color: var(--hq); }
.rc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-btn--ghost { padding: 4px 12px; align-self: flex-start; }
.rc-mini-btn {
  padding: 4px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.rc-mini-btn:hover:not(:disabled) { border-color: var(--zs); color: var(--zs); }
.rc-mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rc-preview-panel { align-self: start; }
.rc-canvas { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: var(--r-m); background: var(--paper2); }

/* 822 重做：行断点认编辑面板自身宽度（指名 panel 容器）；
   面板装不下两列即上下堆叠，输入框放开限宽吃满（制品纸签内部靠 flex-wrap 自降级） */
@container panel (max-width: 540px) {
  .row { grid-template-columns: 1fr; }
  .ctrl > .rc-input { max-width: none; }
}
</style>
