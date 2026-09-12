<template>
  <!-- v128: 修改记录（手动修改+打回均计一次，口径用户拍板；从操作流水推导，无记录不显卡）
       （F-09 巨型文件拆分批·丁：整卡自 OrderDetail.vue 原样搬入，零行为变化；推导逻辑留在父组件） -->
  <el-card v-if="revisionRecords.length > 0" class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.revisionTitle')">
        <template #extra>
          <StatusChip type="pend">{{ $t('orderDetail.revisionTotal', { n: revisionRecords.length }) }}</StatusChip>
        </template>
      </CardHead>
    </template>
    <ul class="revision-list">
      <li v-for="(r, i) in revisionRecords" :key="i" class="revision-row">
        <span class="revision-icon" :class="`revision-icon--${r.type}`" aria-hidden="true">{{ r.type === 'rollback' ? '↩' : '✎' }}</span>
        <span class="revision-type">{{ r.type === 'rollback' ? $t('orderDetail.revisionRollback') : $t('orderDetail.revisionManual') }}</span>
        <span v-if="r.type === 'rollback' && r.fromStage" class="revision-stages">「{{ r.fromStage }}」→「{{ r.toStage }}」</span>
        <span class="revision-time">{{ formatDate(r.at) }}</span>
      </li>
    </ul>
  </el-card>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { RevisionRecordRow } from '../../../../composables/useOrderActions'
import CardHead from '../../visual/CardHead.vue'
import StatusChip from '../../visual/StatusChip.vue'

defineProps({
  revisionRecords: { type: Array as PropType<RevisionRecordRow[]>, required: true },
  // 日期格式化（父组件既有 formatDate，随卡传入避免重复实现）
  formatDate: { type: Function as PropType<(v: string | null | undefined) => string>, required: true }
})
</script>

<style scoped>
/* ─── 以下样式自 OrderDetail.vue 原样搬入（值/选择器零改动） ─── */
/* ─── v128: 修改记录（一行一次：类型标记 + 打回节点 + 时间） ─── */
.revision-list { list-style: none; margin: 0; padding: 0; }
.revision-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 0; border-top: 1px solid var(--line);
}
.revision-row:first-child { border-top: none; }
.revision-icon {
  width: 24px; height: 24px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--r-s);
  font-size: calc(var(--font-scale, 1) * 13px);
}
/* 手动修改 = 花青（进行中语义）；打回 = 藤黄（待确认语义） */
.revision-icon--manual { background: var(--hq-t); color: var(--hq-d); }
.revision-icon--rollback { background: var(--th-t); color: var(--th); }
.revision-type { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); font-weight: 600; }
.revision-stages { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.revision-time { margin-left: auto; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
</style>
