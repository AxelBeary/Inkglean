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
                    v-model.number="tier.priceYuan" type="number" min="0" step="0.01" class="field pc-input pc-price"
                    :placeholder="t('priceCard.tierPricePlaceholder')"
                  />
                  <button
                    type="button" class="pc-mini-btn" :disabled="form.tiers.length <= 3"
                    :aria-label="t('priceCard.removeTier')" @click="removeTier(i)"
                  >
                    {{ t('priceCard.removeTier') }}
                  </button>
                </div>
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

    <!-- oimimo 吸纳批三：作品库例图挑选弹窗（≤4 张）；shared-824：自绘遮罩弹窗替代原对话框 -->
    <div v-if="pickerVisible" class="pc-modal-mask" @click.self="pickerVisible = false">
      <div class="pc-modal" role="dialog" :aria-label="t('priceCard.pickTitle')">
        <div class="pc-modal-head">{{ t('priceCard.pickTitle') }}</div>
        <div class="pc-picker-grid">
          <p v-if="artworksLoading" class="pc-picker-loading">{{ t('priceCard.importLoading') }}</p>
          <p v-else-if="!artworks || artworks.length === 0" class="pc-picker-empty">{{ t('priceCard.pickEmpty') }}</p>
          <button
            v-for="art in pickerList" :key="art.id" type="button"
            class="pc-picker-item" :class="{ 'pc-picker-item--on': pickedArtworkIds.has(art.id) }"
            :aria-label="art.title || String(art.id)"
            @click="togglePick(art)"
          >
            <img :src="art.src" alt="" class="pc-picker-img" />
            <span v-if="art.title" class="pc-picker-name">{{ art.title }}</span>
          </button>
        </div>
        <div class="pc-modal-foot">
          <button type="button" class="pc-btn" @click="pickerVisible = false">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
/** 档位（id 组件内自管；priceYuan 单位元，可为空；group = 画风分组，空 = 未分组） */
export interface PriceCardTier { id: string; name: string; priceYuan: number | null; note: string; group: string }

/** 例图选条目：作品库勾选或本地上传（dataURL） */
export interface ExamplePick { kind: 'artwork' | 'local'; artworkId?: number; src: string }

/** 约稿条草稿整体（宿主持久化往返的 payload；exampleThumb 为老草稿兼容字段，保留解析） */
export interface PriceCardDraft {
  title: string
  contact: string
  layout: 'A' | 'B'
  tiers: Array<Partial<PriceCardTier>>
  picks: ExamplePick[]
  exampleThumb?: string
}

/** 作品库条目（src 为宿主组好的可直载地址） */
export interface PriceCardArtwork { id: number; title: string; src: string }

/** 宿主取数转换后回灌的档位（长度/字数钳制在组件内做） */
export interface ImportedTier { name: string; priceYuan: number; note?: string; group?: string }
</script>

<script setup lang="ts">
// 812 工具波 B ④ 出身的价目分享卡；oimimo 吸纳批三：导入真实档位 + 作品库例图 + 双布局
//
// shared-824 搬家批：整件迁入 @inkglean/shared 的哑组件化改造——
// i18n 走 props.t 注入；草稿经 props.initialDraft 进、emit('draft-change') 出；
// 提示一律 emit('notify')；复制只产文本 emit('copy-text')；导出只产 Blob emit('export-png')；
// 作品取数经 emit('request-artworks') 请、props.artworks 回；真实档位取数经
// emit('request-import') 请、expose 的 applyImportedTiers 回灌。不发请求、不碰存储、不碰剪贴板。
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { formatYuan, yuanToCents } from '../utils/money'
import { INK_PALETTE } from '../utils/ink-palette'

/** i18n 注入签名：宿主传自己的翻译函数 */
type TFn = (key: string, params?: Record<string, unknown>) => string

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

/** 海报布局：A 菜单长条式 / B 画风卡片式（用户拍板都要，做成可切换） */
type PcLayout = 'A' | 'B'

