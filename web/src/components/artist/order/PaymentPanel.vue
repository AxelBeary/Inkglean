<template>
  <!-- B7: 额度池收款记录（v0.40 拆分：整卡搬自 OrderDetail.vue，零行为变化） -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.payTitle')">
        <template #extra>
          <el-button type="primary" size="small" @click="emit('open-pay')">{{ $t('orderDetail.payAddBtn') }}</el-button>
        </template>
      </CardHead>
    </template>
    <div v-loading="paymentsLoading">
      <!-- 已收 / 应收 / 待收 + 进度条 -->
      <div class="pool-summary">
        <div class="pool-nums">
          <span>{{ $t('orderDetail.payPaid') }} <strong>¥{{ formatCents(poolPaidCents) }}</strong></span>
          <span>/ {{ $t('orderDetail.payFinal') }} <strong>¥{{ formatCents(poolFinalCents) }}</strong></span>
          <!-- P2: 多收时以"多收 ¥X"替代"待收 ¥0" -->
          <span class="pool-remaining" :class="{ 'pool-overpaid': poolOverpaidCents > 0 }">
            {{ poolOverpaidCents > 0 ? $t('orderDetail.payOverpaid') : $t('orderDetail.payRemaining') }}
            <strong>¥{{ formatCents(poolOverpaidCents > 0 ? poolOverpaidCents : poolRemainingCents) }}</strong>
          </span>
        </div>
        <el-progress :percentage="poolPercent" :stroke-width="12" :color="poolPercent >= 100 ? 'var(--sl)' : 'var(--hq)'" style="margin-top: 8px" />
      </div>

      <!-- 收款流水 -->
      <!-- 加载失败错误态 + 重试（对齐 dashboard module-error 模式） -->
      <div v-if="paymentsError" class="module-error">
        <span>{{ $t('orderDetail.payLoadFailed') }}</span>
        <el-button size="small" @click="emit('retry-payments')">{{ $t('dashboard.retry') }}</el-button>
      </div>
      <template v-else>
        <div class="pool-flow" v-if="payments.length">
          <h4 class="pool-flow-title">{{ $t('orderDetail.payFlowTitle') }}</h4>
          <div v-for="p in payments" :key="p.id" class="pool-flow-row">
            <span class="pool-flow-date">{{ formatDate(p.created_at) }}</span>
            <span class="pool-flow-amount" :class="p.amount_cents < 0 ? 'is-negative' : 'is-positive'">
              {{ p.amount_cents < 0 ? '-' : '+' }}¥{{ formatCents(Math.abs(p.amount_cents)) }}
            </span>
            <span class="pool-flow-note">{{ p.note || '' }}</span>
            <el-button
              v-if="p.amount_cents > 0"
              text size="small" type="danger"
              :loading="revokeSubmitting"
              :disabled="revokeSubmitting"
              @click="emit('revoke', p)"
            >
              {{ $t('orderDetail.payRevoke') }}
            </el-button>
          </div>
        </div>
        <InkEmpty v-else-if="!paymentsLoading" :title="$t('orderDetail.payEmpty')" />
      </template>

      <!-- v0.31 F4: 节点收款（每节点已收/应收/差额 + 快捷收款） -->
      <div class="pool-ref" v-if="installmentRefs.length">
        <h4 class="pool-ref-title">{{ $t('orderDetail.payRefTitle') }}</h4>
        <div v-for="inst in installmentRefs" :key="inst.id" class="pool-ref-row pool-ref-row--v2">
          <span class="pool-ref-icon">{{ inst.status === 'paid' ? '✓' : inst.status === 'partial' ? '◐' : '○' }}</span>
          <span class="pool-ref-name">{{ inst.name }}</span>
          <span class="pool-ref-amounts">
            <span class="pool-ref-paid">{{ $t('orderDetail.payNodePaid') }} ¥{{ formatCents(inst.paidCents) }}</span>
            <span class="pool-ref-sep">/</span>
            <!-- 2-1（审计二章1）：降价压负节点金额展示钳制到 0；paid/remaining 已由服务端同口径钳制 -->
            <span>{{ $t('orderDetail.payNodeDue') }} ¥{{ formatCents(Math.max(0, inst.amountCents || 0)) }}</span>
            <span v-if="inst.remainingCents > 0" class="pool-ref-remain">（{{ $t('orderDetail.payNodeRemain') }} ¥{{ formatCents(inst.remainingCents) }}）</span>
          </span>
          <el-tag v-if="inst.status === 'paid'" type="success" size="small">{{ $t('orderDetail.payRefPaid') }}</el-tag>
          <el-tag v-else-if="inst.status === 'partial'" type="warning" size="small">{{ $t('orderDetail.payRefPartial', { amount: `¥${formatCents(inst.paidCents)}` }) }}</el-tag>
          <el-tag v-else type="info" size="small">{{ $t('orderDetail.payRefPending') }}</el-tag>
          <!-- 快捷收款（非终态 + 有差额时显示） -->
          <el-button
            v-if="!isTerminal && inst.remainingCents > 0"
            size="small" type="primary" plain
            @click="emit('collect', inst)"
          >
            {{ $t('orderDetail.payNodeCollect') }}
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import CardHead from '../visual/CardHead.vue'
import InkEmpty from '../visual/InkEmpty.vue'
import { formatDateTime } from '../../../utils/datetime.js'
import { formatCents } from '../../../utils/money.js'

