<template>
  <div class="track-page">
    <ClientFloatingActions />
    <div class="track-container">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('track.backHome')" :content="$t('track.title')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('track.backHome') }}</span></template>
      </el-page-header>

      <!-- 查询表单 -->
      <el-card style="margin-top: 16px" v-if="!order">
        <el-form @submit.prevent="search" label-position="top">
          <el-form-item :label="$t('track.qqLabel')">
            <el-input
              v-model="qq" :placeholder="$t('track.qqPlaceholder')" clearable
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item :label="$t('track.orderNoLabel')">
            <el-input
              v-model="orderNo" :placeholder="$t('track.inputPlaceholder')" clearable
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="search" :loading="searching" style="width: 100%">
              {{ $t('track.search') }}
            </el-button>
          </el-form-item>
        </el-form>
        <!-- A1: 只填 QQ 列出我的订单（不记得订单号场景） -->
        <div class="my-orders-trigger">
          <el-button size="small" text type="primary" :disabled="!qq.trim()" @click="loadMyOrders">
            {{ $t('track.myOrdersBtn') }}
          </el-button>
        </div>
      </el-card>

      <!-- A1: 我的订单列表 -->
      <el-card v-if="showMyOrders" class="my-orders-card" style="margin-top: 16px">
        <template #header><span>{{ $t('track.myOrdersTitle') }}</span></template>
        <el-empty v-if="!myOrders.length && !myOrdersLoading" :description="$t('track.myOrdersEmpty')" />
        <div v-loading="myOrdersLoading">
          <div v-for="o in myOrders" :key="o.orderNo" class="my-order-item" @click="fillAndSearch(o)">
            <div class="my-order-no">{{ o.orderNo }}</div>
            <div class="my-order-meta">{{ o.tierName }} · {{ formatDate(o.createdAt) }}</div>
          </div>
        </div>
      </el-card>

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
              <div v-if="localTz !== 'Asia/Shanghai'" class="tz-local">{{ formatDate(order.createdAt) }}<span class="tz-tag tz-tag--local">{{ $t('track.tzLocal') }}</span></div>
            </div>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 排队位置 -->
        <div class="position-info" v-if="order.position">
          <el-alert type="info" :closable="false" show-icon>
            {{ $t('track.positionText', { pos: order.position, total: order.total }) }}
          </el-alert>
        </div>

        <!-- SPEC-004: 缓冲订单排队位置（正式订单 queueDisplay 为 null，不显示） -->
        <div class="position-info" v-if="order.queueDisplay">
          <el-alert type="warning" :closable="false" show-icon>
            {{ order.queueDisplay }}
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
          <p class="timeline-hint" v-else-if="order.createdAt">{{ $t('track.timeline.orderedAt') }} {{ formatDate(order.createdAt) }}</p>
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
          <!-- B7: 付款进度（额度池模型：进度条 + 四项数据，不显示画师内部节点名） -->
          <div v-if="order.finalPriceCents != null" class="pay-progress">
            <div class="pay-progress-nums">
              <span>{{ $t('track.payPaid') }} <strong>¥{{ formatCents(order.paidTotalCents || 0) }}</strong></span>
              <span>{{ $t('track.payNext') }} <strong>¥{{ formatCents(trackNextDueCents) }}</strong></span>
              <span>{{ $t('track.payRemaining') }} <strong>¥{{ formatCents(trackRemainingCents) }}</strong></span>
              <span>{{ $t('track.payTotal') }} <strong>¥{{ formatCents(order.finalPriceCents) }}</strong></span>
            </div>
            <el-progress :percentage="trackPayPercent" :stroke-width="10" :color="trackPayPercent >= 100 ? 'var(--el-color-success)' : 'var(--el-color-primary)'" style="margin-top: 8px" />
          </div>
        </div>

        <!-- 交付文件 -->
        <div class="deliverables" v-if="order.deliverables?.length">
          <h4>{{ $t('track.deliverables') }}</h4>
          <div v-for="d in order.deliverables" :key="d.id" class="file-item">
            <span>{{ d.fileName }}</span>
            <el-button size="small" type="primary" @click="downloadFile(d.url, d.fileName)">{{ $t('common.download') }}</el-button>
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

      <!-- 不记得订单号 → 联系引导弹窗 -->
      <el-dialog v-model="showContact" :title="$t('track.contactTitle')" width="400px">
        <p class="contact-desc">{{ $t('track.contactDesc') }}</p>
        <div class="contact-list">
          <!-- P3-14: 画师未设置展示 QQ 时隐藏整行（避免空 QQ + 无效复制按钮） -->
          <div class="contact-item" v-if="contactInfo.artistName && contactInfo.contactQq">
            <span class="contact-label">{{ $t('track.contactArtist') }}（{{ contactInfo.artistName }}）</span>
            <div class="contact-value">
              <code>{{ contactInfo.contactQq }}</code>
              <el-button size="small" @click="copyText(contactInfo.contactQq)">{{ $t('track.copyQq') }}</el-button>
            </div>
          </div>
          <div class="contact-item" v-if="contactInfo.adminQq">
            <span class="contact-label">{{ $t('track.contactAdmin') }}</span>
            <div class="contact-value">
              <code>{{ contactInfo.adminQq }}</code>
              <el-button size="small" @click="copyText(contactInfo.adminQq)">{{ $t('track.copyQq') }}</el-button>
            </div>
          </div>
        </div>
      </el-dialog>

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
              <span class="receipt-item-amount">¥{{ formatCents(inst.amountCents) }}</span>
            </div>
          </div>
          <div class="receipt-divider"></div>
          <div class="receipt-row receipt-total"><span>{{ $t('track.receiptTotal') }}</span><strong>¥{{ formatCents(order.finalPriceCents || 0) }}</strong></div>
          <div class="receipt-row"><span>{{ $t('track.receiptPaid') }}</span><strong>¥{{ formatCents(order.paidTotalCents || 0) }}</strong></div>
          <div class="receipt-row"><span>{{ $t('track.receiptRemaining') }}</span><strong>¥{{ formatCents(trackRemainingCents) }}</strong></div>
          <p class="receipt-note">{{ $t('track.receiptNote') }}</p>
        </div>
      </el-dialog>

      <!-- 该QQ无订单 → 3秒不可关闭弹窗 -->
      <el-dialog
        v-model="showNoOrders" :title="$t('track.noOrdersTitle')" width="360px"
        :close-on-click-modal="false" :close-on-press-escape="false" :show-close="noOrdersCountdown <= 0"
      >
        <p>{{ $t('track.noOrdersDesc') }}</p>
        <template #footer>
          <el-button :disabled="noOrdersCountdown > 0" @click="showNoOrders = false">
            {{ noOrdersCountdown > 0 ? $t('track.noOrdersCountdown', { n: noOrdersCountdown }) : $t('common.confirm') }}
          </el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi, artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime.js'
