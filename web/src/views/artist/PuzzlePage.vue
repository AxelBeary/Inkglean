<template>
  <div class="puzzle-page">
    <h2 class="od-page-title">{{ $t('puzzle.title') }}</h2>
    <p class="page-sub">{{ $t('puzzle.subtitle') }}</p>

    <div class="page-card puzzle-panel">
      <!-- 818-H：步骤控制按行结构整理（说明在左、控件在右） -->
      <div class="group-head">{{ $t('puzzle.groupSteps') }}</div>
      <!-- ① 选择订单 -->
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('puzzle.selectOrder') }}</div>
          <div class="desc">{{ $t('puzzle.orderDesc') }}</div>
        </div>
        <div class="ctrl">
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
      </div>

      <template v-if="order">
        <!-- ② 勾选图片（完稿图 + 参考图，2~6 张） -->
        <div class="row">
          <div class="field-text">
            <div class="lab">
              {{ $t('puzzle.selectImages') }}
              <em v-if="picked.length" class="puzzle-count">{{ picked.length }}/6</em>
            </div>
            <div class="desc">{{ $t('puzzle.imagesDesc') }}</div>
          </div>
          <div class="ctrl ctrl--thumbs">
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
        </div>

        <!-- ③ 调整顺序（上移/下移，不引拖拽库） -->
        <div v-if="picked.length >= 2" class="row">
          <div class="field-text">
            <div class="lab">{{ $t('puzzle.arrange') }}</div>
            <div class="desc">{{ $t('puzzle.arrangeDesc') }}</div>
          </div>
          <div class="ctrl">
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
        </div>

        <!-- ④ 实时预览 + 导出 -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ $t('puzzle.preview') }}</div>
            <div class="desc">{{ $t('puzzle.previewDesc') }}</div>
          </div>
          <div class="ctrl">
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
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ArtistOrderItem, EnrichedOrderDetail } from '../../api/types'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../api/index'
import { INK_PALETTE } from '../../utils/ink-palette'

const { t } = useI18n()

// ─── 订单下拉 ───
const orders = ref<ArtistOrderItem[]>([])
const ordersLoading = ref(false)
const selectedOrderId = ref<number | null>(null)
const order = ref<EnrichedOrderDetail | null>(null)

function orderLabel(o: ArtistOrderItem) {
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
    ElMessage.error((err instanceof Error ? err.message : '') || t('puzzle.loadOrdersFailed'))
  } finally {
    ordersLoading.value = false
  }
}

// 围剿 a1-15: 订单切换请求序号——慢的旧订单响应不得覆盖新选中订单
let orderSeq = 0
async function onOrderChange(id: number | null) {
  const mySeq = ++orderSeq
  order.value = null
  picked.value = []
  if (!id) return
  try {
    const data = await artistApi.getOrder(id)
    if (mySeq !== orderSeq) return
    order.value = data
  } catch (err) {
    if (mySeq !== orderSeq) return
    ElMessage.error((err instanceof Error ? err.message : '') || t('puzzle.loadOrderFailed'))
  }
}

// ─── 图片集合（完稿图 + 参考图统一成可选卡片） ───
/** 可选图片卡片（完稿/参考统一结构；url 运行时附带） */
interface PickImage {
  key: string
  kind: 'deliverable' | 'reference'
  name: string
  url: string
}

/** 详情行运行时附带 url（类型库未声明），局部收窄断言 */
type DetailImageRow = { id?: number; url?: string; original_name?: string | null; file_path?: string }

const availableImages = computed((): PickImage[] => {
  if (!order.value) return []
  const list: PickImage[] = []
  const d = (order.value.deliverables || []) as DetailImageRow[]
  const r = (order.value.references || []) as DetailImageRow[]
  for (const it of d) {
    if (it && it.url) list.push({ key: 'd-' + it.id, kind: 'deliverable', name: it.original_name || it.file_path || '', url: it.url })
  }
  for (const it of r) {
    if (it && it.url) list.push({ key: 'r-' + it.id, kind: 'reference', name: it.original_name || it.file_path || '', url: it.url })
  }
  return list
})

