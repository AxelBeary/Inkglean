<template>
  <div class="schedule-page">
    <h2 class="od-page-title">{{ $t('schedule.title') }}</h2>
    <p class="page-sub">{{ $t('schedule.subtitle') }}</p>

    <div class="page-card schedule-panel">
      <div v-if="loading" class="schedule-loading">{{ $t('schedule.loading') }}</div>

      <!-- 加载失败错误态 + 重试（失败时不渲染空数据档期卡） -->
      <div v-else-if="loadFailed" class="module-error">
        <span>{{ $t('schedule.loadFailed') }}</span>
        <el-button size="small" @click="loadAll">{{ $t('dashboard.retry') }}</el-button>
      </div>

      <template v-else>
        <!-- 预览卡片（CSS 渲染，纸墨 token 双主题自适应） -->
        <div class="schedule-card">
          <div class="schedule-card-head">
            <span class="schedule-card-title">{{ $t('schedule.title') }}</span>
            <span class="schedule-card-date">{{ todayStr }}</span>
          </div>
          <div class="schedule-card-artist">{{ artistName }}</div>
          <span class="schedule-card-status" :class="statusKey">{{ statusText }}</span>
          <div class="schedule-card-rows">
            <div class="schedule-card-row">{{ $t('schedule.queueFormal', { n: formalCount }) }}</div>
            <div class="schedule-card-row">{{ $t('schedule.queueBuffer', { n: bufferCount }) }}</div>
          </div>
          <div class="schedule-card-divider"></div>
          <div class="schedule-card-dl-title">{{ $t('schedule.deadlineSoon') }}</div>
          <div v-if="topDeadlines.length" class="schedule-card-dl">
            <div v-for="d in topDeadlines" :key="d.id" class="schedule-card-dl-row">· #{{ d.order_no }} {{ fmtDate(d.deadline) }}</div>
          </div>
          <div v-else class="schedule-card-dl">{{ $t('schedule.noDeadline') }}</div>
          <div class="schedule-card-footer">{{ $t('schedule.brandFooter') }}</div>
        </div>

        <!-- 818-H：导出操作按行结构整理（说明在左、控件在右） -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ $t('schedule.shareLabel') }}</div>
            <div class="desc">{{ $t('schedule.shareDesc') }}</div>
          </div>
          <div class="ctrl">
            <div class="schedule-actions">
              <el-button :disabled="!previewText" @click="copyText">{{ $t('schedule.copyText') }}</el-button>
              <el-button type="primary" :loading="exporting" :disabled="!previewText" @click="downloadImage">
                {{ $t('schedule.downloadImage') }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- 生成的图片预览（与下载内容完全一致） -->
        <img v-if="cardImage" :src="cardImage" class="schedule-img" :alt="$t('schedule.title')" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../api/index.js'
import { todayStr } from '../../utils/datetime.js'
import { INK_PALETTE } from '../../utils/ink-palette.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText as copyToClipboard } from '../../utils/clipboard.js'

const { t } = useI18n()

// ─── 数据 ───
const loading = ref(true)
/** 排期数据加载失败（独立错误态，不再渲染空数据卡片） */
const loadFailed = ref(false)
const profile = ref(null)
const formalQueue = ref([])
const bufferQueue = ref([])
const deadlines = ref([])

async function loadAll() {
  loading.value = true
  loadFailed.value = false
  try {
    const [p, fq, bq, dl] = await Promise.all([
      artistApi.getProfile(),
      artistApi.getQueue(),
      artistApi.getQueue('buffer'),
      artistApi.getUpcomingDeadlines()
    ])
    profile.value = p
    formalQueue.value = Array.isArray(fq) ? fq : []
    bufferQueue.value = Array.isArray(bq) ? bq : []
    deadlines.value = Array.isArray(dl) ? dl : []
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

// ─── 派生数据 ───
const artistName = computed(() => (profile.value && profile.value.name) || '')
const formalCount = computed(() => formalQueue.value.length)
const bufferCount = computed(() => bufferQueue.value.length)
const totalCount = computed(() => formalCount.value + bufferCount.value)
const topDeadlines = computed(() => deadlines.value.slice(0, 3))

/** 档期状态：≥10 单「排期较满」/ 3-9 单「档期正常」/ <3 单「档期宽松」 */
const statusKey = computed(() => {
  if (totalCount.value >= 10) return 'busy'
  if (totalCount.value >= 3) return 'normal'
  return 'free'
})
const statusText = computed(() => t('schedule.status' + capitalize(statusKey.value)))

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(v) {
  const s = String(v || '')
  return s.slice(0, 10)
}

// ─── 排期文本（复制用） ───
const previewText = computed(() => {
  const lines = []
  lines.push(t('schedule.textHeader', { artist: artistName.value }))
  lines.push(t('schedule.statusLabel') + statusText.value)
  lines.push(t('schedule.queueFormal', { n: formalCount.value }))
  lines.push(t('schedule.queueBuffer', { n: bufferCount.value }))
  lines.push(t('schedule.deadlineSoon'))
  if (topDeadlines.value.length) {
    for (const d of topDeadlines.value) {
      lines.push('· #' + d.order_no + ' ' + fmtDate(d.deadline))
    }
  } else {
    lines.push('· ' + t('schedule.noDeadline'))
  }
  return lines.join('\n')
})

// ─── 复制文本（公共 clipboard.copyText；成功提示 / 失败提示） ───
async function copyText() {
  if (await copyToClipboard(previewText.value)) {
    ElMessage.success(t('schedule.copied'))
  } else {
    ElMessage.error(t('schedule.copyFailed'))
  }
}

// ─── 图片卡片（canvas 绘制，纸墨风格固定配色，导出图清晰可分享） ───
const exporting = ref(false)
const cardImage = ref('')

const CARD_W = 620
const CARD_PAD = 36

const STATUS_COLORS = {
  busy: { bg: INK_PALETTE.zsT, fg: INK_PALETTE.zs },
  normal: { bg: INK_PALETTE.hqT, fg: INK_PALETTE.hq },
  free: { bg: INK_PALETTE.slT, fg: INK_PALETTE.sl }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function drawCard() {
  if (!previewText.value) return ''
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = (weight, size) => weight + ' ' + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif'

  // 先按预估高度绘制第一遍测量，再定稿（两遍绘制保证高度精确）
  const W = CARD_W
  const pad = CARD_PAD
  const measure = () => {
    ctx.font = font('700', 28)
    const titleH = 40
    ctx.font = font('400', 24)
    const artistH = 40
    ctx.font = font('400', 16)
    const statusH = 40
    const rowH = 28
    ctx.font = font('400', 15)
    const dlRowH = 26
    const divider = 20
    const gap = 12
    let y = pad
    y += titleH + 8
    y += artistH + 8
    y += statusH + 4
    y += rowH * 2 + 4
    y += divider
    y += gap
    y += dlRowH
    y += (topDeadlines.value.length ? topDeadlines.value.length : 1) * dlRowH
    y += 16
    return y + pad
  }
  const H = measure()
  canvas.width = W
  canvas.height = H
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = INK_PALETTE.paper
  ctx.fillRect(0, 0, W, H)

  let y = pad

  // 标题 + 日期
  ctx.font = font('700', 28)
  ctx.fillStyle = INK_PALETTE.hq
  ctx.textBaseline = 'top'
  ctx.fillText(t('schedule.title'), pad, y)
  ctx.font = font('400', 13)
  ctx.fillStyle = INK_PALETTE.ink3
  const dateW = ctx.measureText(todayStr()).width
  ctx.fillText(todayStr(), W - pad - dateW, y + 10)
  y += 40 + 8

  // 画师名
  ctx.font = font('700', 24)
  ctx.fillStyle = INK_PALETTE.ink
  ctx.fillText(artistName.value || '-', pad, y)
  y += 40 + 8

  // 状态 pill
  const colors = STATUS_COLORS[statusKey.value] || STATUS_COLORS.normal
  ctx.font = font('400', 14)
  const statusW = ctx.measureText(statusText.value).width
  const pillW = statusW + 24
  const pillH = 28
  ctx.fillStyle = colors.bg
  roundRectPath(ctx, pad, y, pillW, pillH, 14)
  ctx.fill()
  ctx.fillStyle = colors.fg
  ctx.fillText(statusText.value, pad + 12, y + 6)
  y += pillH + 4

  // 队列概览
  ctx.font = font('400', 16)
  ctx.fillStyle = INK_PALETTE.ink2
  ctx.fillText(t('schedule.queueFormal', { n: formalCount.value }), pad, y)
  y += 28
  ctx.fillText(t('schedule.queueBuffer', { n: bufferCount.value }), pad, y)
  y += 28 + 4

  // 分隔线
  ctx.strokeStyle = INK_PALETTE.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(W - pad, y)
  ctx.stroke()
  y += 20

  // 近期截稿
  ctx.font = font('700', 15)
  ctx.fillStyle = INK_PALETTE.ink
  ctx.fillText(t('schedule.deadlineSoon'), pad, y)
  y += 26
  ctx.font = font('400', 15)
  ctx.fillStyle = INK_PALETTE.ink2
  if (topDeadlines.value.length) {
    for (const d of topDeadlines.value) {
      ctx.fillText('· #' + d.order_no + '  ' + fmtDate(d.deadline), pad, y)
      y += 26
    }
  } else {
    ctx.fillText('· ' + t('schedule.noDeadline'), pad, y)
    y += 26
  }

  // 底部落款
  y += 16
  ctx.font = font('400', 12)
  ctx.fillStyle = INK_PALETTE.ink3
  ctx.fillText(t('schedule.brandFooter'), pad, y)

  return canvas.toDataURL('image/png')
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

async function downloadImage() {
  if (exporting.value) return
  exporting.value = true
  try {
    const dataUrl = await drawCard()
    if (!dataUrl) throw new Error('empty')
    downloadDataUrl(dataUrl, 'schedule-' + todayStr().replace(/-/g, '') + '.png')
    ElMessage.success(t('schedule.exported'))
  } catch {
    ElMessage.error(t('schedule.exportFailed'))
  } finally {
    exporting.value = false
  }
}

// 数据/文案变化后自动重绘预览图
watch(previewText, async () => {
  cardImage.value = await drawCard()
}, { immediate: true })

onMounted(loadAll)
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--card/--line），亮暗双主题自动适配 */
.schedule-page { padding: 24px; max-width: 760px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; }

.schedule-panel {
  margin-top: 20px;
  padding: 22px 24px;
}
.schedule-loading { font-size: 13px; color: var(--ink3); padding: 20px 0; }
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}

/* 预览卡片（与导出图同构，双主题自适应） */
.schedule-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-m, 8px);
  padding: 24px 28px;
}
.schedule-card-head { display: flex; align-items: baseline; justify-content: space-between; }
.schedule-card-title { font-size: calc(var(--font-scale, 1) * 20px); font-weight: 700; color: var(--hq); }
.schedule-card-date { font-size: 12px; color: var(--ink3); }
.schedule-card-artist { margin-top: 14px; font-size: calc(var(--font-scale, 1) * 18px); font-weight: 700; color: var(--ink); }
.schedule-card-status {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 14px;
  font-size: 13px;
}
.schedule-card-status.busy { background: var(--zs-t); color: var(--zs); }
.schedule-card-status.normal { background: var(--hq-t); color: var(--hq); }
.schedule-card-status.free { background: var(--sl-t); color: var(--sl); }
.schedule-card-rows { margin-top: 14px; }
.schedule-card-row { font-size: 14px; color: var(--ink2); line-height: 1.9; }
.schedule-card-divider { margin: 12px 0; border-top: 1px solid var(--line); }
.schedule-card-dl-title { font-size: 14px; font-weight: 700; color: var(--ink); }
.schedule-card-dl { margin-top: 6px; }
.schedule-card-dl-row { font-size: 14px; color: var(--ink2); line-height: 1.8; }
.schedule-card-footer { margin-top: 16px; font-size: 12px; color: var(--ink3); }

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; margin-top: 16px; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.schedule-actions { display: flex; gap: 12px; }
.schedule-img {
  display: block;
  margin-top: 16px;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--r-s, 6px);
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
