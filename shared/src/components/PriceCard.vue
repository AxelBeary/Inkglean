<template>
  <div class="price-card-page">
    <h2 class="od-page-title">{{ t('priceCard.title') }}</h2>
    <p class="page-sub">{{ t('priceCard.subtitle') }}</p>

    <div class="pc-grid">
      <!-- 编辑区：标题 / 档位 / 联系方式 / 例图 -->
      <section class="page-card pc-panel">
        <!-- 818-H：编辑区按行结构整理（说明在左、控件在右） -->
        <div class="group-head">{{ t('priceCard.groupEdit') }}</div>
        <div class="row">
          <div class="field-text">
            <div class="lab"><label for="pc-title">{{ t('priceCard.titleLabel') }}</label></div>
            <div class="desc">{{ t('priceCard.titleDesc') }}</div>
          </div>
          <div class="ctrl">
            <input
              id="pc-title" v-model="form.title" type="text" class="field pc-input"
              :placeholder="t('priceCard.titlePlaceholder')" maxlength="40"
            />
          </div>
        </div>

        <div class="row">
          <div class="field-text">
            <div class="lab">
              {{ t('priceCard.tiersLabel') }}
              <em class="pc-count">{{ form.tiers.length }}/12</em>
            </div>
            <div class="desc">{{ t('priceCard.tiersDesc') }}</div>
          </div>
          <div class="ctrl ctrl--tiers">
            <div class="pc-tiers">
              <div v-for="(tier, i) in form.tiers" :key="tier.id" class="pc-tier">
                <div class="pc-tier-main">
                  <input
                    v-model="tier.name" type="text" class="field pc-input"
                    :placeholder="t('priceCard.tierNamePlaceholder')" maxlength="24"
                  />
                  <input
                    v-model.number="tier.priceYuan" type="number" min="0.01" step="0.01" class="field pc-input pc-price"
                    :placeholder="t('priceCard.tierPricePlaceholder')"
                  />
                  <button
                    type="button" class="pc-mini-btn" :disabled="form.tiers.length <= 3"
                    :aria-label="t('priceCard.removeTier')" @click="removeTier(i)"
                  >
                    {{ t('priceCard.removeTier') }}
                  </button>
                </div>
                <!-- issue 51-3（拍3-A）：0 元为非法输入——不再静默按「未填」处理，行内明示原因 -->
                <p v-if="isZeroPrice(tier)" class="pc-tier-warn">{{ t('priceCard.zeroPriceHint') }}</p>
                <input
                  v-model="tier.note" type="text" class="field pc-input pc-note"
                  :placeholder="t('priceCard.tierNotePlaceholder')" maxlength="40"
                  :aria-label="t('priceCard.tierNotePlaceholder') + ' ' + (i + 1)"
                />
                <!-- oimimo 吸纳批三：导入的真实档位带画风分组标签 -->
                <span v-if="tier.group" class="pc-tier-group">{{ tier.group }}</span>
              </div>
              <div class="pc-tier-actions">
                <button
                  type="button" class="pc-btn pc-btn--ghost"
                  :disabled="form.tiers.length >= 12" @click="addTier"
                >
                  {{ t('priceCard.addTier') }}
                </button>
                <!-- oimimo 吸纳批三：一键导入真实档位（确认弹窗/取数/转换归宿主，结果经 applyImportedTiers 回灌） -->
                <button type="button" class="pc-btn pc-btn--ghost" :disabled="importing" @click="requestImport">
                  {{ importing ? t('priceCard.importLoading') : t('priceCard.importBtn') }}
                </button>
                <span class="pc-hint">{{ t('priceCard.tierMax') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="field-text">
            <div class="lab"><label for="pc-contact">{{ t('priceCard.contactLabel') }}</label></div>
            <div class="desc">{{ t('priceCard.contactDesc') }}</div>
          </div>
          <div class="ctrl">
            <input
              id="pc-contact" v-model="form.contact" type="text" class="field pc-input"
              :placeholder="t('priceCard.contactPlaceholder')" maxlength="60"
            />
          </div>
        </div>

        <div class="row">
          <div class="field-text">
            <div class="lab">{{ t('priceCard.exampleLabel') }}</div>
            <div class="desc">{{ t('priceCard.exampleHint') }}</div>
          </div>
          <div class="ctrl">
            <div class="pc-example">
              <!-- shared-824：宿主无作品库时（pickerEnabled=false）不渲染此钮 -->
              <button v-if="pickerEnabled" type="button" class="pc-btn pc-btn--file" @click="openPicker">
                {{ t('priceCard.pickArtworks') }}
              </button>
              <label class="pc-btn pc-btn--file">
                {{ t('priceCard.chooseExample') }}
                <input type="file" accept="image/*" class="pc-file" @change="onPickExample" />
              </label>
              <span class="pc-hint">{{ picks.length }}/4</span>
            </div>
            <!-- oimimo 吸纳批三：例图多选（作品库勾选 + 本地上传，≤4 张） -->
            <div v-if="picks.length" class="pc-picks">
              <div v-for="(pick, pi) in picks" :key="pick.kind + '-' + (pick.artworkId ?? pi)" class="pc-thumb">
                <img :src="pick.src" alt="" class="pc-thumb-img" />
                <button type="button" class="pc-mini-btn" :aria-label="t('priceCard.removeExample')" @click="removePick(pi)">
                  {{ t('priceCard.removeExample') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- oimimo 吸纳批三：海报布局切换（A 菜单长条 / B 画风卡片） -->
        <div class="row">
          <div class="field-text">
            <div class="lab">{{ t('priceCard.layoutLabel') }}</div>
            <div class="desc">{{ t('priceCard.layoutDesc') }}</div>
          </div>
          <div class="ctrl">
            <!-- shared-824：自绘分段控件替代原单选按钮组（选中态走纸墨 token，button 原生焦点 + aria-pressed 可达） -->
            <div class="pc-seg" role="group" :aria-label="t('priceCard.layoutLabel')">
              <button type="button" class="pc-seg-btn" :class="{ 'pc-seg-btn--on': form.layout === 'A' }" :aria-pressed="form.layout === 'A'" @click="form.layout = 'A'">{{ t('priceCard.layoutA') }}</button>
              <button type="button" class="pc-seg-btn" :class="{ 'pc-seg-btn--on': form.layout === 'B' }" :aria-pressed="form.layout === 'B'" @click="form.layout = 'B'">{{ t('priceCard.layoutB') }}</button>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <div class="pc-actions">
            <button type="button" class="btn-primary pc-btn pc-btn--primary" :disabled="exporting" @click="doExport">
              {{ exporting ? t('priceCard.exporting') : t('priceCard.exportPng') }}
            </button>
            <button type="button" class="pc-btn" @click="copyText">
              {{ t('priceCard.copyText') }}
            </button>
          </div>
        </div>
      </section>

      <!-- 预览区：canvas 实时绘制 -->
      <section class="page-card pc-panel pc-preview-panel">
        <div class="group-head">{{ t('priceCard.previewLabel') }}</div>
        <canvas ref="previewCanvas" class="pc-canvas"></canvas>
      </section>
    </div>

    <!-- oimimo 吸纳批三：作品库例图挑选弹窗（≤4 张）；issue-51 拆分批：本体抽至
         pricecard/ArtworkPickerModal.vue（自绘遮罩 + role=dialog + 焦点陷阱/Escape/焦点归还） -->
    <ArtworkPickerModal
      v-if="pickerVisible"
      :t="t"
      :artworks="pickerList"
      :loading="artworksLoading"
      :picked-ids="pickedArtworkIds"
      @close="pickerVisible = false"
      @toggle="togglePick"
    />
  </div>
</template>

<script setup lang="ts">
// 812 工具波 B ④ 出身的价目分享卡；oimimo 吸纳批三：导入真实档位 + 作品库例图 + 双布局
//
// shared-824 搬家批：整件迁入 @inkglean/shared 的哑组件化改造——
// i18n 走 props.t 注入；草稿经 props.initialDraft 进、emit('draft-change') 出；
// 提示一律 emit('notify')；复制只产文本 emit('copy-text')；导出只产 Blob emit('export-png')；
// 作品取数经 emit('request-artworks') 请、props.artworks 回；真实档位取数经
// emit('request-import') 请、expose 的 applyImportedTiers 回灌。不发请求、不碰存储、不碰剪贴板。
//
// issue-51 拆分批（纯拆搬零行为变更，参照 useOrderForm 801→678 先例）：
// 契约类型 → pricecard/types.ts；canvas 绘制 → pricecard/draw.ts；
// 档位筛选/分组 → pricecard/tiers.ts；「挑作品」弹窗 → pricecard/ArtworkPickerModal.vue。
// props/emits/expose 契约不变，web/desktop 两端宿主壳零跟改。
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { formatYuan, yuanToCents } from '../utils/money'
import { drawCard } from './pricecard/draw'
import type { DrawCardInput } from './pricecard/draw'
import { filledTiers, tierGroups } from './pricecard/tiers'
import ArtworkPickerModal from './pricecard/ArtworkPickerModal.vue'
import type {
  TFn,
  PriceCardLayout,
  PriceCardTier,
  ExamplePick,
  PriceCardDraft,
  PriceCardArtwork,
  ImportedTier
} from './pricecard/types'

const props = withDefaults(defineProps<{
  t: TFn
  locale?: string
  initialDraft?: PriceCardDraft | null
  /** 宿主无作品库能力时置 false，「挑作品」入口不渲染 */
  pickerEnabled?: boolean
  /** 作品库条目（宿主组好 src 直载地址）；null/空 = 空态 */
  artworks?: PriceCardArtwork[] | null
  artworksLoading?: boolean
  importing?: boolean
}>(), {
  locale: 'zh-CN',
  initialDraft: null,
  pickerEnabled: true,
  artworks: null,
  artworksLoading: false,
  importing: false
})

const emit = defineEmits<{
  /** 表单任何变化即发，宿主负责持久化 */
  'draft-change': [draft: PriceCardDraft]
  /** 「复制纯文字版」：组件只产出文本，剪贴板与结果提示归宿主 */
  'copy-text': [payload: { text: string }]
  /** 替代一切原站内弹窗提示；text 为已用 props.t 组好的成品 */
  'notify': [payload: { kind: 'success' | 'warning' | 'error' | 'info', text: string }]
  /** canvas.toBlob 成功后发；下载/保存归宿主 */
  'export-png': [payload: { blob: Blob, filename: string }]
  /** 点「挑作品」即发；取数归宿主，结果经 props.artworks/artworksLoading 回 */
  'request-artworks': []
  /** 点「导入真实档位」即发；确认弹窗/取数/转换归宿主，结果经 applyImportedTiers 回灌 */
  'request-import': [payload: { hasContent: boolean }]
}>()

const MIN_TIERS = 3
// oimimo 吸纳批三：上限 6→12（导入真实档位常超 6；画布高度随行数自适应无压力）
const MAX_TIERS = 12
// oimimo 吸纳批三：例图多选上限（对标其价目表每项多例图，海报场景 4 张够用）
const MAX_PICKS = 4

function emptyTier(): PriceCardTier {
  return { id: 'tier-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: '', priceYuan: null, note: '', group: '' }
}

const form = reactive({
  title: '',
  contact: '',
  layout: 'A' as PriceCardLayout,
  tiers: [emptyTier(), emptyTier(), emptyTier()] as PriceCardTier[]
})
const picks = ref<ExamplePick[]>([])
const exporting = ref(false)
const previewCanvas = ref<HTMLCanvasElement | null>(null)

// ─── oimimo 吸纳批三：作品库例图挑选（shared-824：取数归宿主，组件只管展示与勾选） ───
const pickerVisible = ref(false)
const pickerList = computed<PriceCardArtwork[]>(() => props.artworks ?? [])
const pickedArtworkIds = computed(() =>
  new Set(picks.value.filter(p => p.kind === 'artwork').map(p => p.artworkId as number))
)

// ─── 草稿往返（宿主持久化：initialDraft 进 / draft-change 出） ───
function loadDraft() {
  const d = props.initialDraft
  if (!d || typeof d !== 'object') return
  if (typeof d.title === 'string') form.title = d.title.slice(0, 40)
  if (typeof d.contact === 'string') form.contact = d.contact.slice(0, 60)
  if (d.layout === 'A' || d.layout === 'B') form.layout = d.layout
  if (Array.isArray(d.tiers)) {
    form.tiers = (d.tiers as Array<Partial<PriceCardTier>>).slice(0, MAX_TIERS).map((td): PriceCardTier => ({
      id: td.id || emptyTier().id,
      name: typeof td.name === 'string' ? td.name.slice(0, 24) : '',
      priceYuan: typeof td.priceYuan === 'number' && Number.isFinite(td.priceYuan) ? td.priceYuan : null,
      note: typeof td.note === 'string' ? td.note.slice(0, 40) : '',
      // 老草稿无 group 字段 → 未分组（兼容）
      group: typeof td.group === 'string' ? td.group.slice(0, 24) : ''
    }))
  }
  while (form.tiers.length < MIN_TIERS) form.tiers.push(emptyTier())
  // 例图：新结构 picks 优先；老草稿的单张 exampleThumb 转成一条 local 选条目（兼容）
  if (Array.isArray(d.picks)) {
    picks.value = (d.picks as Array<Partial<ExamplePick>>)
      .filter(p => typeof p.src === 'string' && (p.kind === 'artwork' || p.kind === 'local'))
      .slice(0, MAX_PICKS)
      .map(p => ({ kind: p.kind as ExamplePick['kind'], artworkId: typeof p.artworkId === 'number' ? p.artworkId : undefined, src: p.src as string }))
  } else if (typeof d.exampleThumb === 'string' && d.exampleThumb.startsWith('data:image/')) {
    picks.value = [{ kind: 'local', src: d.exampleThumb }]
  }
}

function saveDraft() {
  const payload: PriceCardDraft = {
    title: form.title,
    contact: form.contact,
    layout: form.layout,
    tiers: form.tiers.map(td => ({ ...td })),
    picks: picks.value.map(p => ({ ...p }))
  }
  emit('draft-change', payload)
}

// ─── 例图：本地选图 → canvas 缩略 → dataURL（oimimo 吸纳批三：收编进 picks 多选） ───
function loadLocalImage(dataUrl: string) {
  const img = new Image()
  img.onload = () => {
    // 缩略宽度上限 480，等比缩放；JPEG 压缩后随草稿交宿主持久化
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
    addPick({ kind: 'local', src: c.toDataURL('image/jpeg', 0.82) })
  }
  img.src = dataUrl
}

function addPick(pick: ExamplePick) {
  if (picks.value.length >= MAX_PICKS) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.pickLimit') })
    return
  }
  picks.value.push(pick)
}

function removePick(i: number) {
  picks.value.splice(i, 1)
}

function onPickExample(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files && input.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.fileTypeError') })
    return
  }
  const reader = new FileReader()
  reader.onload = () => loadLocalImage(String(reader.result))
  reader.readAsDataURL(file)
  input.value = ''
}

// ─── oimimo 吸纳批三：作品库挑选弹窗（shared-824：组件只发请求事件 + 开弹窗） ───
function openPicker() {
  pickerVisible.value = true
  emit('request-artworks')
}

function togglePick(art: PriceCardArtwork) {
  const idx = picks.value.findIndex(p => p.kind === 'artwork' && p.artworkId === art.id)
  if (idx >= 0) {
    picks.value.splice(idx, 1)
    return
  }
  // shared-824：src 由宿主组好直载地址，组件不再拼路径
  addPick({ kind: 'artwork', artworkId: art.id, src: art.src })
}

// ─── oimimo 吸纳批三：一键导入真实档位（shared-824：确认/取数/转换归宿主，回灌走 expose） ───
function requestImport() {
  emit('request-import', { hasContent: filledTiers(form.tiers).length > 0 })
}

/**
 * 宿主取数后回灌：钳制长度/字数后落 tiers，走原截断/空集/成功提示口径。
 * 语义 = 原导入链路拿到数据之后的部分。
 */
function applyImportedTiers(tiers: ImportedTier[]) {
  if (!tiers.length) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.importEmpty') })
    return
  }
  const mapped: PriceCardTier[] = tiers.map(it => ({
    id: emptyTier().id,
    name: it.name.slice(0, 24),
    priceYuan: it.priceYuan,
    note: (it.note || '').slice(0, 40),
    group: (it.group || '').slice(0, 24)
  }))
  if (mapped.length > MAX_TIERS) {
    form.tiers = mapped.slice(0, MAX_TIERS)
    emit('notify', { kind: 'info', text: props.t('priceCard.importTruncated', { n: MAX_TIERS }) })
  } else {
    form.tiers = mapped
    emit('notify', { kind: 'success', text: props.t('priceCard.importOk', { n: mapped.length }) })
  }
}

// ─── 档位行管理（3~12 行） ───
function addTier() {
  if (form.tiers.length >= MAX_TIERS) return
  form.tiers.push(emptyTier())
}

function removeTier(i: number) {
  if (form.tiers.length <= MIN_TIERS) return
  form.tiers.splice(i, 1)
}

/** issue 51-3（拍3-A）：显式输入 0/负价 = 非法，行内明示（空输入仍按未填，不告警） */
function isZeroPrice(tier: PriceCardTier): boolean {
  const raw: unknown = tier.priceYuan
  if (raw == null || raw === '') return false
  const n = Number(raw)
  return Number.isFinite(n) && n <= 0
}

function validate() {
  if (!form.title.trim()) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.titleRequired') })
    return false
  }
  if (filledTiers(form.tiers).length < MIN_TIERS) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.tiersMinRequired') })
    return false
  }
  return true
}