function emptyTier(): PriceCardTier {
  return { id: 'tier-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: '', priceYuan: null, note: '', group: '' }
}

const form = reactive({
  title: '',
  contact: '',
  layout: 'A' as PcLayout,
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
  emit('request-import', { hasContent: filledTiers().length > 0 })
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

function filledTiers() {
  return form.tiers.filter((td) => td.name.trim() && td.priceYuan != null && Number(td.priceYuan) > 0)
}

function validate() {
  if (!form.title.trim()) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.titleRequired') })
    return false
  }
  if (filledTiers().length < MIN_TIERS) {
    emit('notify', { kind: 'warning', text: props.t('priceCard.tiersMinRequired') })
    return false
  }
  return true
}

// ─── 纯文字版（oimimo 吸纳批三：按画风分组输出；组件只产文本，剪贴板归宿主） ───
function copyText() {
  if (!validate()) return
  const lines = [form.title.trim(), '']
  for (const group of tierGroups()) {
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

// ─── 竖版长图 PNG：纸墨风（米白底 + 墨线分栏 + 朱砂「拾绘」落款） ───
// oimimo 吸纳批三：双布局（A 菜单长条 / B 画风卡片），切档重绘
const CARD_W = 900
const { paper: PAPER, ink: INK, ink2: INK2, ink3: INK3, line: LINE, line2: LINE2, zs: ZS, white: WHITE } = INK_PALETTE
const FONT_DISPLAY = '"LXGW WenKai","Kaiti SC","STKaiti",serif'
const FONT_BODY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'

/** 档位分组（保持首次出现顺序；空组名渲染时回落「未分组」） */
interface TierGroup { name: string; tiers: PriceCardTier[] }
function tierGroups(): TierGroup[] {
  const order: string[] = []
  const map = new Map<string, PriceCardTier[]>()
  for (const tier of filledTiers()) {
    const g = tier.group.trim()
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(tier)
  }
  return order.map(name => ({ name, tiers: map.get(name)! }))
}

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
async function loadPickImages(): Promise<HTMLImageElement[]> {
  const out: HTMLImageElement[] = []
  for (const pick of picks.value) {
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
function drawHead(ctx: CanvasRenderingContext2D, canvasH: number): number {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_W, canvasH)
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.strokeRect(20, 20, CARD_W - 40, canvasH - 40)
  ctx.strokeStyle = LINE2
  ctx.lineWidth = 1
  ctx.strokeRect(26, 26, CARD_W - 52, canvasH - 52)

  const y = 80
  const title = form.title.trim()
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, title, 680, 52, FONT_DISPLAY)
  ctx.fillText(title, CARD_W / 2, y + 48)

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
function drawFooter(ctx: CanvasRenderingContext2D, y: number) {
  if (form.contact.trim()) {
    const contact = props.t('priceCard.contactLine', { contact: form.contact.trim() })
    ctx.fillStyle = INK2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(ellipsis(ctx, contact, 600, 24, FONT_BODY), CARD_W / 2, y)
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
  ctx.fillText(props.t('priceCard.sealText'), 0, 2)
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
function drawSectionHead(ctx: CanvasRenderingContext2D, group: TierGroup, y: number): number {
  const label = group.name || props.t('priceCard.groupDefault')
  const { min } = groupRange(group.tiers)
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, label, 400, 34, FONT_DISPLAY, '700')
  ctx.fillText(label, 88, y + 32)
  const rangeText = `${formatYuan(yuanToCents(min))}${props.t('priceCard.rangeFrom')}`
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
function drawLayoutA(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, images: HTMLImageElement[]) {
  const groups = tierGroups()
  const thumbCell = images.length ? Math.min(200, Math.floor((CARD_W - 176 - (images.length - 1) * 16) / images.length)) : 0
  const thumbH = images.length ? thumbCell + 48 : 0
  const rowsH = groups.reduce((acc, g) => acc + 56 + g.tiers.length * 92, 0)
  const canvasH = 80 + 72 + 40 + thumbH + rowsH + 24 + 64 + 88
  canvas.width = CARD_W
  canvas.height = canvasH
  let y = drawHead(ctx, canvasH)

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
    y += drawSectionHead(ctx, group, y)
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
  drawFooter(ctx, y)
}

/** 布局 B：画风卡片式（一组一卡：横幅例图轮换 + 尺寸清单，对标 oimimo 卡片视图） */
function drawLayoutB(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, images: HTMLImageElement[]) {
  const groups = tierGroups()
  const cardX = 88
  const cardW = CARD_W - 176
  const bannerH = images.length ? Math.round((cardW - 48) * 8 / 21) : 0
  const cardBox = (g: TierGroup) => 24 + 40 + (bannerH ? bannerH + 16 : 0) + g.tiers.length * 44 + 16
  const cardsH = groups.reduce((acc, g) => acc + cardBox(g), 0) + Math.max(0, groups.length - 1) * 24
  const canvasH = 80 + 72 + 40 + cardsH + 64 + 88
  canvas.width = CARD_W
  canvas.height = canvasH
  let y = drawHead(ctx, canvasH)

  groups.forEach((group, gi) => {
    const label = group.name || props.t('priceCard.groupDefault')
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

  drawFooter(ctx, y)
}

/** 绘制编排：按布局分流（例图异步加载后才落笔） */
async function drawCard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const images = await loadPickImages()
  if (form.layout === 'B') drawLayoutB(ctx, canvas, images)
  else drawLayoutA(ctx, canvas, images)
}

async function buildCard() {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await drawCard(ctx, canvas)
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
    await drawCard(ctx, canvas)
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
.pc-tier-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.pc-note { font-size: calc(var(--font-scale, 1) * 13px); }

.pc-example { display: flex; align-items: center; gap: 12px; }
.pc-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.pc-thumb { display: flex; align-items: center; gap: 8px; }
.pc-thumb-img { width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--line2); border-radius: var(--r-s); background: var(--paper2); }

/* oimimo 吸纳批三：导入档位分组标签 / 例图多选 / 作品挑选弹窗 */
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
.pc-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  min-height: 120px;
}
.pc-picker-empty { grid-column: 1 / -1; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }
/* shared-824：加载态文本节点（文案走 props.t） */
.pc-picker-loading { grid-column: 1 / -1; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }
.pc-picker-item {
  position: relative;
  padding: 0;
  border: 2px solid var(--line);
  border-radius: var(--r-s);
  background: var(--paper2);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--dur-fast);
}
.pc-picker-item--on { border-color: var(--zs); }
.pc-picker-item--on::after {
  content: "✓";
  position: absolute; top: 4px; right: 4px;
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  background: var(--zs); color: var(--white, #fff);
  border-radius: var(--r-paper);
  font-size: 12px;
}
.pc-picker-img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.pc-picker-name {
  display: block;
  padding: 4px 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

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
.pc-seg-btn--on { background: var(--hq); color: var(--paper2); }
.pc-seg-btn:focus-visible { outline: 2px solid var(--zs); outline-offset: -2px; }

/* shared-824：自绘遮罩弹窗（替代原对话框）——固定定位遮罩 + 纸卡本体，色值全走宿主注入 token */
.pc-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ink) 45%, transparent);
}
.pc-modal {
  width: min(92vw, 640px);
  max-height: 84vh;
  overflow: auto;
  padding: 16px 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
}
.pc-modal-head {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  padding-bottom: 12px;
}
.pc-modal-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}

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
