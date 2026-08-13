<template>
  <div class="price-card-page">
    <h2 class="od-page-title">{{ $t('priceCard.title') }}</h2>
    <p class="page-sub">{{ $t('priceCard.subtitle') }}</p>

    <div class="pc-grid">
      <!-- 编辑区：标题 / 档位 / 联系方式 / 例图 -->
      <section class="pc-panel">
        <div class="pc-field">
          <label class="pc-label" for="pc-title">{{ $t('priceCard.titleLabel') }}</label>
          <input
            id="pc-title" v-model="form.title" type="text" class="pc-input"
            :placeholder="$t('priceCard.titlePlaceholder')" maxlength="40"
          />
        </div>

        <div class="pc-field">
          <label class="pc-label">
            {{ $t('priceCard.tiersLabel') }}
            <em class="pc-count">{{ form.tiers.length }}/6</em>
          </label>
          <div class="pc-tiers">
            <div v-for="(tier, i) in form.tiers" :key="tier.id" class="pc-tier">
              <div class="pc-tier-main">
                <input
                  v-model="tier.name" type="text" class="pc-input"
                  :placeholder="$t('priceCard.tierNamePlaceholder')" maxlength="24"
                />
                <input
                  v-model.number="tier.priceYuan" type="number" min="0" step="0.01" class="pc-input pc-price"
                  :placeholder="$t('priceCard.tierPricePlaceholder')"
                />
                <button
                  type="button" class="pc-mini-btn" :disabled="form.tiers.length <= 3"
                  :aria-label="$t('priceCard.removeTier')" @click="removeTier(i)"
                >
                  {{ $t('priceCard.removeTier') }}
                </button>
              </div>
              <input
                v-model="tier.note" type="text" class="pc-input pc-note"
                :placeholder="$t('priceCard.tierNotePlaceholder')" maxlength="40"
                :aria-label="$t('priceCard.tierNotePlaceholder') + ' ' + (i + 1)"
              />
            </div>
            <div class="pc-tier-actions">
              <button
                type="button" class="pc-btn pc-btn--ghost"
                :disabled="form.tiers.length >= 6" @click="addTier"
              >
                {{ $t('priceCard.addTier') }}
              </button>
              <span class="pc-hint">{{ $t('priceCard.tierMax') }}</span>
            </div>
          </div>
        </div>

        <div class="pc-field">
          <label class="pc-label" for="pc-contact">{{ $t('priceCard.contactLabel') }}</label>
          <input
            id="pc-contact" v-model="form.contact" type="text" class="pc-input"
            :placeholder="$t('priceCard.contactPlaceholder')" maxlength="60"
          />
        </div>

        <div class="pc-field">
          <label class="pc-label">{{ $t('priceCard.exampleLabel') }}</label>
          <p class="pc-hint">{{ $t('priceCard.exampleHint') }}</p>
          <div class="pc-example">
            <label class="pc-btn pc-btn--file">
              {{ $t('priceCard.chooseExample') }}
              <input type="file" accept="image/*" class="pc-file" @change="onPickExample" />
            </label>
            <div v-if="exampleThumb" class="pc-thumb">
              <img :src="exampleThumb" alt="" class="pc-thumb-img" />
              <button type="button" class="pc-mini-btn" @click="removeExample">
                {{ $t('priceCard.removeExample') }}
              </button>
            </div>
          </div>
        </div>

        <div class="pc-actions">
          <button type="button" class="pc-btn pc-btn--primary" :disabled="exporting" @click="doExport">
            {{ exporting ? $t('priceCard.exporting') : $t('priceCard.exportPng') }}
          </button>
          <button type="button" class="pc-btn" @click="copyText">
            {{ $t('priceCard.copyText') }}
          </button>
        </div>
      </section>

      <!-- 预览区：canvas 实时绘制 -->
      <section class="pc-panel pc-preview-panel">
        <label class="pc-label">{{ $t('priceCard.previewLabel') }}</label>
        <canvas ref="previewCanvas" class="pc-canvas"></canvas>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { formatYuan } from '../../utils/money.js'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard.js'