// ─── 纯文字版（oimimo 吸纳批三：按画风分组输出；组件只产文本，剪贴板归宿主） ───
function copyText() {
  if (!validate()) return
  const lines = [form.title.trim(), '']
  for (const group of tierGroups(form.tiers)) {
    if (group.name) lines.push(`【${group.name}】`)
    group.tiers.forEach((tier) => {
      const price = formatYuan(yuanToCents(tier.priceYuan))
      const note = tier.note.trim()
      lines.push(note ? `${tier.name.trim()}  ${price}  ${note}` : `${tier.name.trim()}  ${price}`)
    })
    lines.push('')
  }
  if (form.contact.trim()) {
    lines.push(props.t('priceCard.contactLine', { contact: form.contact.trim() }))
  }
  lines.push('', `—— ${props.t('priceCard.signText')}`)
  emit('copy-text', { text: lines.join('\n') })
}

// ─── 画布绘制（issue-51 拆分批：绘制本体迁 pricecard/draw.ts，落笔时刻组好入参） ───
function drawInput(): DrawCardInput {
  return {
    title: form.title,
    contact: form.contact,
    layout: form.layout,
    groups: tierGroups(form.tiers),
    picks: picks.value,
    t: props.t
  }
}

async function buildCard() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await drawCard(ctx, canvas, drawInput())
  return canvas
}

