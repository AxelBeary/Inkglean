<template>
  <div class="track-page">
    <div class="page-prefs"><ThemeToggle /></div>
    <div class="track-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('track.backHome')" :content="$t('track.title')" />

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
          <el-descriptions-item :label="$t('track.orderTime')">{{ formatDate(order.createdAt) }}</el-descriptions-item>
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

        <!-- 状态步骤（基于订单状态，始终可用） -->
        <el-steps :active="stepActive" finish-status="success" simple style="margin-top: 20px">
          <el-step :title="$t('track.stepSubmitted')" />
          <el-step :title="$t('track.stepConfirmed')" />
          <el-step :title="$t('track.stepWip')" />
          <el-step :title="$t('track.stepDone')" />
          <el-step :title="$t('track.stepDelivered')" />
        </el-steps>

        <!-- R11: 流程进度时间线（基于画师自定义流程节点） -->
        <div class="timeline-block" v-if="order.workflowStages?.length">
          <h4 class="timeline-title">{{ $t('track.timeline.title') }}</h4>
          <OrderTimeline :stages="order.workflowStages" :current-stage-id="order.currentStageId" />
          <!-- R30d: 打回时显示 ↩ 提示（客户可见） -->
          <p class="timeline-hint timeline-revision" v-if="order.status === 'revision'">↩ {{ $t('track.timeline.revision') }}</p>
          <p class="timeline-hint" v-if="order.currentStageId == null">{{ $t('track.timeline.notStarted') }}</p>
          <p class="timeline-hint" v-else-if="order.createdAt">{{ $t('track.timeline.orderedAt') }} {{ formatDate(order.createdAt) }}</p>
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
          <!-- 付款节点 -->
          <div v-if="order.installments?.length" class="installment-block">
            <h4 class="installment-title">{{ $t('track.installmentsTitle') }}</h4>
            <div v-for="(inst, index) in order.installments" :key="index" class="installment-row">
              <span class="installment-name">{{ inst.name }}</span>
              <span class="installment-amount">¥{{ formatCents(inst.amountCents) }}</span>
              <el-tag :type="inst.paid ? 'success' : 'info'" size="small">
                {{ inst.paid ? $t('track.paid') : $t('track.unpaid') }}
              </el-tag>
            </div>
          </div>
        </div>

        <!-- 交付文件 -->
        <div class="deliverables" v-if="order.deliverables?.length">
          <h4>{{ $t('track.deliverables') }}</h4>
          <div v-for="d in order.deliverables" :key="d.id" class="file-item">
            <span>📄 {{ d.fileName }}</span>
            <el-button size="small" type="primary" @click="downloadFile(d.url)">{{ $t('common.download') }}</el-button>
          </div>
        </div>

        <el-button style="margin-top: 16px" @click="resetSearch">{{ $t('track.otherOrder') }}</el-button>
      </el-card>

      <!-- 不记得订单号 → 联系引导弹窗 -->
      <el-dialog v-model="showContact" :title="$t('track.contactTitle')" width="400px">
        <p class="contact-desc">{{ $t('track.contactDesc') }}</p>
        <div class="contact-list">
          <div class="contact-item" v-if="contactInfo.artistName">
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
import { orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../utils/datetime.js'
import ThemeToggle from '../../components/ThemeToggle.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const orderNo = ref('')
const qq = ref('')
const order = ref(null)
const loading = ref(false)
const searching = ref(false)

// 联系引导弹窗
const showContact = ref(false)
const contactInfo = ref({ contactQq: '', adminQq: '', artistName: '' })

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

function formatDate(str) {
  return formatDateTime(str)
}

/** 金额分 → 元（后端返分，前端 /100） */
function formatCents(cents) {
  return ((cents || 0) / 100).toFixed(2)
}

function downloadFile(url) {
  window.open(url, '_blank', 'noopener')
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
  noOrdersCountdown.value = 3
  showNoOrders.value = true
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    noOrdersCountdown.value--
    if (noOrdersCountdown.value <= 0) clearInterval(countdownTimer)
  }, 1000)
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
})

onUnmounted(() => {
  clearInterval(countdownTimer)
})
</script>

<style scoped>
.track-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 16px;
  transition: background 0.3s;
  position: relative;
}
.page-prefs { position: absolute; top: 16px; right: 16px; z-index: 10; }
.track-container { max-width: 600px; margin: 0 auto; }
.result-header { display: flex; justify-content: space-between; align-items: center; }
.position-info { margin-top: 16px; }
.timeline-block { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.timeline-title { margin-bottom: 12px; color: var(--text-primary); font-size: 14px; }
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
.installment-block { margin-top: 16px; }
.installment-title { margin-bottom: 8px; color: var(--text-primary); font-size: 14px; }
.installment-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.installment-name { color: var(--text-primary); }
.installment-amount { color: var(--text-secondary); }
</style>