/** 收款流水行（本卡消费字段） */
interface PaymentRow {
  id: number
  created_at: string
  amount_cents: number
  note?: string | null
}

/** 节点收款参照行（本卡消费字段） */
interface InstallmentRefRow {
  id: number
  name: string
  status: string
  paidCents: number
  amountCents?: number | null
  remainingCents: number
}

defineProps({
  payments: { type: Array as PropType<PaymentRow[]>, default: () => [] },
  paymentsLoading: Boolean,
  paymentsError: Boolean,
  poolPaidCents: { type: Number, default: 0 },
  poolFinalCents: { type: Number, default: 0 },
  poolRemainingCents: { type: Number, default: 0 },
  poolOverpaidCents: { type: Number, default: 0 },
  poolPercent: { type: Number, default: 0 },
  installmentRefs: { type: Array as PropType<InstallmentRefRow[]>, default: () => [] },
  isTerminal: Boolean,
  // R-4: 撤销请求在途时禁用全部撤销按钮（防连击直接伤钱；父级传 paymentSubmitting）
  revokeSubmitting: Boolean
})
const emit = defineEmits(['open-pay', 'revoke', 'collect', 'retry-payments'])

/** 日期格式化（b1: 注释原误写为 formatCents 同款，实为 formatDateTime 包装） */
function formatDate(str: string) {
  return formatDateTime(str)
}
</script>

<style scoped>
/* ─── B7: 额度池收款区（自 OrderDetail.vue 原样搬入） ─── */
.pool-summary { margin-bottom: 16px; }
.pool-nums { display: flex; align-items: baseline; gap: 6px; font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink2); flex-wrap: wrap; }
.pool-nums strong { color: var(--ink); font-size: calc(var(--font-scale, 1) * 16px); font-family: var(--f-d); font-variant-numeric: tabular-nums; }
.pool-remaining { margin-left: auto; }
/* P2: 多收（客户多付）——藤黄提示，区别于正常的待收 */
.pool-overpaid { color: var(--th); }
.pool-overpaid strong { color: var(--th); }
.pool-flow { margin-top: 12px; }
.pool-flow-title, .pool-ref-title { font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600; color: var(--ink2); margin: 0 0 8px; }
.pool-flow-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 0;
  border-bottom: 1px solid var(--line); font-size: calc(var(--font-scale, 1) * 13px);
}
.pool-flow-row:last-child { border-bottom: none; }
.pool-flow-date { color: var(--ink2); flex-shrink: 0; width: 80px; font-variant-numeric: tabular-nums; }
.pool-flow-amount { font-weight: 600; flex-shrink: 0; min-width: 80px; font-variant-numeric: tabular-nums; }
.pool-flow-amount.is-positive { color: var(--sl); }
.pool-flow-amount.is-negative { color: var(--zs); }
.pool-flow-note { flex: 1; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pool-ref { margin-top: 16px; }
.pool-ref-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: calc(var(--font-scale, 1) * 13px); }
.pool-ref-icon { width: 18px; text-align: center; flex-shrink: 0; }
.pool-ref-name { flex: 1; color: var(--ink); }
.pool-ref-amount { color: var(--ink2); flex-shrink: 0; }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