async function doExport() {
  if (!validate() || exporting.value) return
  exporting.value = true
  try {
    const canvas = await buildCard()
    if (!canvas) throw new Error('no canvas')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
    })
    emit('export-png', { blob, filename: 'price-card.png' })
  } catch {
    emit('notify', { kind: 'error', text: props.t('priceCard.exportFailed') })
  } finally {
    exporting.value = false
  }
}

// ─── 预览（150ms 防抖，卸载清理；例图异步加载后重绘） ───
let previewTimer: ReturnType<typeof setTimeout> | null = null

async function renderPreview() {
  const canvas = previewCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    await drawCard(ctx, canvas, drawInput())
  } catch {
    // 环境不支持 canvas 2d 时静默跳过预览，不影响表单使用
  }
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => { void renderPreview() }, 150)
}

watch(form, schedulePreview, { deep: true })
watch(picks, schedulePreview, { deep: true })
watch(form, saveDraft, { deep: true })
watch(picks, saveDraft, { deep: true })

onMounted(() => {
  loadDraft()
  schedulePreview()
})

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

defineExpose({
  /** 离屏整图构建（例图异步加载后落笔），供宿主自定义导出 */
  buildCanvas: buildCard,
  /** 宿主取数后回灌：钳制长度/字数后落 tiers，走原截断/空集/成功提示口径 */
  applyImportedTiers
})
</script>