import { formatCents } from '../../utils/money.js'
import ClientFloatingActions from '../../components/client/ClientFloatingActions.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import { usePalette } from '../../composables/usePalette.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

// M2: 流程页跟随画师 palette 配色（轻量拉画师信息；加载失败回落 paper，不影响查单主流程）
const artist = ref(null)
const paletteId = computed(() => artist.value?.paletteId || 'paper')
usePalette(paletteId)

const orderNo = ref('')
const qq = ref('')
const order = ref(null)
const searching = ref(false)

// A1: 我的订单列表（只填 QQ 查询）
const myOrders = ref([])
const myOrdersLoading = ref(false)
const showMyOrders = ref(false)

// 联系引导弹窗
const showContact = ref(false)
const contactInfo = ref({ contactQq: '', adminQq: '', artistName: '' })

// REQ-031 A2: 收据弹窗开关（delivered 只读凭证）
const showReceipt = ref(false)

// REQ-031 C4: 客户端时区（Intl 天然处理夏令时）
const localTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || ''
/** 北京时间格式化（后端存 UTC，需显式指定 timeZone=Asia/Shanghai） */
function formatBeijing(str) {
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

// 无订单弹窗（3秒倒计时）
const showNoOrders = ref(false)
const noOrdersCountdown = ref(0)
let countdownTimer = null

import { ORDER_STATUS_TYPE } from '../../constants/order.js'

const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

const stepActive = computed(() => {
  const map = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status] ?? 0
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
const trackPayPercent = computed(() => {
  const total = order.value?.finalPriceCents || 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((order.value?.paidTotalCents || 0) / total * 100))
})
/** 下期应付：下一个未覆盖分期节点的金额（partial 时显示剩余） */
const trackNextDueCents = computed(() => {
  const insts = order.value?.installments
  if (!insts?.length) return trackRemainingCents.value
  let covered = order.value?.paidTotalCents || 0
  for (const inst of insts) {
    const amt = inst.amountCents || inst.amount_cents || 0
    if (covered >= amt) { covered -= amt; continue }
    return amt - covered // partial 或 pending：返回剩余
  }
  return 0 // 全部覆盖
})

function formatDate(str) {
  return formatDateTime(str)
}

/** 金额分 → 元（后端返分，前端 /100） */
async function downloadFile(url, fileName) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName || 'download'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    ElMessage.error(t('delivery.downloadFailed'))
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('track.copied'))
  } catch {
    ElMessage.warning(text)
  }
}

