<template>
  <!-- 基本信息（v0.38: CardHead 朱砂 mark 卡头）（F-09 巨型文件拆分批·丁：整卡自 OrderDetail.vue 原样搬入，零行为变化） -->
  <el-card class="od-card od-head-info">
    <template #header>
      <CardHead :title="$t('orderDetail.orderInfo')">
        <template #extra>
          <!-- 818-D: 再来一单（终态/非终态订单均可用，回填选项弹窗） -->
          <el-button size="small" type="primary" plain @click="emit('reorder')">
            {{ $t('orderDetail.reorderBtn') }}
          </el-button>
          <el-tag :type="statusType(order.status)">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
        </template>
      </CardHead>
    </template>
    <el-descriptions :column="2" border>
      <el-descriptions-item :label="$t('orderDetail.colOrderNo')">
        <span class="od-order-no">{{ order.order_no }}</span>
      </el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colType')">{{ order.tier_name || $t('common.custom') }}</el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colQq')">
        <span class="client-qq-row">
          <span>{{ order.client_qq }}</span>
          <!-- R58-6: 客户 QQ 跳转 + 复制 -->
          <el-button size="small" text type="primary" @click="emit('jump-qq', order.client_qq)">{{ $t('orderDetail.jumpQq') }}</el-button>
          <el-button size="small" text @click="emit('copy-qq', order.client_qq)">{{ $t('orderDetail.copyQq') }}</el-button>
          <!-- F1 围剿：补发客户追踪链接（重新生成令牌，旧链接立即失效） -->
          <el-button size="small" text type="primary" :loading="regeneratingToken" @click="emit('regenerate-link')">
            {{ $t('orderDetail.copyTrackLink') }}
          </el-button>
        </span>
      </el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colName')">{{ order.client_name || '-' }}</el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colPriority')">
        <!-- R17: 优先级分段按钮（红/黄/绿，点击即保存）
             拆分注：原 v-model="order.priority" 的「先写值再保存」两步由父组件 onPriorityChange 承接
             （子组件不直改订单状态，M-9 统一写入口纪律不受影响），渲染与请求时序不变 -->
        <el-radio-group :model-value="order.priority" size="small" class="priority-group" @change="emit('change-priority', $event)">
          <el-radio-button value="high" class="prio-high">{{ $t('common.priority.high') }}</el-radio-button>
          <el-radio-button value="medium" class="prio-medium">{{ $t('common.priority.medium') }}</el-radio-button>
          <el-radio-button value="low" class="prio-low">{{ $t('common.priority.low') }}</el-radio-button>
        </el-radio-group>
      </el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colSource')">{{ order.source === 'self' ? $t('common.source.clientSelf') : $t('common.source.manualEntry') }}</el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colTime')" :span="2">{{ formatDate(order.created_at) }}</el-descriptions-item>
      <el-descriptions-item :label="$t('orderDetail.colDesc')" :span="2">{{ order.description || $t('common.none') }}</el-descriptions-item>
    </el-descriptions>
    <!-- F9 客户快查卡（发布前待办清单第 6 项·网页端回流）：复用录单页 mo-client-card 同款视觉，
         有标记/汇总才显示；数据随 order.client_qq 变化查 getToolsClient，失败静默不吵
         （查数逻辑仍留在父组件 OrderDetail：clientProfile/clientSummary 经 props 下发） -->
    <div v-if="clientProfile || clientSummary" class="od-client-card">
      <div v-if="clientProfile?.tags?.length" class="od-client-tags">
        <el-tag v-for="tag in clientProfile.tags" :key="tag" size="small" class="od-client-tag">{{ tag }}</el-tag>
      </div>
      <p v-if="clientProfile?.note" class="od-client-note">{{ clientProfile.note }}</p>
      <div v-if="clientSummary" class="od-client-summary">
        <span>{{ $t('manualOrder.clientSummaryOrders', { n: clientSummary.totalOrders }) }}</span>
        <span>{{ $t('manualOrder.clientSummaryPaid', { amount: formatCents(clientSummary.totalPaidCents) }) }}</span>
        <span v-if="clientSummary.lastOrderAt">{{ $t('manualOrder.clientSummaryLast', { date: formatDate(clientSummary.lastOrderAt) }) }}</span>
        <el-tag v-if="clientSummary.lastOrderStatus" :type="statusType(clientSummary.lastOrderStatus)" size="small">{{ $t(`common.orderStatus.${clientSummary.lastOrderStatus}`) }}</el-tag>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { ClientProfile, ClientSummary } from '../../../../api/types'
import CardHead from '../../visual/CardHead.vue'
import { statusType } from '../../../../constants/order'
import { formatCents } from '../../../../utils/money'

/** 本卡消费的订单字段（组件私有 Lite 接口，口径同 GalleryPanel/PaymentPanel） */
interface OrderInfoLite {
  order_no: string
  status: string
  priority: string
  source: string
  client_qq: string
  client_name: string | null
  tier_name?: string | null
  description: string | null
  created_at: string
}

defineProps({
  order: { type: Object as PropType<OrderInfoLite>, required: true },
  // F9 客户快查卡数据（父组件查 getToolsClient 后下发；无数据时整块不渲染）
  clientProfile: { type: Object as PropType<ClientProfile | null>, default: null },
  clientSummary: { type: Object as PropType<ClientSummary | null>, default: null },
  // F1 围剿：补发追踪链接在途标记
  regeneratingToken: Boolean,
  // 日期格式化（父组件既有 formatDate，随卡传入避免重复实现）
  formatDate: { type: Function as PropType<(v: string | null | undefined) => string>, required: true }
})
const emit = defineEmits([
  'reorder', 'jump-qq', 'copy-qq', 'regenerate-link', 'change-priority'
])
</script>

<style scoped>
/* ─── 以下样式自 OrderDetail.vue 原样搬入（值/选择器零改动） ─── */
/* 订单号文楷——落款感（REQ §1.3：数字/单号用文楷） */
.od-order-no { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600; letter-spacing: .02em; }

/* ─── F9 客户快查卡（复用录单页 mo-client-card 同款视觉，纸墨 token） ─── */
.od-client-card {
  margin: 12px 0 0;
  padding: 10px 12px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.od-client-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.od-client-tag { font-family: var(--f-d); }
.od-client-note { margin: 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.5; }
.od-client-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink); }

/* R17: 优先级分段按钮配色（选中态由 Element Plus 内部 is-checked 控制） */
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) { background: var(--zs); border-color: var(--zs); box-shadow: -1px 0 0 0 var(--zs); }
.priority-group :deep(.prio-medium.is-checked .el-radio-button__inner) { background: var(--th); border-color: var(--th); box-shadow: -1px 0 0 0 var(--th); }
.priority-group :deep(.prio-low.is-checked .el-radio-button__inner) { background: var(--sl); border-color: var(--sl); box-shadow: -1px 0 0 0 var(--sl); }

/* R58-6: 客户 QQ 跳转 + 复制 */
.client-qq-row { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.client-qq-row .el-button { padding: 2px 6px; height: auto; }
</style>
