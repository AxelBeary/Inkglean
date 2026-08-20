<template>
  <div class="watermark-page">
    <h2 class="od-page-title">{{ $t('watermark.title') }}</h2>

    <div class="wm-grid">
      <!-- 左区：图片来源 + 实时预览 -->
      <section class="wm-panel">
        <h3 class="wm-panel-title">{{ $t('watermark.sourceSection') }}</h3>
        <p class="wm-panel-desc">{{ $t('watermark.sourceDesc') }}</p>

        <el-radio-group v-model="sourceType" class="wm-source-tabs">
          <el-radio-button value="new">{{ $t('watermark.sourceNew') }}</el-radio-button>
          <el-radio-button value="artwork">{{ $t('watermark.sourceArtwork') }}</el-radio-button>
          <el-radio-button value="deliverable">{{ $t('watermark.sourceDeliverable') }}</el-radio-button>
        </el-radio-group>

        <!-- 新传图：拖入 / 点击选择（FileReader 本地读图，不发服务器） -->
        <div
          v-if="sourceType === 'new'"
          class="wm-dropzone"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <input ref="fileInput" type="file" accept="image/*" class="wm-file-input" @change="onFileChange" />
          <span class="wm-dropzone-text">{{ $t('watermark.chooseFile') }}</span>
        </div>

        <!-- 作品图：网格缩略图 -->
        <div v-else-if="sourceType === 'artwork'">
          <!-- 加载失败错误态 + 重试（不再与"暂无作品"混淆） -->
          <div v-if="artworksError" class="module-error">
            <span>{{ $t('watermark.loadArtworksFailed') }}</span>
            <el-button size="small" @click="loadArtworks">{{ $t('dashboard.retry') }}</el-button>
          </div>
          <div v-else v-loading="artworksLoading" class="wm-grid-list">
            <p v-if="!artworksLoading && artworks.length === 0" class="wm-empty">{{ $t('watermark.emptyArtworks') }}</p>
            <button
              v-for="art in artworks"
              :key="art.id"
              type="button"
              class="wm-thumb"
              :class="{ 'wm-thumb--active': src === artworkSrc(art) }"
              :title="art.title || ''"
              @click="pickArtwork(art)"
            >
              <img :src="artworkSrc(art)" :alt="art.title || ''" loading="lazy" />
            </button>
          </div>
        </div>

        <!-- 完稿图：订单下拉 + 完稿图缩略图 -->
        <div v-else class="wm-deliverable">
          <!-- 订单列表加载失败错误态 + 重试 -->
          <div v-if="ordersError" class="module-error">
            <span>{{ $t('watermark.loadOrdersFailed') }}</span>
            <el-button size="small" @click="loadOrders">{{ $t('dashboard.retry') }}</el-button>
          </div>
          <template v-else>
            <el-select
              v-model="selectedOrderId"
              :placeholder="$t('watermark.selectOrder')"
              :loading="ordersLoading"
              filterable
              class="wm-order-select"
              @change="onOrderChange"
            >
              <el-option v-for="o in orders" :key="o.id" :label="orderLabel(o)" :value="o.id" />
            </el-select>
            <!-- 完稿图加载失败错误态 + 重试 -->
            <div v-if="deliverablesError" class="module-error">
              <span>{{ $t('watermark.loadDeliverablesFailed') }}</span>
              <el-button size="small" @click="retryDeliverables">{{ $t('dashboard.retry') }}</el-button>
            </div>
            <div v-else v-loading="deliverablesLoading" class="wm-grid-list">
              <p v-if="!deliverablesLoading && deliverables.length === 0" class="wm-empty">{{ $t('watermark.emptyDeliverables') }}</p>
              <button
                v-for="d in deliverables"
                :key="d.id"
                type="button"
                class="wm-thumb"
                :class="{ 'wm-thumb--active': src === d.url }"
                :title="d.original_name || ''"
                @click="pickDeliverable(d)"
              >
                <img :src="d.url" :alt="d.original_name || ''" loading="lazy" />
              </button>
            </div>
          </template>
        </div>

        <!-- 实时预览（canvas 合成结果） -->
        <div class="wm-preview">
          <h4 class="wm-preview-title">{{ $t('watermark.preview') }}</h4>
          <div v-if="previewDataUrl" class="wm-preview-body">
            <img :src="previewDataUrl" alt="watermarked preview" />
          </div>
          <p v-else class="wm-empty">{{ $t('watermark.noImage') }}</p>
        </div>
      </section>

      <!-- 右区：水印参数 + 导出 -->
      <section class="wm-panel">
        <h3 class="wm-panel-title">{{ $t('watermark.watermarkSection') }}</h3>
        <p class="wm-panel-desc">{{ $t('watermark.watermarkDesc') }}</p>

        <div class="wm-field">
          <span class="wm-label">{{ $t('watermark.watermarkType') }}</span>
          <el-radio-group v-model="wmType">
            <el-radio-button value="text">{{ $t('watermark.text') }}</el-radio-button>
            <el-radio-button value="logo">{{ $t('watermark.logo') }}</el-radio-button>
          </el-radio-group>
        </div>

        <template v-if="wmType === 'text'">
          <div class="wm-field">
            <span class="wm-label">{{ $t('watermark.textInputLabel') }}</span>
            <el-input
              v-model="wmText" :maxlength="30" show-word-limit class="wm-text-input"
              :aria-label="$t('watermark.textInputLabel')"
            />
          </div>
          <div class="wm-slider-row">
            <span class="wm-label">{{ $t('watermark.fontSize') }}</span>
            <el-slider v-model="fontSize" :min="16" :max="160" :step="2" class="wm-slider" />
          </div>
        </template>

        <template v-else>
          <div class="wm-field">
            <span class="wm-label">{{ $t('watermark.logoLabel') }}</span>
            <div class="wm-logo-row">
              <el-button size="small" @click="logoInput?.click()">{{ $t('watermark.uploadLogo') }}</el-button>
              <input ref="logoInput" type="file" accept="image/png" class="wm-file-input" @change="onLogoChange" />
              <img v-if="logoDataUrl" :src="logoDataUrl" class="wm-logo-preview" :alt="$t('watermark.logoAlt')" />
            </div>
          </div>
          <div class="wm-slider-row">
            <span class="wm-label">{{ $t('watermark.logoScale') }}</span>
            <el-slider v-model="logoScale" :min="0.05" :max="0.5" :step="0.01" class="wm-slider" />
          </div>
        </template>

        <div class="wm-slider-row">
          <span class="wm-label">{{ $t('watermark.opacity') }}</span>
          <el-slider v-model="opacity" :min="0.05" :max="1" :step="0.05" class="wm-slider" />
        </div>

        <div class="wm-field">
          <span class="wm-label">{{ $t('watermark.modeLabel') }}</span>
          <el-radio-group v-model="mode">
            <el-radio-button value="corner">{{ $t('watermark.modeCorner') }}</el-radio-button>
            <el-radio-button value="stretch">{{ $t('watermark.modeStretch') }}</el-radio-button>
            <el-radio-button value="tile">{{ $t('watermark.modeTile') }}</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 四角模式：位置 + 边距 -->
        <template v-if="mode === 'corner'">
          <div class="wm-field">
            <span class="wm-label">{{ $t('watermark.position') }}</span>
            <el-radio-group v-model="position" class="wm-pos-group">
              <el-radio-button value="corners">{{ $t('watermark.positionAll') }}</el-radio-button>
              <el-radio-button v-for="p in WM_POSITIONS" :key="p" :value="p">{{ positionLabel(p) }}</el-radio-button>
            </el-radio-group>
          </div>
          <div class="wm-slider-row">
            <span class="wm-label">{{ $t('watermark.margin') }}</span>
            <el-slider v-model="margin" :min="0" :max="200" :step="4" class="wm-slider" />
          </div>
        </template>

        <!-- 平铺模式：间距 -->
        <div v-if="mode === 'tile'" class="wm-slider-row">
          <span class="wm-label">{{ $t('watermark.spacing') }}</span>
          <el-slider v-model="spacing" :min="20" :max="400" :step="10" class="wm-slider" />
        </div>

        <el-button type="primary" class="wm-export" :disabled="!src" :loading="exporting" @click="exportImage">
          {{ exporting ? $t('watermark.exporting') : $t('watermark.export') }}
        </el-button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { ArtworkWithTags, ArtistOrderItem } from '../../api/types'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
