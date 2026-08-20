<template>
  <div class="ir-page">
    <h2 class="od-page-title">{{ $t('imageResize.title') }}</h2>
    <p class="page-sub">{{ $t('imageResize.subtitle') }}</p>

    <div class="ir-grid">
      <!-- 左区：参数 + 来源 -->
      <section class="ir-panel">
        <h3 class="ir-panel-title">{{ $t('imageResize.presetsLabel') }}</h3>
        <el-radio-group v-model="preset" class="ir-preset-group">
          <el-radio-button value="xhs">{{ $t('imageResize.presetXhs') }}</el-radio-button>
          <el-radio-button value="weibo">{{ $t('imageResize.presetWeibo') }}</el-radio-button>
          <el-radio-button value="avatar">{{ $t('imageResize.presetAvatar') }}</el-radio-button>
          <el-radio-button value="custom">{{ $t('imageResize.presetCustom') }}</el-radio-button>
        </el-radio-group>

        <div v-if="preset === 'custom'" class="ir-custom-row">
          <el-input v-model="customW" type="number" :placeholder="$t('imageResize.widthPlaceholder')" :aria-label="$t('imageResize.widthLabel')" class="ir-dims-input" />
          <span class="ir-times">×</span>
          <el-input v-model="customH" type="number" :placeholder="$t('imageResize.heightPlaceholder')" :aria-label="$t('imageResize.heightLabel')" class="ir-dims-input" />
        </div>

        <div class="ir-slider-row">
          <span class="ir-label">{{ $t('imageResize.qualityLabel') }}</span>
          <el-slider v-model="quality" :min="0.5" :max="0.95" :step="0.01" class="ir-slider" :format-tooltip="qualityTooltip" />
          <span class="ir-quality-value">{{ qualityPercent }}%</span>
        </div>

        <!-- 拖入 / 点击选择（FileReader 本地读图，不发服务器） -->
        <div
          class="ir-dropzone"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <input ref="fileInput" type="file" accept="image/*" class="ir-file-input" @change="onFileChange" />
          <img v-if="sourceDataUrl" :src="sourceDataUrl" class="ir-source-thumb" alt="" />
          <span class="ir-dropzone-text">{{ sourceDataUrl ? fileName : $t('imageResize.chooseFile') }}</span>
        </div>

        <el-button type="primary" class="ir-process" :disabled="!sourceDataUrl" :loading="processing" @click="process">
          {{ processing ? $t('imageResize.processing') : $t('imageResize.process') }}
        </el-button>
      </section>

      <!-- 右区：结果预览 + 下载 -->
      <section class="ir-panel">
        <h3 class="ir-panel-title">{{ $t('imageResize.resultTitle') }}</h3>
        <div v-if="resultDataUrl" class="ir-result">
          <img :src="resultDataUrl" class="ir-result-img" alt="" />
          <p class="ir-result-meta">{{ $t('imageResize.resultDims', { w: resultW, h: resultH }) }}</p>
          <p class="ir-result-meta">{{ $t('imageResize.resultSize', { size: formatBytes(resultBytes) }) }}</p>
          <p class="ir-result-meta ir-result-original">{{ $t('imageResize.originalSize', { size: originalSizeText }) }}</p>
          <el-button type="primary" class="ir-download" @click="download">{{ $t('imageResize.download') }}</el-button>
        </div>
        <p v-else class="ir-empty">{{ $t('imageResize.noImage') }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { loadImage } from '../../utils/watermark'
import {
  IMAGE_PRESETS,
  targetSize,
  autoHeight,
  formatBytes,
  isValidCustomDims,
  resizeImageToBlob
} from '../../utils/image-resize'

const { t } = useI18n()

const preset = ref(IMAGE_PRESETS[0].key)
const customW = ref('')
const customH = ref('')
const quality = ref(0.85)

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const sourceDataUrl = ref('')
const originalBytes = ref(0)

const processing = ref(false)
const resultDataUrl = ref('')
const resultBytes = ref(0)
const resultW = ref(0)
const resultH = ref(0)
let resultObjectUrl: string | null = null

const qualityPercent = computed(() => Math.round(quality.value * 100))
const originalSizeText = computed(() => formatBytes(originalBytes.value))

function qualityTooltip(v: number) {
  return `${Math.round(v * 100)}%`
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (file) acceptImageFile(file)
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file) acceptImageFile(file)
}

function acceptImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ElMessage.warning(t('imageResize.fileTypeError'))
    return
  }
  fileName.value = file.name
  originalBytes.value = file.size
  const reader = new FileReader()
  reader.onload = () => {
    sourceDataUrl.value = reader.result as string
    // 换图后旧结果失效
    releaseResult()
  }
  reader.readAsDataURL(file)
}

function releaseResult() {
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl)
    resultObjectUrl = null
  }
  resultDataUrl.value = ''
  resultBytes.value = 0
  resultW.value = 0
  resultH.value = 0
}

/** canvas 缩放压缩 → WebP blob → 本地预览 + 体积估算（纯前端，不出网） */
async function process() {
  if (!sourceDataUrl.value || processing.value) return
  const target = targetSize(preset.value, customW.value, customH.value)
  if (!isValidCustomDims(target.width, target.height)) {
    ElMessage.warning(t('imageResize.invalidDims'))
    return
  }
  processing.value = true
  try {
    const img = await loadImage(sourceDataUrl.value)
    const dstH = target.height ?? autoHeight(img.naturalWidth, img.naturalHeight, target.width)
    const blob = await resizeImageToBlob(img, { width: target.width, height: dstH, quality: quality.value })
    releaseResult()
    resultObjectUrl = URL.createObjectURL(blob)
    resultDataUrl.value = resultObjectUrl
    resultBytes.value = blob.size
    resultW.value = target.width
    resultH.value = dstH ?? 0
  } catch {
    ElMessage.error(t('imageResize.processFailed'))
  } finally {
    processing.value = false
  }
}

function download() {
  if (!resultDataUrl.value) return
  const a = document.createElement('a')
  a.href = resultDataUrl.value
  a.download = `resized-${Date.now()}.webp`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

onUnmounted(releaseResult)
</script>

<style scoped>
/* 纸墨 token（--card/--line/--ink/--hq），亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 1000px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.ir-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; color: var(--ink3); font-size: 13px; }

.ir-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; align-items: start; }
@media (max-width: 900px) { .ir-grid { grid-template-columns: 1fr; } }

.ir-panel {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  padding: 20px;
  box-shadow: var(--sh-1);
}
.ir-panel-title { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: var(--ink); }

.ir-preset-group { display: flex; flex-wrap: wrap; gap: 4px; }
.ir-custom-row { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.ir-dims-input { width: 132px; flex: none; }
.ir-times { color: var(--ink3); }

.ir-slider-row { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
.ir-label { flex: none; font-size: 13px; color: var(--ink2); }
.ir-slider { flex: 1; }
.ir-quality-value { flex: none; width: 44px; text-align: right; font-size: 13px; color: var(--ink2); }

.ir-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 104px;
  margin-top: 20px;
  border: 1.5px dashed var(--line2);
  border-radius: var(--r-m);
  background: var(--paper2);
  cursor: pointer;
  /* K1（波2，灰沼教训）：背景随主题即时切换，不插值（无拖拽高亮状态，hover 只动边框） */
  transition: border-color var(--dur-fast);
}
.ir-dropzone:hover { border-color: var(--hq); }
.ir-dropzone-text { color: var(--ink3); font-size: 14px; }
.ir-source-thumb { max-width: 96px; max-height: 72px; object-fit: contain; border-radius: var(--r-s); }
.ir-file-input { display: none; }

.ir-process { width: 100%; margin-top: 20px; }

.ir-result { display: flex; flex-direction: column; align-items: center; }
.ir-result-img {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: color-mix(in srgb, var(--card) 96%, #000 4%);
}
.ir-result-meta { margin: 8px 0 0; font-size: 13px; color: var(--ink2); }
.ir-result-original { color: var(--ink3); }
.ir-download { margin-top: 16px; }
.ir-empty { color: var(--ink3); font-size: 13px; }
</style>