const { t } = useI18n()

const STORAGE_KEY = 'huiyue_price_card_draft'
const MIN_TIERS = 3
const MAX_TIERS = 6

function emptyTier() {
  return { id: 'tier-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: '', priceYuan: null, note: '' }
}

const form = reactive({
  title: '',
  contact: '',
  tiers: [emptyTier(), emptyTier(), emptyTier()]
})
const exampleThumb = ref('')
const exampleImage = ref(null)
const exporting = ref(false)
const previewCanvas = ref(null)

// ─── 草稿持久化（localStorage，安全封装静默降级） ───
function loadDraft() {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return
  try {
    const d = JSON.parse(raw)
    if (d && typeof d === 'object') {
      if (typeof d.title === 'string') form.title = d.title.slice(0, 40)
      if (typeof d.contact === 'string') form.contact = d.contact.slice(0, 60)
      if (Array.isArray(d.tiers)) {
        form.tiers = d.tiers.slice(0, MAX_TIERS).map((t) => ({
          id: t.id || emptyTier().id,
          name: typeof t.name === 'string' ? t.name.slice(0, 24) : '',
          priceYuan: typeof t.priceYuan === 'number' && Number.isFinite(t.priceYuan) ? t.priceYuan : null,
          note: typeof t.note === 'string' ? t.note.slice(0, 40) : ''
        }))
      }
      while (form.tiers.length < MIN_TIERS) form.tiers.push(emptyTier())
      if (typeof d.exampleThumb === 'string' && d.exampleThumb.startsWith('data:image/')) {
        loadExampleImage(d.exampleThumb)
      }
    }
  } catch {
    // 损坏 JSON 丢弃，按默认草稿继续
  }
}

function saveDraft() {
  safeSetItem(STORAGE_KEY, JSON.stringify({
    title: form.title,
    contact: form.contact,
    tiers: form.tiers,
    exampleThumb: exampleThumb.value
  }))
}

// ─── 例图：本地选图 → canvas 缩略 → dataURL ───
function loadExampleImage(dataUrl) {
  const img = new Image()
  img.onload = () => {
    // 缩略宽度上限 480，等比缩放；JPEG 压缩后入 localStorage
    const maxW = 480
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, w, h)
    exampleThumb.value = c.toDataURL('image/jpeg', 0.82)
    exampleImage.value = img
  }
  img.src = dataUrl
}

