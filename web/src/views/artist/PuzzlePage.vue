<template>
  <div class="puzzle-page">
    <h2 class="od-page-title">{{ $t('puzzle.title') }}</h2>
    <p class="puzzle-sub">{{ $t('puzzle.subtitle') }}</p>

    <div class="puzzle-panel">
      <!-- ① 选择订单 -->
      <div class="puzzle-field">
        <span class="puzzle-label">{{ $t('puzzle.selectOrder') }}</span>
        <el-select
          v-model="selectedOrderId"
          filterable
          :loading="ordersLoading"
          :placeholder="$t('puzzle.selectOrder')"
          class="puzzle-order-select"
          @change="onOrderChange"
        >
          <el-option v-for="o in orders" :key="o.id" :value="o.id" :label="orderLabel(o)" />
        </el-select>
      </div>

      <template v-if="order">
        <!-- ② 勾选图片（完稿图 + 参考图，2~6 张） -->
        <div class="puzzle-field">
          <span class="puzzle-label">
            {{ $t('puzzle.selectImages') }}
            <em v-if="picked.length" class="puzzle-count">{{ picked.length }}/6</em>
          </span>
          <div v-if="availableImages.length" class="puzzle-thumbs">
            <div
              v-for="img in availableImages"
              :key="img.key"
              class="puzzle-thumb"
              :class="{ picked: pickedIndex(img) >= 0 }"
              @click="togglePick(img)"
            >
              <img :src="img.url" :alt="img.name" loading="lazy" />
              <span class="puzzle-thumb-badge" :class="img.kind">{{ img.kind === 'deliverable' ? $t('puzzle.kindDeliverable') : $t('puzzle.kindReference') }}</span>
              <span v-if="pickedIndex(img) >= 0" class="puzzle-thumb-order">{{ pickedIndex(img) + 1 }}</span>
            </div>
          </div>
          <p v-else class="puzzle-empty">{{ $t('puzzle.noImages') }}</p>
        </div>

        <!-- ③ 调整顺序（上移/下移，不引拖拽库） -->
        <div v-if="picked.length >= 2" class="puzzle-field">
          <span class="puzzle-label">{{ $t('puzzle.arrange') }}</span>
          <div class="puzzle-order-list">
            <div v-for="(img, idx) in picked" :key="img.key" class="puzzle-order-item">
              <el-tag size="small" class="puzzle-order-tag">{{ idx + 1 }}</el-tag>
              <span class="puzzle-order-name">{{ img.name }}</span>
              <span class="puzzle-order-kind">{{ img.kind === 'deliverable' ? $t('puzzle.kindDeliverable') : $t('puzzle.kindReference') }}</span>
              <div class="puzzle-order-actions">
                <el-button size="small" :disabled="idx === 0" @click="move(idx, -1)">{{ $t('puzzle.up') }}</el-button>
                <el-button size="small" :disabled="idx === picked.length - 1" @click="move(idx, 1)">{{ $t('puzzle.down') }}</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- ④ 实时预览 + 导出 -->
        <div class="puzzle-field">
          <span class="puzzle-label">{{ $t('puzzle.preview') }}</span>
          <div v-if="picked.length < 2" class="puzzle-preview-hint">{{ $t('puzzle.needTwo') }}</div>
          <canvas v-show="previewReady" ref="previewCanvas" class="puzzle-canvas"></canvas>
          <el-alert v-if="exportError" type="warning" :closable="false" show-icon class="puzzle-error">
            {{ exportError }}
          </el-alert>
          <div class="puzzle-actions">
            <el-button
              type="primary"
              :loading="exporting"
              :disabled="picked.length < 2 || previewBusy"
              @click="doExport"
            >
              {{ $t('puzzle.export') }}
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../api/index.js'

const { t } = useI18n()

// ─── 订单下拉 ───
const orders = ref([])
const ordersLoading = ref(false)
const selectedOrderId = ref(null)
const order = ref(null)

function orderLabel(o) {
  const tier = o.tier_name || t('common.custom')
  const client = o.client_name || o.client_qq || '-'
  return '#' + o.order_no + ' · ' + tier + ' · ' + client
}

async function loadOrders() {
  ordersLoading.value = true
  try {
    // 05D-P1: 拉全量（原来 100 条上限 → 订单多时选不到早期订单）
    orders.value = await artistApi.getAllOrders()
  } catch (err) {
    ElMessage.error(err.message || t('puzzle.loadOrdersFailed'))
  } finally {
    ordersLoading.value = false
  }
}

async function onOrderChange(id) {
  order.value = null
  picked.value = []
  if (!id) return
  try {
    order.value = await artistApi.getOrder(id)
  } catch (err) {
    ElMessage.error(err.message || t('puzzle.loadOrderFailed'))
  }
}

// ─── 图片集合（完稿图 + 参考图统一成可选卡片） ───
const availableImages = computed(() => {
  if (!order.value) return []
  const list = []
  const d = order.value.deliverables || []
  const r = order.value.references || []
  for (const it of d) {
    if (it && it.url) list.push({ key: 'd-' + it.id, kind: 'deliverable', name: it.original_name || it.file_path || '', url: it.url })
  }
  for (const it of r) {
    if (it && it.url) list.push({ key: 'r-' + it.id, kind: 'reference', name: it.original_name || it.file_path || '', url: it.url })
  }
  return list
})

const picked = ref([])
const MAX_PICK = 6

function pickedIndex(img) {
  return picked.value.findIndex((p) => p.key === img.key)
}