function startNoOrdersCountdown() {
  noOrdersCountdown.value = 2
  showNoOrders.value = true
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    noOrdersCountdown.value--
    if (noOrdersCountdown.value <= 0) clearInterval(countdownTimer)
  }, 1000)
}

async function loadMyOrders() {
  if (!qq.value.trim()) return
  myOrdersLoading.value = true
  try {
    const res = await orderApi.myOrders(subdomain, qq.value.trim())
    // /orders/my 实测返回：直接数组 [{ orderNo, status, tierName, createdAt }]
    myOrders.value = Array.isArray(res) ? res : (res?.orders || [])
    showMyOrders.value = true
  } catch {
    ElMessage.warning(t('track.myOrdersFailed'))
  } finally {
    myOrdersLoading.value = false
  }
}

/** A1: 点列表条目 → 填订单号 → 复用既有查询流程 */
function fillAndSearch(o) {
  orderNo.value = o.orderNo
  showMyOrders.value = false // 聚焦查询结果，隐藏列表
  search()
}

async function search() {
  if (!qq.value.trim()) return ElMessage.warning(t('track.enterQq'))

  // 有订单号 → 直接精确查询
  if (orderNo.value.trim()) {
    searching.value = true
    try {
      order.value = await orderApi.track(orderNo.value.trim(), qq.value.trim())
    } catch (err) {
      ElMessage.error(err.message)
    } finally {
      searching.value = false
    }
    return
  }

  // 无订单号 → 检查该QQ是否有订单
  searching.value = true
  try {
    const result = await orderApi.lookup(subdomain, qq.value.trim())
    if (!result.hasOrders) {
      startNoOrdersCountdown()
    } else {
      contactInfo.value = result
      showContact.value = true
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    searching.value = false
  }
}

function resetSearch() {
  order.value = null
  orderNo.value = ''
  qq.value = ''
}

// 支持从下单成功页跳转过来时自动填充订单号
onMounted(() => {
  if (route.query.no) {
    orderNo.value = route.query.no
  }
  // M2: 轻量拉画师信息取 paletteId（失败静默回落 paper）
  artistPublicApi.getProfile(subdomain).then((a) => { artist.value = a }).catch(() => {})
})

onUnmounted(() => {
  clearInterval(countdownTimer)
})
</script>

<style scoped>
.track-page {
  min-height: 100vh;
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  transition: background 0.3s;
  position: relative;
}
/* 打磨批 C：调深输入框 placeholder——EP 默认 #a8abb2 白底约 2.5:1，
   #6c6e72 ≈ 5.1:1 达 WCAG AA。仅亮色生效，暗色模式不动 */
html:not(.dark) .track-page { --el-input-placeholder-color: #6c6e72; }
.track-container { max-width: 600px; margin: 0 auto; }
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
.contact-desc { color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6; }
.contact-list { display: flex; flex-direction: column; gap: 12px; }
.contact-item {
  padding: 12px; border-radius: 8px;
  background: var(--el-fill-color-light);
}
.contact-label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.contact-value { display: flex; align-items: center; gap: 8px; }
.contact-value code {
  font-size: 16px; font-weight: 600; color: var(--text-primary);
  letter-spacing: 1px;
}

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
/* B7: 付款进度（额度池） */
.pay-progress { margin-top: 16px; }
.pay-progress-nums {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  font-size: 13px; color: var(--text-secondary);
}
.pay-progress-nums strong { color: var(--text-primary); font-size: 15px; }

/* ─── A1: 我的订单列表 ─── */
.my-orders-trigger { margin-top: 4px; }
.my-order-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s;
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