<style scoped>
/* 纸墨 token 体系（--paper/--ink/--hq/--card/--line），亮暗双主题自动适配 */
/* 页宽归一批：移除页级限宽 1080px，交给宿主内容容器统一管（--page-max-w） */
/* issue-51 拆分批：弹窗与 picker 网格样式随 ArtworkPickerModal.vue 迁出 */
.price-card-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 8px; }

.pc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 20px;
}
/* 822 重做：双列断点 960→1200——≥1200 时「编辑+预览」并排且每侧都宽裕；
   其下塌单列预览下移，彻底避开「双列已开但半幅面板装不下左右两列」的挤爆区间；
   指名 page 查询容器 = 宿主内容容器，不被面板级容器截胡 */
@container page (max-width: 1199px) {
  .pc-grid { grid-template-columns: 1fr; }
}

.pc-panel {
  padding: 4px 24px 16px;
}
/* 822 重做：编辑面板自身成为命名容器查询上下文（panel）——行断点认面板实宽，不猜外层页宽 */
.pc-panel { container-name: panel; container-type: inline-size; }

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
.ctrl--tiers { width: 100%; }
.ctrl > .pc-input { width: 100%; max-width: 420px; }
.form-actions { display: flex; justify-content: flex-end; padding: 12px 0 0; }
.pc-count { margin-left: 4px; font-style: normal; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.pc-hint { margin: 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

/* 822 重做：一档 = 一枚纸签（宣纸底 + 淡墨细线 + 手剪圆角），签间留隙不贴死（竹简纪律） */
.pc-tiers { display: flex; flex-direction: column; gap: 12px; }
.pc-tier {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-paper);
}
.pc-tier-main { display: grid; grid-template-columns: minmax(0, 1fr) 116px auto; gap: 8px; }
.pc-price { font-variant-numeric: tabular-nums; }
/* issue 51-3：0 元非法的行内提示（朱砂示警色，功能性平实陈述） */
.pc-tier-warn { margin: 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--zs); }
.pc-tier-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.pc-note { font-size: calc(var(--font-scale, 1) * 13px); }

