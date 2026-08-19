<template>
  <!-- v0.31 REQ-021 F1: 操作记录（操作日志时间线，分页 + 类型筛选）
       2026-08-10 拆分批：整卡搬自 OrderDetail.vue，零行为变化 -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.logTitle')">
        <template #extra>
          <el-select v-model="logTypeFilter" size="small" style="width: 140px" @change="onLogTypeChange">
            <el-option :label="$t('orderDetail.logTypeAll')" value="" />
            <el-option v-for="lt in logTypeOptions" :key="lt.value" :label="lt.label" :value="lt.value" />
          </el-select>
        </template>
      </CardHead>
    </template>
    <div v-loading="logLoading">
      <!-- 加载失败错误态 + 重试（对齐 dashboard module-error 模式） -->
      <div v-if="logError" class="module-error">
        <span>{{ $t('orderDetail.logLoadFailed') }}</span>
        <el-button size="small" @click="loadLogs">{{ $t('dashboard.retry') }}</el-button>
      </div>
      <template v-else>
        <el-timeline v-if="logs.length" class="activity-timeline">
          <el-timeline-item
            v-for="log in logs" :key="log.id"
            :type="logTagType(log.action_type)"
            :timestamp="formatDate(log.created_at)" placement="top"
          >
            <div class="log-item">
              <div class="log-head">
                <el-tag :type="logTagType(log.action_type)" size="small">{{ $t(`orderDetail.logType.${log.action_type}`) }}</el-tag>
                <span class="log-actor">{{ logActorName(log.actor) }}</span>
              </div>
              <div class="log-detail">{{ formatLogDetail(log) }}</div>
            </div>
          </el-timeline-item>
        </el-timeline>
        <InkEmpty v-else-if="!logLoading" :title="$t('orderDetail.logEmpty')" />
        <div v-if="logTotal > logPageSize" class="log-pagination">
          <el-pagination
            :current-page="logPage" :page-size="logPageSize" :total="logTotal"
            layout="total, prev, pager, next" small
            @current-change="onLogPageChange"
          />
        </div>
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import CardHead from '../visual/CardHead.vue'
import InkEmpty from '../visual/InkEmpty.vue'
import { useActivityLog } from '../../../composables/useActivityLog.js'
import { formatDateTime } from '../../../utils/datetime.js'
import { formatCents } from '../../../utils/money.js'
import type { ActivityLogItem } from '../../../api/types.js'

const props = defineProps({
  routeId: { type: [String, Number], required: true }
})

const { t } = useI18n()

function formatDate(str: string) {
  return formatDateTime(str)
}

const {
  logs, total: logTotal, page: logPage, pageSize: logPageSize,
  typeFilter: logTypeFilter, loading: logLoading, error: logError,
  loadLogs, onPageChange: onLogPageChange, onTypeChange: onLogTypeChange
} = useActivityLog(props.routeId as number)

/** 操作类型 → el-tag / el-timeline-item type 映射 */
const LOG_TAG_TYPE: Record<string, 'primary' | 'warning' | 'info' | 'success'> = {
  status_change: 'primary',
  price_change: 'warning',
  extra_item: 'info',
  payment: 'success',
  stage_advance: 'primary',
  note_update: 'info'
}
function logTagType(actionType: string) {
  return LOG_TAG_TYPE[actionType] || 'info'
}

/** 操作类型筛选选项（全部 + 6 种，computed 保证语言切换后标签更新） */
const logTypeOptions = computed(() =>
  ['status_change', 'price_change', 'payment', 'stage_advance', 'extra_item', 'note_update']
    .map(value => ({ value, label: t(`orderDetail.logType.${value}`) }))
)

/** 操作人展示名 */
function logActorName(actor: string) {
  if (actor === 'system') return t('orderDetail.logActorSystem')
  if (actor === 'artist') return t('orderDetail.logActorArtist')
  if (actor === 'client') return t('orderDetail.logActorClient')
  return actor
}

/** detail 摘要（按 action_type 格式化，缺字段时安全回退） */
function formatLogDetail(log: ActivityLogItem) {
  const d = log.detail || {}
  switch (log.action_type) {
    case 'status_change':
      return d.from && d.to
        ? t('orderDetail.logDetail.statusChange', { from: t(`common.orderStatus.${d.from}`), to: t(`common.orderStatus.${d.to}`) })
        : ''
    case 'price_change':
      return d.oldCents != null && d.newCents != null
        ? t('orderDetail.logDetail.priceChange', { from: formatCents(d.oldCents as number), to: formatCents(d.newCents as number) }) + (d.reason ? ` · ${d.reason}` : '')
        : ''
    case 'extra_item':
      if (d.action === 'add') return t('orderDetail.logDetail.extraAdd', { name: d.name || '' }) + (d.priceCents ? ` ¥${formatCents(d.priceCents as number)}` : '')
      if (d.action === 'delete') return t('orderDetail.logDetail.extraDelete', { name: d.name || '' })
      return ''
    case 'payment':
      return d.amountCents != null
        ? ((d.amountCents as number) < 0
          ? t('orderDetail.logDetail.paymentRevoke', { amount: formatCents(Math.abs(d.amountCents as number)) })
          : t('orderDetail.logDetail.paymentAdd', { amount: formatCents(d.amountCents as number) })) + (d.note ? ` · ${d.note}` : '')
        : ''
    case 'stage_advance':
      if (d.action === 'advance') return t('orderDetail.logDetail.stageAdvance', { name: d.stageName || '' })
      if (d.action === 'rollback') return t('orderDetail.logDetail.stageRollback', { from: d.from || '', to: d.to || '' })
      return ''
    case 'note_update':
      if (d.action === 'add') return t('orderDetail.logDetail.noteAdd')
      if (d.action === 'delete') return t('orderDetail.logDetail.noteDelete')
      return ''
    default:
      return ''
  }
}

onMounted(() => {
  loadLogs() // v0.31 REQ-021 F1: 操作记录（原 OrderDetail onMounted 调用，随拆分迁入）
})
</script>

<style scoped>
/* ─── v0.31 REQ-021 F1: 操作记录 ─── */
.activity-timeline { padding-top: 4px; }
.log-item { position: relative; }
.log-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.log-actor { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.log-detail { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); line-height: 1.6; word-break: break-word; }
.log-pagination { display: flex; justify-content: center; margin-top: 12px; }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