import { artistApi } from '../../api/index'
import { WM_POSITIONS, WM_POSITION_CORNERS, loadImage, composeWatermarked } from '../../utils/watermark'
import { safeGetItem, safeSetItem } from '../../utils/storage'

const { t } = useI18n()
const store = useArtistStore()

// ─── 图片来源 ───
const sourceType = ref('new') // new | artwork | deliverable
const src = ref('')
const artworks = ref<ArtworkWithTags[]>([])
const artworksLoading = ref(false)
/** 作品列表加载失败（独立错误态 + 重试，不再静默） */
const artworksError = ref(false)
const orders = ref<ArtistOrderItem[]>([])
const ordersLoading = ref(false)
/** 订单列表加载失败（独立错误态 + 重试，不再静默） */
const ordersError = ref(false)
/** 完稿图行（运行时附带 url，类型库未声明，局部收窄） */
interface DeliverableRow {
  id: number
  url: string
  original_name?: string | null
}
const deliverables = ref<DeliverableRow[]>([])
const deliverablesLoading = ref(false)
/** 完稿图加载失败（独立错误态 + 重试，不再静默） */
const deliverablesError = ref(false)
const selectedOrderId = ref<number | null>(null)

// ─── 水印素材 ───
const wmType = ref('text') // text | logo
const wmText = ref('')
const logoDataUrl = ref('')
const fontSize = ref(48)
const logoScale = ref(0.2)