const picked = ref<PickImage[]>([])
const MAX_PICK = 6

function pickedIndex(img: PickImage) {
  return picked.value.findIndex((p) => p.key === img.key)
}

function togglePick(img: PickImage) {
  const idx = pickedIndex(img)
  if (idx >= 0) {
    picked.value.splice(idx, 1)
  } else if (picked.value.length < MAX_PICK) {
    picked.value.push(img)
  }
}

function move(idx: number, delta: number) {
  const target = idx + delta
  if (target < 0 || target >= picked.value.length) return
  const arr = picked.value.slice()
  const tmp = arr[idx]
  arr[idx] = arr[target]
  arr[target] = tmp
  picked.value = arr
}

// ─── canvas 拼图 ───
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewReady = ref(false)
const previewBusy = ref(false)
const exporting = ref(false)
const exportError = ref('')

const TARGET_H = 400
const GAP = 8
const MAX_ROW_WIDTH = 1500

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('load failed'))
    im.src = src
  })
}

/** canvas 拼接加载行 */
interface LoadedSlice {
  el: HTMLImageElement
  w: number
}

async function buildCanvas(imgs: PickImage[]) {
  const loaded: LoadedSlice[] = []
  for (const img of imgs) {
    try {
      const el = await loadImage(img.url)
      const w = TARGET_H * (el.naturalWidth / el.naturalHeight)
      if (el.naturalWidth > 0 && el.naturalHeight > 0) loaded.push({ el, w })
    } catch { /* 单张加载失败跳过，不阻塞整体 */ }
  }
  if (!loaded.length) return null

  // 横向拼接，超宽换行成网格
  const rows: LoadedSlice[][] = []
  let cur: LoadedSlice[] = []
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
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = INK_PALETTE.white
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

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
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
/* 页宽归一批：移除页级限宽 860px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.puzzle-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; }

.puzzle-panel {
  margin-top: 20px;
  padding: 4px 24px 16px;
}

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 520px); gap: 16px; align-items: start;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ctrl--thumbs { width: 100%; }
.puzzle-order-select { width: 100%; }
.puzzle-actions { margin-top: 16px; }

/* 页宽容器查询收尾批：@media 改 @container 认容器宽（.row 为页内双列字段行，非视口语义） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
.puzzle-count { font-style: normal; font-size: 12px; color: var(--ink3); margin-left: 4px; }

.puzzle-thumbs { display: flex; flex-wrap: wrap; gap: 12px; }
.puzzle-thumb {
  position: relative;
  width: 132px;
  height: 96px;
  border: 2px solid var(--line);
  border-radius: var(--r-s, 6px);
  overflow: hidden;
  cursor: pointer;
  background: var(--paper);
  transition: border-color var(--dur-fast);
}
.puzzle-thumb:hover { border-color: var(--hq); }
.puzzle-thumb.picked { border-color: var(--hq); box-shadow: 0 0 0 2px var(--hq-t); }
.puzzle-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.puzzle-thumb-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: var(--r-s);
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
  border-radius: var(--r-pill);
  background: var(--hq);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.puzzle-empty { margin: 0; font-size: 13px; color: var(--ink3); }

.puzzle-order-list { display: flex; flex-direction: column; gap: 8px; }
.puzzle-order-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-s, 6px);
}
.puzzle-order-tag { flex: none; }
.puzzle-order-name { flex: 1; font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.puzzle-order-kind { flex: none; font-size: 12px; color: var(--ink3); }
.puzzle-order-actions { flex: none; display: flex; gap: 8px; }

.puzzle-canvas {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-s, 6px);
  background: #fff;
}
.puzzle-preview-hint { font-size: 13px; color: var(--ink3); }
.puzzle-error { margin-top: 12px; }
</style>
