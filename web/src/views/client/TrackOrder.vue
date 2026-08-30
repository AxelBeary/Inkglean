<template>
  <div class="track-page">
    <ClientFloatingActions />
    <div class="track-container">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('track.backHome')" :content="$t('track.title')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('track.backHome') }}</span></template>
      </el-page-header>

      <!-- F1 围剿：查询入口改为粘贴完整追踪链接（令牌承载身份，不再用 QQ+订单号表单） -->
      <el-card style="margin-top: 16px" v-if="!order">
        <el-form @submit.prevent="searchFromInput" label-position="top">
          <el-form-item :label="$t('track.linkLabel')">
            <el-input
              v-model="linkInput" :placeholder="$t('track.linkPlaceholder')" clearable
              @keyup.enter="searchFromInput"
            />
          </el-form-item>
          <p class="link-hint">{{ $t('track.pasteHint') }}</p>
          <el-form-item>
            <el-button type="primary" @click="searchFromInput" :loading="searching" style="width: 100%">
              {{ $t('track.search') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 波 M：查询失败页内错误态 + 重试（不再只弹 toast） -->
      <div v-if="searchError" class="search-error" role="alert">
        <p>{{ $t('track.searchFailed') }}</p>
        <el-button type="primary" size="small" :disabled="searching" @click="search">{{ $t('common.loadRetry') }}</el-button>
      </div>

      <!-- F1 围剿：已保存的追踪链接清单（多单可存多条，每行一键查询） -->
      <Transition name="my-orders-fade">
        <el-card v-if="savedLinks.length" class="my-orders-card" style="margin-top: 16px">
          <template #header><span>{{ $t('track.savedTitle') }}</span></template>
          <div>
            <button
              v-for="item in savedLinks" :key="item.orderNo"
              type="button" class="my-order-item"
              :disabled="searching"
              @click="querySaved(item)"
            >
              <div class="my-order-no">{{ item.orderNo }}</div>
              <span v-if="item.invalid" class="link-expired">{{ $t('track.linkExpired') }}</span>
              <span v-else class="my-order-meta">{{ $t('track.savedQuery') }}</span>
            </button>
          </div>
        </el-card>
      </Transition>

      <!-- 查询结果 -->
      <el-card style="margin-top: 16px" v-if="order">
        <template #header>
          <div class="result-header">
            <span>{{ $t('track.orderNo') }}: {{ order.orderNo }}</span>
            <el-tag :type="statusType(order.status)">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
          </div>
        </template>

        <el-descriptions :column="1" border>
          <el-descriptions-item :label="$t('track.artist')">{{ order.artistName }}</el-descriptions-item>
          <el-descriptions-item :label="$t('track.type')">{{ order.tierName || $t('common.custom') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('track.orderTime')">
            <div class="time-cell">
              <div>{{ formatBeijing(order.createdAt) }}<span class="tz-tag">{{ $t('track.tzBeijing') }}</span></div>
              <div v-if="localTz !== 'Asia/Shanghai'" class="tz-local">{{ formatDateTime(order.createdAt) }}<span class="tz-tag tz-tag--local">{{ $t('track.tzLocal') }}</span></div>
            </div>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 排队位置 -->
        <div class="position-info" v-if="order.position">
          <el-alert type="info" :closable="false" show-icon>
            {{ $t('track.positionText', { pos: order.position, total: order.total }) }}
          </el-alert>
        </div>

        <!-- L-5: 缓冲订单由 queueStatus 状态键驱动（queuePosition 为 null = 画师隐藏位次），文案走 i18n -->
        <div class="position-info" v-if="order.queueStatus === 'queued'">
          <el-alert type="warning" :closable="false" show-icon>
            <template v-if="order.queuePosition">{{ $t('track.queuedPosition', { pos: order.queuePosition }) }}</template>
            <template v-else>{{ $t('track.queued') }}</template>
          </el-alert>
        </div>

        <!-- 状态步骤（基于订单状态，始终可用；有画师自定义流程时隐藏，避免双进度） -->
        <el-steps v-if="!order.workflowStages?.length" :active="stepActive" finish-status="success" simple style="margin-top: 20px">
          <el-step :title="$t('track.stepSubmitted')" />
          <el-step :title="$t('track.stepConfirmed')" />
          <el-step :title="$t('track.stepWip')" />
          <el-step :title="$t('track.stepDone')" />
          <el-step :title="$t('track.stepDelivered')" />
        </el-steps>

        <!-- R11: 流程进度时间线（基于画师自定义流程节点） -->
        <div class="timeline-block" v-if="order.workflowStages?.length">
          <h4 class="timeline-title">{{ $t('track.timeline.title') }}</h4>
          <!-- S2: 进度条（节点名 X/Y） -->
          <div class="stage-progress" v-if="stageProgress">
            <span class="stage-progress-label">
              {{ $t('track.timeline.progress', { name: stageProgress.name, current: stageProgress.current, total: stageProgress.total }) }}
            </span>
            <el-progress :percentage="stageProgress.pct" :stroke-width="10" />
          </div>
          <OrderTimeline :stages="order.workflowStages" :current-stage-id="order.currentStageId" />
          <!-- R30d/S2: 打回时显示回退到的节点名（不显示 "revision"） -->
          <p class="timeline-hint timeline-revision" v-if="order.status === 'revision'">
            ↩ {{ $t('track.timeline.revisionAt', { name: stageProgress?.name || order.currentStageName || '' }) }}
          </p>
          <p class="timeline-hint" v-if="order.currentStageId == null">{{ $t('track.timeline.notStarted') }}</p>
          <p class="timeline-hint" v-else-if="order.createdAt">{{ $t('track.timeline.orderedAt') }} {{ formatDateTime(order.createdAt) }}</p>
        </div>

        <!-- U1: 需求回顾（后端补字段前不显示，v-if 守卫） -->
        <div v-if="order.description || order.references?.length" class="brief-block">
          <h4 class="brief-title">{{ $t('track.briefTitle') }}</h4>
          <p v-if="order.description" class="brief-desc">{{ order.description }}</p>
          <div v-if="order.references?.length" class="brief-refs">
            <img
              v-for="(r, i) in order.references"
              :key="i"
              :src="r.url || r"
              class="brief-ref-img"
              :alt="$t('track.briefRefAlt')"
            />
          </div>
        </div>

        <!-- SPEC-003 §5.5: 价格与付款（客户视角：附加项仅 name+金额，不显示 description/id/created_at） -->
        <div class="price-block" v-if="order.finalPriceCents != null || order.extraItems?.length || order.installments?.length">
          <h4 class="price-title">{{ $t('track.priceTitle') }}</h4>
          <!-- 附加项明细 -->
          <div v-if="order.extraItems?.length" class="extra-lines">
            <div v-for="(item, index) in order.extraItems" :key="index" class="extra-line">
              <span class="extra-line-name">+ {{ item.name }}</span>
              <span class="extra-line-price">¥{{ formatCents(item.priceCents) }}</span>
            </div>
          </div>
          <!-- 最终价格 -->
          <div v-if="order.finalPriceCents != null" class="final-price-row">
            <span>{{ $t('track.finalPrice') }}</span>
            <strong>¥{{ formatCents(order.finalPriceCents) }}</strong>
          </div>
          <!-- D-3（R-11）: 零元订单显式化——0 元单无分期无收款，徽标代替待收文案，避免误以为漏收款 -->
          <div v-if="order.finalPriceCents === 0" class="zero-order-row">
            <el-tag type="info">{{ $t('track.zeroOrder') }}</el-tag>
            <span class="zero-order-hint">{{ $t('track.zeroOrderHint') }}</span>
          </div>
          <!-- B7: 付款进度（额度池模型：进度条 + 四项数据，不显示画师内部节点名） -->
          <div v-if="order.finalPriceCents != null && order.finalPriceCents > 0" class="pay-progress">
            <div class="pay-progress-nums">
              <span>{{ $t('track.payPaid') }} <strong>¥{{ formatCents(order.paidTotalCents || 0) }}</strong></span>
              <span>{{ $t('track.payNext') }} <strong>¥{{ formatCents(trackNextDueCents) }}</strong></span>
              <span>{{ $t('track.payRemaining') }} <strong>¥{{ formatCents(trackRemainingCents) }}</strong></span>
              <span>{{ $t('track.payTotal') }} <strong>¥{{ formatCents(order.finalPriceCents) }}</strong></span>
            </div>
            <el-progress :percentage="trackPayPercent" :stroke-width="10" :color="trackPayPercent >= 100 ? 'var(--el-color-success)' : 'var(--el-color-primary)'" style="margin-top: 8px" />
            <!-- 815-P2 金额#2：收款后降价/多收场景，客户端显式提示多付差额（对齐画师端 PaymentPanel「多收」口径） -->
            <p v-if="trackOverpaidCents > 0" class="overpaid-hint">{{ $t('track.overpaid', { amount: formatCents(trackOverpaidCents) }) }}</p>
          </div>
        </div>

        <!-- 交付文件 -->
        <div class="deliverables" v-if="order.deliverables?.length">
          <h4>{{ $t('track.deliverables') }}</h4>
          <div v-for="d in order.deliverables" :key="d.id" class="file-item">
            <span>{{ d.fileName }}</span>
            <!-- 260830 审计 H-4：下载统一走一次性下载链路（服务端不再下发列表直链） -->
            <el-button size="small" type="primary" :loading="downloadingId === d.id" @click="downloadDeliverable(d.id, d.fileName)">{{ $t('common.download') }}</el-button>
          </div>
        </div>

        <div class="receipt-actions">
          <el-button
            v-if="order.status === 'delivered'"
            size="small" type="primary" plain
            @click="showReceipt = true"
          >
            {{ $t('track.receiptBtn') }}
          </el-button>
          <el-button style="margin-top: 16px" @click="resetSearch">{{ $t('track.otherOrder') }}</el-button>
        </div>
      </el-card>

      <!-- REQ-031 A2: 收据（delivered 只读凭证，只呈现事实流水） -->
      <el-dialog v-model="showReceipt" :title="$t('track.receiptTitle')" width="440px">
        <div class="receipt" v-if="order">
          <div class="receipt-head">
            <span class="receipt-brand font-display">HUIYUE</span>
            <span class="receipt-sub">{{ $t('track.receiptSub') }}</span>
          </div>
          <div class="receipt-row"><span>{{ $t('track.receiptOrderNo') }}</span><strong>{{ order.orderNo }}</strong></div>
          <div class="receipt-row"><span>{{ $t('track.receiptArtist') }}</span><strong>{{ order.artistName }}</strong></div>
          <div v-if="order.installments?.length" class="receipt-section">
            <div class="receipt-section-title">{{ $t('track.receiptItems') }}</div>
            <div v-for="inst in order.installments" :key="inst.id" class="receipt-item">
              <span class="receipt-item-name">{{ inst.name }}</span>
              <!-- 2-1（审计二章1）：降价压负节点金额展示钳制到 0，不向客户显示负数 -->
              <span class="receipt-item-amount">¥{{ formatCents(Math.max(0, inst.amountCents || 0)) }}</span>
            </div>
          </div>
          <div class="receipt-divider"></div>
          <div class="receipt-row receipt-total"><span>{{ $t('track.receiptTotal') }}</span><strong>¥{{ formatCents(order.finalPriceCents || 0) }}</strong></div>
          <div class="receipt-row"><span>{{ $t('track.receiptPaid') }}</span><strong>¥{{ formatCents(order.paidTotalCents || 0) }}</strong></div>
          <div class="receipt-row"><span>{{ $t('track.receiptRemaining') }}</span><strong>¥{{ formatCents(trackRemainingCents) }}</strong></div>
          <p class="receipt-note">{{ $t('track.receiptNote') }}</p>
        </div>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index'
import type { ArtistPublicProfile, VisibleArtistProfile, OrderTrackResult } from '../../api/types'
import { fetchArtistPublicProfile } from '../../composables/useArtistPublicProfile'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime'
import { formatCents } from '../../utils/money'
import { ORDER_STATUS_TYPE } from '../../constants/order'
import { downloadAsset } from '../../utils/download'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import { usePalette } from '../../composables/usePalette'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain as string

// M2: 流程页跟随画师 palette 配色（轻量拉画师信息；加载失败回落 paper，不影响查单主流程）
const artist = ref<ArtistPublicProfile | null>(null)
const paletteId = computed(() => (artist.value as VisibleArtistProfile | null)?.paletteId || 'paper')
usePalette(paletteId)

/** 参考图：类型口径为对象行，模板 `r.url || r` 另容忍旧版字符串行——
 * 交叉类型同时满足对象字段访问与 :src 的 string 赋值 */
type TrackReference = { url: string; originalName?: string | null } & string

/** 查单数据：OrderTrackResult + 模板额外读取的排队字段（后端随响应返回，类型定义未收录）；
 * currentStageId 规范化为 undefined（OrderTimeline prop 不收 null，各处均为 == null 宽松比较，行为不变） */
type TrackOrderData = Omit<OrderTrackResult, 'currentStageId' | 'references'> & {
  currentStageId?: number | undefined
  references?: TrackReference[]
  queueStatus?: string | null
  queuePosition?: number | null
}

const orderNo = ref('')
const token = ref('')
const linkInput = ref('')
const order = ref<TrackOrderData | null>(null)
const searching = ref(false)
// 波 M：查询失败页内错误态（区别于 toast，提供重试入口）
const searchError = ref(false)

// F1 围剿：已保存的追踪链接清单（localStorage 多单可存多条，上限 20 条自动去重）
const SAVED_LINKS_KEY = 'huiyue_track_links'
interface SavedLink {
  orderNo: string
  token: string
  savedAt: number
  invalid: boolean
}
const savedLinks = ref<SavedLink[]>([])

// REQ-031 A2: 收据弹窗开关（delivered 只读凭证）
const showReceipt = ref(false)

// REQ-031 C4: 客户端时区（Intl 天然处理夏令时）
const localTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || ''
/** 北京时间格式化（后端存 UTC，需显式指定 timeZone=Asia/Shanghai） */
function formatBeijing(str: string) {
  if (!str) return ''
  const normalized = str.includes('T') ? str : str.replace(' ', 'T') + 'Z'
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return str
  return date.toLocaleString(undefined, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const statusType = (s: string) => ORDER_STATUS_TYPE[s] || 'info'

const stepActive = computed(() => {
  const map: Record<string, number> = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status ?? ''] ?? 0
})

// S2: 流程进度（前端由 workflowStages + currentStageId 计算，不依赖后端新增字段）
const stageProgress = computed(() => {
  const stages = order.value?.workflowStages || []
  const curId = order.value?.currentStageId
  if (!stages.length || curId == null) return null
  const sorted = [...stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const idx = sorted.findIndex(s => s.id === curId)
  if (idx === -1) return null
  return {
    name: sorted[idx].name,
    current: idx + 1,
    total: sorted.length,
    pct: Math.round(((idx + 1) / sorted.length) * 100)
  }
})

// B7: 额度池——客户端付款进度（四项数据 + 进度条）
const trackRemainingCents = computed(() =>
  Math.max(0, (order.value?.finalPriceCents || 0) - (order.value?.paidTotalCents || 0))
)
// 815-P2 金额#2：多付差额（收款后降价/客户多付时 > 0；与画师端 poolOverpaidCents 同口径）
const trackOverpaidCents = computed(() =>
  Math.max(0, (order.value?.paidTotalCents || 0) - (order.value?.finalPriceCents || 0))
)
const trackPayPercent = computed(() => {
  const total = order.value?.finalPriceCents || 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((order.value?.paidTotalCents || 0) / total * 100))
})
/** 下期应付：下一个未覆盖分期节点的金额（partial 时显示剩余）
 * 2-1（审计二章1）：与服务端 getOrderInstallments 同口径——已收封顶到 Σ节点价，
 * 零/负价节点视为已结清不参与吞并，大幅降价后不再算出负数下期 */
const trackNextDueCents = computed(() => {
  const insts = order.value?.installments
  if (!insts?.length) return trackRemainingCents.value
  const sumPositive = insts.reduce((s, i) => s + Math.max(0, i.amountCents || 0), 0)
  let covered = Math.min(order.value?.paidTotalCents || 0, sumPositive)
  for (const inst of insts) {
    // K1-6：GET /orders/track 的 installments 来自 getOrderInstallments（order-pricing.ts），
    // 后端只返回 camelCase amountCents，snake_case 分支为死代码
    const amt = inst.amountCents || 0
    if (amt <= 0) continue // 零/负价节点：已结清，跳过
    if (covered >= amt) { covered -= amt; continue }
    return amt - covered // partial：返回剩余
  }
  return 0 // 全部覆盖
})

// 260830 审计 H-4：追踪页下载收敛到一次性下载链路——start 签发 → fetch 全量接收 → confirm 锁定，
// 与交付页（DeliveryPage）同口径；旧式「列表直链直接下载」已下架（可转发，架空一次性语义）。
const downloadingId = ref<number | null>(null)

async function downloadDeliverable(id: number, fileName: string | null | undefined) {
  if (downloadingId.value !== null || !order.value) return
  downloadingId.value = id
  try {
    const { url } = await orderApi.deliveryDownloadStart(order.value.orderNo, id, token.value)
    await downloadAsset(url, fileName ?? undefined)
    await orderApi.deliveryDownloadConfirm(order.value.orderNo, id, token.value)
  } catch (err) {
    if ((err as { code?: string })?.code === 'DOWNLOAD_LOCKED') {
      ElMessage.warning(t('delivery.downloadLockedMsg'))
    } else {
      ElMessage.error(t('delivery.downloadFailed'))
    }
  } finally {
    downloadingId.value = null
  }
}

// ─── F1 围剿：令牌链接解析 / 查询 / 本地清单 ───

/** 从粘贴文本解析出 { orderNo, token }（支持完整链接或纯 URL 片段） */
function parseLink(text: string) {
  const raw = (text || '').trim()
  if (!raw) return null
  let url
  try {
    url = new URL(raw, window.location.origin)
  } catch {
    ElMessage.warning(t('track.linkInvalid'))
    return null
  }
  const no = url.searchParams.get('no')
  const tok = url.searchParams.get('token')
  if (!no || !tok) {
    ElMessage.warning(t('track.linkInvalid'))
    return null
  }
  return { orderNo: no, token: tok }
}

function loadSavedLinks() {
  try {
    const raw = localStorage.getItem(SAVED_LINKS_KEY)
    savedLinks.value = raw ? JSON.parse(raw) : []
  } catch {
    savedLinks.value = []
  }
}

function persistSavedLinks() {
  try {
    localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(savedLinks.value.slice(0, 20)))
  } catch {
    // localStorage 不可用时静默降级（本次会话仍可查询）
  }
}

function saveLink(orderNoToSave: string, tokenToSave: string) {
  savedLinks.value = savedLinks.value.filter((i) => i.orderNo !== orderNoToSave)
  savedLinks.value.unshift({ orderNo: orderNoToSave, token: tokenToSave, savedAt: Date.now(), invalid: false })
  persistSavedLinks()
}

/** 核心查询：凭订单号 + 令牌；成功自动入本地清单 */
// K1-1：查询竞态守卫（同款 seq 模式，对齐 OrderDetail.loadOrderSeq/useOrderForm.doStyleCalc）
let searchSeq = 0
async function search(no = orderNo.value, tok = token.value) {
  if (!(no || '').trim() || !(tok || '').trim()) {
    ElMessage.warning(t('track.enterLink'))
    return false
  }
  const mySeq = ++searchSeq
  searching.value = true
  searchError.value = false
  try {
    const data = await orderApi.track(no.trim(), tok.trim())
    if (mySeq !== searchSeq) return null // 晚到旧响应：丢弃，不覆盖新查询结果
    order.value = {
      ...data,
      currentStageId: data.currentStageId ?? undefined,
      references: data.references as TrackReference[]
    }
    orderNo.value = no.trim()
    token.value = tok.trim()
    saveLink(no.trim(), tok.trim())
    return true
  } catch (err) {
    if (mySeq !== searchSeq) return null
    ElMessage.error((err as Error).message)
    searchError.value = true
    return false
  } finally {
    if (mySeq === searchSeq) searching.value = false
  }
}

/** 粘贴完整链接 → 解析 → 查询 */
function searchFromInput() {
  const parsed = parseLink(linkInput.value)
  if (!parsed) return
  orderNo.value = parsed.orderNo
  token.value = parsed.token
  search(parsed.orderNo, parsed.token)
}

/** 已保存清单行：一键查询；令牌失效（404）时明示「链接已失效，请联系画师补发」 */
async function querySaved(item: SavedLink) {
  const ok = await search(item.orderNo, item.token)
  // null = 已被更新的查询取代（竞态晚到），不据此标记失效
  if (typeof ok === 'boolean') item.invalid = !ok
  persistSavedLinks()
}

function resetSearch() {
  order.value = null
  searchError.value = false
  linkInput.value = ''
}

// 支持从下单成功页跳转过来（?no=&token=）自动查询并保存
onMounted(() => {
  loadSavedLinks()
  const { no, token: routeToken } = route.query
  if (typeof no === 'string' && no && typeof routeToken === 'string' && routeToken) {
    orderNo.value = no
    token.value = routeToken
    search(no, routeToken)
  }
  // M2: 轻量拉画师信息取 paletteId（失败静默回落 paper）；战役留账：in-flight 去重共享请求
  fetchArtistPublicProfile(subdomain).then((a) => { artist.value = a }).catch(err => {
    console.warn('[TrackOrder] getArtistPublicProfile 失败，配色回落默认', err) // eslint-disable-line no-console -- 审计 F-2：失败留痕，回落逻辑不变
  })
})
</script>

<style scoped>
.track-page {
  min-height: 100vh;
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
  position: relative;
}
/* 打磨批 C：调深输入框 placeholder——EP 默认 #a8abb2 白底约 2.5:1，
   #6c6e72 ≈ 5.1:1 达 WCAG AA。仅亮色生效，暗色模式不动 */
html:not(.dark) .track-page { --el-input-placeholder-color: #6c6e72; }
.track-container { max-width: 600px; margin: 0 auto; }
/* 波 M：查询失败页内错误态（克制居中，淡边框+主色重试） */
.search-error {
  margin-top: 16px; padding: 16px 20px; text-align: center;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--el-border-radius-base);
}
.search-error p { margin: 0 0 12px; color: var(--text-secondary); font-size: 13px; }
.result-header { display: flex; justify-content: space-between; align-items: center; }
.position-info { margin-top: 16px; }
.timeline-block { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.timeline-title { margin-bottom: 12px; color: var(--text-primary); font-size: 14px; }
/* S2: 进度条（节点名 X/Y） */
.stage-progress { margin-bottom: 16px; }
.stage-progress-label { display: block; font-size: 13px; font-weight: 600; color: var(--el-color-primary); margin-bottom: 6px; }
.timeline-hint { font-size: 12px; color: var(--text-secondary); margin-top: 8px; }
/* R30d: 打回提示（↩ 警示色） */
.timeline-revision { color: var(--el-color-warning); font-weight: 600; }
.deliverables { margin-top: 20px; }
.deliverables h4 { margin-bottom: 8px; color: var(--text-primary); }
.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
/* F1 围剿：粘贴链接入口 + 失效提示 */
.link-hint { margin: -6px 0 14px; font-size: 12px; color: var(--text-secondary); }
.link-expired { font-size: 12px; color: var(--el-color-danger); }

/* ─── SPEC-003: 价格与付款 ─── */
.price-block { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.price-title { margin-bottom: 12px; color: var(--text-primary); font-size: 14px; }
.extra-lines { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.extra-line { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.extra-line-name { color: var(--text-secondary); }
.extra-line-price { color: var(--text-primary); }
.final-price-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-top: 1px dashed var(--border-color);
  font-size: 14px; color: var(--text-primary);
}
.final-price-row strong { font-size: 18px; }
/* D-3: 零元订单徽标行（type=info 灰标 + 说明文字） */
.zero-order-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.zero-order-hint { font-size: 13px; color: var(--text-secondary); }
/* B7: 付款进度（额度池） */
.pay-progress { margin-top: 16px; }
.pay-progress-nums {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  font-size: 13px; color: var(--text-secondary);
}
.pay-progress-nums strong { color: var(--text-primary); font-size: 15px; }
/* 815-P2 金额#2：多付提示（警示色，区别于正常进度文案） */
.overpaid-hint { margin: 8px 0 0; font-size: 13px; color: var(--el-color-warning); }

/* ─── F1 围剿：已保存追踪链接清单 ─── */
/* T 波：列表 v-if 切换淡入淡出（--dur-mid） */
.my-orders-fade-enter-active,
.my-orders-fade-leave-active { transition: opacity var(--dur-mid); }
.my-orders-fade-enter-from,
.my-orders-fade-leave-to { opacity: 0; }
.my-order-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  width: 100%; border: none; background: none; font: inherit; color: inherit; text-align: inherit;
  transition: background var(--dur-fast);
}
.my-order-item:hover { background: var(--el-fill-color-light); }
.my-order-no { font-weight: 600; color: var(--text-primary); }
.my-order-meta { font-size: 12px; color: var(--text-secondary); }

/* ─── U1: 需求回顾 ─── */
.brief-block {
  margin-top: 20px; padding: 14px 16px; border-radius: 10px;
  background: var(--el-fill-color-light);
}
.brief-title { margin-bottom: 8px; color: var(--text-primary); font-size: 14px; }
.brief-desc {
  margin: 0 0 10px; font-size: 13px; line-height: 1.7;
  color: var(--text-primary); white-space: pre-wrap; word-break: break-word;
}
.brief-refs { display: flex; flex-wrap: wrap; gap: 8px; }
/* ─── REQ-031 C4: 时区双行 ─── */
.time-cell { display: flex; flex-direction: column; gap: 3px; }
.tz-tag {
  margin-left: 6px; padding: 1px 6px; border-radius: 4px;
  font-size: 11px; color: var(--text-secondary);
  background: var(--el-fill-color-light);
}
.tz-local { color: var(--text-secondary); font-size: 12px; }

/* ─── REQ-031 A2: 收据 ─── */
.receipt-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.receipt { padding: 4px 2px; }
.receipt-head {
  display: flex; align-items: baseline; justify-content: space-between;
  padding-bottom: 12px; border-bottom: 1px solid var(--border-color); margin-bottom: 4px;
}
.receipt-brand { font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: .04em; }
.receipt-sub { font-size: 12px; color: var(--text-secondary); }
.receipt-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; font-size: 13px; color: var(--text-secondary);
}
.receipt-row strong { color: var(--text-primary); font-size: 14px; }
.receipt-total { border-top: 1px dashed var(--border-color); margin-top: 4px; }
.receipt-total strong { font-size: 18px; }
.receipt-section { margin-top: 8px; }
.receipt-section-title { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.receipt-item {
  display: flex; justify-content: space-between; padding: 5px 0;
  font-size: 13px; color: var(--text-primary);
}
.receipt-item-amount { font-variant-numeric: tabular-nums; }
.receipt-divider { border-top: 1px solid var(--border-color); margin: 6px 0 2px; }
.receipt-note { margin-top: 12px; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

.brief-ref-img {
  width: 80px; height: 80px; object-fit: cover; border-radius: 8px;
  border: 1px solid var(--border-color); background: var(--bg-page);
}
</style>