// ─── 水印模式与参数 ───
const mode = ref('corner') // corner | stretch | tile
const position = ref(WM_POSITION_CORNERS)
const opacity = ref(0.25)
const margin = ref(24)
const spacing = ref(160)

const previewDataUrl = ref('')
const exporting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const logoInput = ref<HTMLInputElement | null>(null)
// 围剿 a1-8/9: 完稿图切换与预览合成共用的请求/合成序号（卸载递增使在途响应作废）
let deliverablesSeq = 0
let previewSeq = 0

// LOGO 画师级持久化：key = huiyue_wm_logo_<artistId>（下次进入自动加载）
const LOGO_KEY_PREFIX = 'huiyue_wm_logo_'
const logoKey = computed(() => (store.profile?.id ? `${LOGO_KEY_PREFIX}${store.profile.id}` : null))

const POSITION_KEYS = {
  'top-left': 'watermark.posTopLeft',
  'top-right': 'watermark.posTopRight',
  'bottom-left': 'watermark.posBottomLeft',
  'bottom-right': 'watermark.posBottomRight',
  center: 'watermark.posCenter'
}
function positionLabel(p: string) {
  return t(POSITION_KEYS[p as keyof typeof POSITION_KEYS] || p)
}

// ─── 初始化 ───
onMounted(async () => {
  // 画师展示名做默认文字水印（后台已登录，profile 通常已由路由/布局加载）
  if (!store.profile) {
    try {
      await store.fetchProfile()
    } catch {
      // fetchProfile 失败会自动登出，此处无需处理
    }
  }
  wmText.value = store.artistName
  loadLogo()
  // 按 sourceType 按需加载（默认"新传图"不发全量作品/订单请求）
  syncSourceData()
})

/** sourceType 切换 → 按需加载对应数据（进入作品/完稿页签才发对应请求） */
watch(sourceType, (val) => {
  if (val === 'artwork') loadArtworks()
  else if (val === 'deliverable') loadOrders()
})

function syncSourceData() {
  if (sourceType.value === 'artwork') loadArtworks()
  else if (sourceType.value === 'deliverable') loadOrders()
}

function loadLogo() {
  const key = logoKey.value
  if (!key) return
  // G-5: 裸读写换 safe 封装（存储禁用时静默，不阻塞页面）
  const saved = safeGetItem(key)
  if (saved) logoDataUrl.value = saved
}