function togglePick(img) {
  const idx = pickedIndex(img)
  if (idx >= 0) {
    picked.value.splice(idx, 1)
  } else if (picked.value.length < MAX_PICK) {
    picked.value.push(img)
  }
}

function move(idx, delta) {
  const target = idx + delta
  if (target < 0 || target >= picked.value.length) return
  const arr = picked.value.slice()
  const tmp = arr[idx]
  arr[idx] = arr[target]
  arr[target] = tmp
  picked.value = arr
}

// ─── canvas 拼图 ───
const previewCanvas = ref(null)
const previewReady = ref(false)
const previewBusy = ref(false)
const exporting = ref(false)
const exportError = ref('')

const TARGET_H = 400
const GAP = 8
const MAX_ROW_WIDTH = 1500

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('load failed'))
    im.src = src
  })
}

async function buildCanvas(imgs) {
  const loaded = []
  for (const img of imgs) {
    try {
      const el = await loadImage(img.url)
      const w = TARGET_H * (el.naturalWidth / el.naturalHeight)
      if (el.naturalWidth > 0 && el.naturalHeight > 0) loaded.push({ el, w })
    } catch { /* 单张加载失败跳过，不阻塞整体 */ }
  }
  if (!loaded.length) return null

  // 横向拼接，超宽换行成网格
  const rows = []
  let cur = []
  let curW = 0
  for (const item of loaded) {
    const w = item.w
    if (cur.length && curW + GAP + w > MAX_ROW_WIDTH) {
      rows.push(cur)
      cur = []
      curW = 0
    }
    cur.push(item)
    curW += (cur.length > 1 ? GAP : 0) + w
  }
  if (cur.length) rows.push(cur)

  const rowWidths = rows.map((r) => r.reduce((s, it) => s + it.w, 0) + (r.length - 1) * GAP)
  const canvasW = Math.max(...rowWidths)
  const canvasH = rows.length * TARGET_H + (rows.length - 1) * GAP

  const canvas = previewCanvas.value
  if (!canvas) return null
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasW, canvasH)
  rows.forEach((row, ri) => {
    const rowW = rowWidths[ri]
    const x0 = (canvasW - rowW) / 2
    const y = ri * (TARGET_H + GAP)
    row.forEach((it, ci) => {
      ctx.drawImage(it.el, x0 + ci * (it.w + GAP), y, it.w, TARGET_H)
    })
  })
  return canvas
}

let renderSeq = 0
async function renderPreview() {
  const seq = ++renderSeq
  previewBusy.value = true
  try {
    const canvas = await buildCanvas(picked.value)
    if (seq !== renderSeq) return
    previewReady.value = !!canvas && picked.value.length >= 2
    if (!previewReady.value && previewCanvas.value) {
      previewCanvas.value.width = 0
      previewCanvas.value.height = 0
    }
  } finally {
    if (seq === renderSeq) previewBusy.value = false
  }
}

watch(picked, () => {
  exportError.value = ''
  renderPreview()
}, { deep: true })

function downloadCanvas(canvas, filename) {
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

async function doExport() {
  if (picked.value.length < 2 || exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const canvas = await buildCanvas(picked.value)
    if (!canvas) {
      exportError.value = t('puzzle.needTwo')
      return
    }
    const no = (order.value && order.value.order_no) || 'order'
    downloadCanvas(canvas, 'puzzle-' + no + '.png')
    ElMessage.success(t('puzzle.exported'))
  } catch {
    exportError.value = t('puzzle.exportFailed')
  } finally {
    exporting.value = false
  }
}

onMounted(loadOrders)
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--card/--line），亮暗双主题自动适配 */
.puzzle-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.puzzle-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.puzzle-panel {
  margin-top: 20px;
  padding: 22px 24px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.puzzle-field { margin-top: 18px; }
.puzzle-field:first-child { margin-top: 0; }
.puzzle-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.puzzle-count { font-style: normal; font-size: 12px; color: var(--ink3, #888); margin-left: 4px; }
.puzzle-order-select { width: 100%; }

.puzzle-thumbs { display: flex; flex-wrap: wrap; gap: 12px; }
.puzzle-thumb {
  position: relative;
  width: 132px;
  height: 96px;
  border: 2px solid var(--line, #e5e5e5);
  border-radius: var(--r-s, 6px);
  overflow: hidden;
  cursor: pointer;
  background: var(--paper, #faf8f2);
  transition: border-color .15s;
}
.puzzle-thumb:hover { border-color: var(--hq, #33526e); }
.puzzle-thumb.picked { border-color: var(--hq, #33526e); box-shadow: 0 0 0 2px var(--hq-t, #e9eff4); }
.puzzle-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.puzzle-thumb-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.puzzle-thumb-order {
  position: absolute;
  right: 4px;
  top: 4px;
  min-width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 10px;
  background: var(--hq, #33526e);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.puzzle-empty { margin: 0; font-size: 13px; color: var(--ink3, #888); }

.puzzle-order-list { display: flex; flex-direction: column; gap: 8px; }
.puzzle-order-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--paper, #faf8f2);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-s, 6px);
}
.puzzle-order-tag { flex: none; }
.puzzle-order-name { flex: 1; font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.puzzle-order-kind { flex: none; font-size: 12px; color: var(--ink3, #888); }
.puzzle-order-actions { flex: none; display: flex; gap: 6px; }

.puzzle-canvas {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-s, 6px);
  background: #fff;
}
.puzzle-preview-hint { font-size: 13px; color: var(--ink3, #888); }
.puzzle-error { margin-top: 12px; }
.puzzle-actions { margin-top: 14px; }
</style>