function onPickExample(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning(t('priceCard.fileTypeError'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => loadExampleImage(String(reader.result))
  reader.readAsDataURL(file)
  e.target.value = ''
}

function removeExample() {
  exampleThumb.value = ''
  exampleImage.value = null
}

// ─── 档位行管理（3~6 行） ───
function addTier() {
  if (form.tiers.length >= MAX_TIERS) return
  form.tiers.push(emptyTier())
}

function removeTier(i) {
  if (form.tiers.length <= MIN_TIERS) return
  form.tiers.splice(i, 1)
}

function filledTiers() {
  return form.tiers.filter((t) => t.name.trim() && t.priceYuan != null && Number(t.priceYuan) > 0)
}

function validate() {
  if (!form.title.trim()) {
    ElMessage.warning(t('priceCard.titleRequired'))
    return false
  }
  if (filledTiers().length < MIN_TIERS) {
    ElMessage.warning(t('priceCard.tiersMinRequired'))
    return false
  }
  return true
}

// ─── 纯文字版（公共 clipboard.copyText；成功提示 / 失败提示） ───
async function copyText() {
  if (!validate()) return
  const lines = [form.title.trim(), '']
  filledTiers().forEach((tier) => {
    const price = formatYuan(Math.round(Number(tier.priceYuan) * 100))
    const note = tier.note.trim()
    lines.push(note ? `${tier.name.trim()}  ${price}  ${note}` : `${tier.name.trim()}  ${price}`)
  })
  if (form.contact.trim()) {
    lines.push('', t('priceCard.contactLine', { contact: form.contact.trim() }))
  }
  lines.push('', `—— ${t('priceCard.signText')}`)
  const text = lines.join('\n')
  if (await copyToClipboard(text)) {
    ElMessage.success(t('priceCard.copied'))
  } else {
    ElMessage.error(t('priceCard.copyFailed'))
  }
}

// ─── 竖版长图 PNG：纸墨风简版（米白底 + 墨线分栏 + 朱砂「拾绘」落款） ───
const CARD_W = 900
const PAPER = '#F5F4EF'
const INK = '#262520'
const INK2 = '#5A564B'
const INK3 = '#757062'
const LINE = '#E7E4D9'
const LINE2 = '#DAD6C8'
const ZS = '#BC3A2B'
const FONT_DISPLAY = '"LXGW WenKai","Kaiti SC","STKaiti",serif'
const FONT_BODY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'

function fitFont(ctx, text, maxWidth, maxFont, family, weight = '') {
  let font = maxFont
  ctx.font = `${weight ? weight + ' ' : ''}${font}px ${family}`
  while (font > 14 && ctx.measureText(text).width > maxWidth) {
    font -= 2
    ctx.font = `${weight ? weight + ' ' : ''}${font}px ${family}`
  }
  return font
}

function ellipsis(ctx, text, maxWidth, font, family) {
  ctx.font = `${font}px ${family}`
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
  return out.length < text.length ? out + '…' : out
}

function layoutHeight(exampleH) {
  const tierCount = filledTiers().length
  return 80 + 72 + (exampleH ? exampleH + 64 : 0) + tierCount * 92 + 64 + 88
}

function drawCard(ctx, canvas, img) {
  const tierCount = filledTiers().length
  const exampleH = img ? Math.round((560 * img.naturalHeight) / Math.max(1, img.naturalWidth)) : 0
  const canvasH = layoutHeight(exampleH)
  canvas.width = CARD_W
  canvas.height = canvasH
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_W, canvasH)

  // 双线外框（墨线）
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.strokeRect(20, 20, CARD_W - 40, canvasH - 40)
  ctx.strokeStyle = LINE2
  ctx.lineWidth = 1
  ctx.strokeRect(26, 26, CARD_W - 52, canvasH - 52)

  let y = 80

  // 标题（文楷，超长自动缩字号）
  const title = form.title.trim()
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, title, 680, 52, FONT_DISPLAY)
  ctx.fillText(title, CARD_W / 2, y + 48)
  y += 72

  // 例图（墨线边框 + 偏移复线）
  if (img && exampleH > 0) {
    const imgW = 560
    const imgX = (CARD_W - imgW) / 2
    ctx.strokeStyle = LINE
    ctx.lineWidth = 6
    ctx.strokeRect(imgX + 6, y + 6, imgW, exampleH)
    ctx.drawImage(img, imgX, y, imgW, exampleH)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.strokeRect(imgX, y, imgW, exampleH)
    y += exampleH + 64
  }

  // 档位分栏（墨线分隔）
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(88, y)
  ctx.lineTo(CARD_W - 88, y)
  ctx.stroke()
  y += 40

  filledTiers().forEach((tier, i) => {
    const name = tier.name.trim()
    const price = formatYuan(Math.round(Number(tier.priceYuan) * 100))
    const note = tier.note.trim()
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
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
    y += 92
    if (i < tierCount - 1) {
      ctx.strokeStyle = LINE2
      ctx.lineWidth = 1
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(88, y - 24)
      ctx.lineTo(CARD_W - 88, y - 24)
      ctx.stroke()
      ctx.setLineDash([])
    }
  })

  y += 24

  // 联系方式一行
  if (form.contact.trim()) {
    const contact = t('priceCard.contactLine', { contact: form.contact.trim() })
    ctx.fillStyle = INK2
    ctx.textAlign = 'center'
    ctx.fillText(ellipsis(ctx, contact, 600, 24, FONT_BODY), CARD_W / 2, y)
  }
  y += 64

  // 朱砂小印章式「拾绘」落款
  const sealSize = 56
  const sealX = CARD_W - 88 - sealSize
  ctx.save()
  ctx.translate(sealX + sealSize / 2, y + sealSize / 2)
  ctx.rotate(-4 * Math.PI / 180)
  ctx.fillStyle = ZS
  ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `22px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t('priceCard.sealText'), 0, 2)
  ctx.restore()
}

function buildCard() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawCard(ctx, canvas, exampleImage.value || null)
  return canvas
}

async function doExport() {
  if (!validate() || exporting.value) return
  exporting.value = true
  try {
    const canvas = buildCard()
    if (!canvas) throw new Error('no canvas')
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'price-card.png'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error(t('priceCard.exportFailed'))
  } finally {
    exporting.value = false
  }
}

// ─── 预览（150ms 防抖，卸载清理） ───
let previewTimer = null

function renderPreview() {
  const canvas = previewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    drawCard(ctx, canvas, exampleImage.value || null)
  } catch {
    // 环境不支持 canvas 2d 时静默跳过预览，不影响表单使用
  }
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 150)
}

watch(form, schedulePreview, { deep: true })
watch(exampleThumb, schedulePreview)
watch(form, saveDraft, { deep: true })
watch(exampleThumb, saveDraft)

onMounted(() => {
  loadDraft()
  schedulePreview()
})

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--card/--line），亮暗双主题自动适配 */
.price-card-page { padding: 24px; max-width: 1080px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }

.pc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 20px;
}
@media (max-width: 960px) {
  .pc-grid { grid-template-columns: 1fr; }
}

.pc-panel {
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--sh-1);
}
.pc-field { margin-top: 16px; }
.pc-field:first-child { margin-top: 0; }
.pc-label {
  display: block;
  margin-bottom: 8px;
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
  color: var(--ink);
}
.pc-count { margin-left: 4px; font-style: normal; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.pc-hint { margin: 0 0 8px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

.pc-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink);
  font-size: calc(var(--font-scale, 1) * 14px);
  transition: border-color var(--dur-fast);
}
.pc-input:focus { border-color: var(--hq); outline: none; }

.pc-tiers { display: flex; flex-direction: column; gap: 8px; }
.pc-tier {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line2);
}
.pc-tier-main { display: grid; grid-template-columns: minmax(0, 1fr) 116px auto; gap: 8px; }
.pc-price { font-variant-numeric: tabular-nums; }
.pc-tier-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.pc-note { font-size: calc(var(--font-scale, 1) * 13px); }

.pc-example { display: flex; align-items: center; gap: 12px; }
.pc-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.pc-thumb { display: flex; align-items: center; gap: 8px; }
.pc-thumb-img { width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--line2); border-radius: var(--r-s); background: var(--paper2); }

.pc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.pc-btn {
  padding: 8px 16px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.pc-btn:hover:not(:disabled) { border-color: var(--hq); color: var(--hq); }
.pc-btn:active:not(:disabled) { transform: scale(0.98); }
.pc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pc-btn--primary { background: var(--hq); border-color: var(--hq); color: #fff; }
.pc-btn--primary:hover:not(:disabled) { background: var(--hq-d); border-color: var(--hq-d); color: #fff; }
.pc-btn--ghost { padding: 4px 12px; }
.pc-btn--file { display: inline-block; position: relative; cursor: pointer; }
.pc-mini-btn {
  padding: 4px 12px;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
  cursor: pointer;
  transition: color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast) ease-out;
}
.pc-mini-btn:hover:not(:disabled) { border-color: var(--zs); color: var(--zs); }
.pc-mini-btn:active:not(:disabled) { transform: scale(0.98); }
.pc-mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pc-preview-panel { align-self: start; }
.pc-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: var(--paper2);
}
</style>