.pc-example { display: flex; align-items: center; gap: 12px; }
.pc-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.pc-thumb { display: flex; align-items: center; gap: 8px; }
.pc-thumb-img { width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--line2); border-radius: var(--r-s); background: var(--paper2); }

/* oimimo 吸纳批三：导入档位分组标签 / 例图多选 */
.pc-tier-group {
  align-self: flex-start;
  padding: 4px 8px;
  border: 1px solid var(--line2);
  border-radius: var(--r-s);
  background: var(--paper2);
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px);
}
.pc-picks { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }

/* shared-824：自绘分段控件（替代原单选按钮组）——选中态走纸墨 token，button 原生焦点可达 */
.pc-seg {
  display: inline-flex;
  border: 1px solid var(--line2);
  border-radius: var(--r-m);
  background: var(--card);
  overflow: hidden;
}
.pc-seg-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: color var(--dur-fast), background-color var(--dur-fast);
}
.pc-seg-btn + .pc-seg-btn { border-left: 1px solid var(--line2); }
.pc-seg-btn:hover:not(.pc-seg-btn--on) { color: var(--hq); }
/* 824 anti-slop 复检拍板：纸签脉选中态（纸底 + 花青状态边 + 朱砂点印，同排期卷轴纸签口径； inset 实现零位移状态边，非装饰阴影） */
.pc-seg-btn--on {
  background: var(--paper2);
  color: var(--ink);
  font-weight: 700;
  box-shadow: inset 0 0 0 2px var(--hq);
  position: relative;
}
.pc-seg-btn--on::after {
  content: "";
  position: absolute; top: 4px; right: 4px;
  width: 6px; height: 6px;
  background: var(--zs);
  border-radius: var(--r-paper);
}
.pc-seg-btn:focus-visible { outline: 2px solid var(--zs); outline-offset: -2px; }

.pc-actions { display: flex; flex-wrap: wrap; gap: 8px; }
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

/* 822 重做：行断点认编辑面板自身宽度（指名 panel 容器）；
   面板装不下两列即上下堆叠，输入框放开限宽吃满 */
@container panel (max-width: 540px) {
  .row { grid-template-columns: 1fr; }
  .ctrl > .pc-input { max-width: none; }
}
</style>