// ─── 新传图（FileReader 本地读图，不发服务器） ───
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
    ElMessage.warning(t('watermark.fileTypeError'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    src.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

// ─── 作品图 ───
async function loadArtworks() {
  artworksLoading.value = true
  artworksError.value = false
  try {
    const res = await artistApi.getArtworks()
    artworks.value = Array.isArray(res) ? res : ((res as unknown as { items?: ArtworkWithTags[] })?.items || [])
  } catch {
    artworksError.value = true
    artworks.value = []
  } finally {
    artworksLoading.value = false
  }
}

function artworkSrc(art: ArtworkWithTags) {
  return `/uploads/${art.image_path}`
}

function pickArtwork(art: ArtworkWithTags) {
  src.value = artworkSrc(art)
}

// ─── 完稿图 ───
async function loadOrders() {
  ordersLoading.value = true
  ordersError.value = false
  try {
    // 05D-W1: 拉全量（原来 100 条上限 → 订单多时选不到早期完稿图）
    const all = await artistApi.getAllOrders()
    orders.value = all ?? []
  } catch {
    ordersError.value = true
    orders.value = []
  } finally {
    ordersLoading.value = false
  }
}

function orderLabel(o: ArtistOrderItem) {
  const client = o.client_name || o.client_qq || ''
  return `${o.order_no}${client ? ` · ${client}` : ''}`
}

async function onOrderChange(orderId: number | null) {
  // 围剿 a1-8: 订单下拉切换取号——慢响应不得覆盖新选中的订单完稿图
  const mySeq = ++deliverablesSeq
  if (!orderId) {
    deliverables.value = []
    src.value = ''
    return
  }
  deliverablesLoading.value = true
  deliverablesError.value = false
  deliverables.value = []
  src.value = ''
  try {
    const detail = await artistApi.getOrder(orderId)
    if (mySeq !== deliverablesSeq) return
    deliverables.value = (detail?.deliverables || []) as unknown as DeliverableRow[]
  } catch {
    if (mySeq !== deliverablesSeq) return
    deliverablesError.value = true
    deliverables.value = []
  } finally {
    if (mySeq === deliverablesSeq) deliverablesLoading.value = false
  }
}

/** 完稿图加载失败重试（沿用当前选中的订单） */
function retryDeliverables() {
  if (selectedOrderId.value) onOrderChange(selectedOrderId.value)
}

function pickDeliverable(d: DeliverableRow) {
  src.value = d.url
}

// ─── LOGO 上传与持久化 ───
function onLogoChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // 派工单：透明底 PNG；做类型白名单校验（拒绝 GIF 等动画格式）
  if (file.type !== 'image/png') {
    ElMessage.warning(t('watermark.fileTypeError'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    logoDataUrl.value = reader.result as string
    saveLogo(reader.result as string)
    ElMessage.success(t('watermark.logoSaved'))
  }
  reader.readAsDataURL(file)
}

function saveLogo(dataUrl: string) {
  const key = logoKey.value
  if (!key) return
  safeSetItem(key, dataUrl)
}

// ─── 合成参数 → 实时预览（防抖 300ms） ───
function currentOptions(logo: HTMLImageElement | null) {
  return {
    mode: mode.value as 'corner' | 'stretch' | 'tile',
    position: position.value,
    opacity: opacity.value,
    fontSize: fontSize.value,
    spacing: spacing.value,
    margin: margin.value,
    text: wmText.value.trim() || store.artistName,
    logo: logo || null,
    logoScale: logoScale.value
  }
}

/** b1: 加载 logo 位图（renderPreview/exportImage 共用；非 logo 模式或未设图返回 null） */
async function loadLogoForRender() {
  if (wmType.value !== 'logo') return null
  if (!logoDataUrl.value) return null
  return loadImage(logoDataUrl.value)
}

async function renderPreview() {
  // 围剿 a1-9: 预览合成取号——慢合成不得覆盖新预览
  const mySeq = ++previewSeq
  if (!src.value) return
  try {
    const logo = wmType.value === 'logo' ? await loadLogoForRender() : null
    if (wmType.value === 'logo' && !logo) {
      // A8: logo 模式未选 logo 时明示，不静默产出无 logo 结果
      ElMessage.warning(t('watermark.logoRequired'))
      return
    }
    const dataUrl = await composeWatermarked(src.value, currentOptions(logo))
    if (mySeq !== previewSeq) return
    previewDataUrl.value = dataUrl
  } catch {
    if (mySeq !== previewSeq) return
    // 合成失败（如画布被污染/图片加载失败）：清空预览并提示，不静默
    previewDataUrl.value = ''
    ElMessage.error(t('watermark.renderError'))
  }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [src, wmType, wmText, fontSize, logoScale, opacity, mode, position, margin, spacing, logoDataUrl],
  () => {
    clearTimeout(previewTimer ?? undefined)
    previewTimer = setTimeout(renderPreview, 300)
  }
)

onUnmounted(() => {
  clearTimeout(previewTimer ?? undefined)
  deliverablesSeq++
  previewSeq++
})

// ─── 导出（逐张下载 PNG，不打包） ───
async function exportImage() {
  if (!src.value || exporting.value) return
  exporting.value = true
  try {
    const logo = wmType.value === 'logo' ? await loadLogoForRender() : null
    if (wmType.value === 'logo' && !logo) {
      // A8: logo 模式未选 logo 时明示，不静默导出
      ElMessage.warning(t('watermark.logoRequired'))
      return
    }
    const dataUrl = await composeWatermarked(src.value, currentOptions(logo))
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `watermarked-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    ElMessage.error(t('watermark.renderError'))
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
/* 纸墨 token（--card/--line/--ink/--hq），双主题亮暗自适应 */
/* 页宽归一批：移除页级限宽 1100px，交给 ArtistLayout 内容容器统一管（--page-max-w） */
.watermark-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; margin-bottom: 4px; }

.wm-grid { display: grid; grid-template-columns: 1fr 360px; gap: 20px; margin-top: 20px; align-items: start; }
@media (max-width: 900px) { .wm-grid { grid-template-columns: 1fr; } }

.wm-panel {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  padding: 20px;
  box-shadow: var(--sh-1);
}

/* 818-B 三原则：面板组头带朱砂小印点 + 参数行一行一事（说明在左，控件在右） */
.wm-panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 700; color: var(--ink); margin: 0 0 4px;
}
.wm-panel-title::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.wm-panel-desc { margin: 0 0 16px; font-size: 12px; color: var(--ink3); }

.wm-source-tabs { margin-bottom: 16px; }
.wm-field, .wm-slider-row {
  display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: center;
  margin-bottom: 16px;
}
.wm-label { margin: 0; font-size: 13px; color: var(--ink2); }
.wm-text-input { margin-bottom: 0; }
.wm-slider { margin-left: 0; }

.wm-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  border: 1.5px dashed var(--line2);
  border-radius: var(--r-m);
  background: color-mix(in srgb, var(--card) 92%, transparent);
  cursor: pointer;
  /* K1（波2，灰沼教训）：背景随主题即时切换，不插值（无拖拽高亮状态，hover 只动边框） */
  transition: border-color var(--dur-fast);
}
.wm-dropzone:hover { border-color: var(--hq, var(--el-color-primary)); }
.wm-dropzone-text { color: var(--ink3); font-size: 14px; }
.wm-file-input { display: none; }

.wm-grid-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
@media (max-width: 600px) { .wm-grid-list { grid-template-columns: repeat(3, 1fr); } }
.wm-thumb {
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--r-s);
  overflow: hidden;
  background: none;
  cursor: pointer;
  line-height: 0;
  transition: border-color var(--dur-fast);
}
.wm-thumb:hover { border-color: var(--hq, var(--el-color-primary)); }
.wm-thumb--active { border-color: var(--hq, var(--el-color-primary)); }
.wm-thumb img { width: 100%; height: 72px; object-fit: cover; display: block; }

.wm-order-select { width: 100%; margin-bottom: 4px; }
.wm-empty { color: var(--ink3); font-size: 13px; margin: 8px 0; }

/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 16px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}

.wm-preview { margin-top: 16px; }
.wm-preview-title { font-size: 13px; color: var(--ink2); margin: 0 0 8px; }
.wm-preview-body {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  background: color-mix(in srgb, var(--card) 96%, #000 4%);
}
.wm-preview-body img { display: block; max-width: 100%; }

.wm-logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 0; }
.wm-logo-preview { width: 40px; height: 40px; object-fit: contain; border: 1px solid var(--line); border-radius: var(--r-s); }

.wm-pos-group { display: flex; flex-wrap: wrap; gap: 4px; }

.wm-export { width: 100%; margin-top: 8px; }
</style>
