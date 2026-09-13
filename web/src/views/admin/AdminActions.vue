<template>
  <!-- v75 W1: 管理动作处置留痕页（时间/来源 IP/动作/对象/原因，账本可查来源） -->
  <div class="admin-page admin-actions">
    <div class="admin-page-head">
      <h1 class="admin-page-title font-display">{{ $t('compliance.admin.adminActions') }}</h1>
      <p class="admin-page-sub">{{ $t('compliance.admin.adminActionsSubtitle') }}</p>
    </div>

    <!-- 一行一事：说明在左、筛选控件（动作 + 对象类型 + 条数）在右 -->
    <div class="group report-filter-group">
      <div class="row">
        <div class="filter-text">
          <div class="lab">{{ $t('compliance.admin.adminActionsFilterLabel') }}</div>
          <div class="desc">{{ $t('compliance.admin.adminActionsFilterDesc') }}</div>
        </div>
        <div class="filter-controls">
          <el-select v-model="actionFilter" :placeholder="$t('compliance.admin.filterActionAll')" style="width: 160px" @change="load">
            <el-option value="" :label="$t('compliance.admin.filterActionAll')" />
            <el-option v-for="a in ACTION_OPTIONS" :key="a" :value="a" :label="actionLabel(a)" />
          </el-select>
          <el-select v-model="targetTypeFilter" :placeholder="$t('compliance.admin.filterTargetTypeAll')" style="width: 150px" @change="load">
            <el-option value="" :label="$t('compliance.admin.filterTargetTypeAll')" />
            <el-option v-for="tt in TARGET_TYPE_OPTIONS" :key="tt" :value="tt" :label="targetTypeLabel(tt)" />
          </el-select>
          <el-select v-model="limit" style="width: 120px" @change="load">
            <el-option v-for="n in LIMIT_OPTIONS" :key="n" :value="n" :label="$t('compliance.admin.limitN', { n })" />
          </el-select>
        </div>
      </div>
    </div>

    <el-table :data="rows" v-loading="loading" class="actions-table" empty-text="">
      <el-table-column prop="created_at" :label="$t('compliance.admin.colTime')" width="168">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column prop="admin_ip" :label="$t('compliance.admin.colAdminIp')" width="140">
        <template #default="{ row }">{{ row.admin_ip || '—' }}</template>
      </el-table-column>
      <el-table-column :label="$t('compliance.admin.colAction')" width="130">
        <template #default="{ row }">{{ actionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column :label="$t('compliance.admin.colTarget')" min-width="150">
        <template #default="{ row }">
          <span v-if="row.target_type">{{ targetTypeLabel(row.target_type) }}</span>
          <span v-if="row.target_id != null" class="target-id">#{{ row.target_id }}</span>
          <span v-if="!row.target_type && row.target_id == null">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="reason" :label="$t('compliance.admin.colReason')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.reason || '—' }}</template>
      </el-table-column>
    </el-table>

    <div v-if="!loading && rows.length > 0" class="actions-total">{{ $t('compliance.admin.totalCount', { n: total }) }}</div>
    <el-empty
      v-if="!loading && rows.length === 0"
      :description="$t('compliance.admin.adminActionsEmpty')"
      class="actions-empty"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { complianceApi } from '../../api/index'
import type { AdminActionItem } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'

const { t } = useI18n()

/** 动作白名单（对齐后端 compliance.routes.ts ADMIN_ACTIONS；筛选下拉与标签同源） */
const ACTION_OPTIONS = [
  'report_resolve', 'content_remove', 'content_restore',
  'artist_ban', 'artist_unban', 'home_takedown', 'home_restore',
  'artist_status_set', 'artist_remove'
] as const
/** 对象类型取值（后端 writeAdminAction 实际写入的 target_type） */
const TARGET_TYPE_OPTIONS = ['report', 'artwork', 'message', 'artist'] as const
const LIMIT_OPTIONS = [50, 100, 200, 500] as const

const rows = ref<AdminActionItem[]>([])
const total = ref(0)
const loading = ref(false)
const actionFilter = ref('')
const targetTypeFilter = ref('')
const limit = ref<number>(100)

function actionLabel(action: string): string {
  const key = `compliance.admin.action.${action}`
  const label = t(key)
  // 未知动作（后端新增白名单未同步词条时）回退原始值，避免整表渲染生键
  return label === key ? action : label
}

function targetTypeLabel(type: string): string {
  const key = `compliance.admin.targetType.${type}`
  const label = t(key)
  return label === key ? type : label
}

async function load() {
  loading.value = true
  try {
    const params: { limit: number; action?: string; targetType?: string; targetId?: number } = { limit: limit.value }
    if (actionFilter.value) params.action = actionFilter.value
    // 后端要求 targetType 与 targetId 成对才生效；本页只做类型粗筛，不成对则不下发 targetType
    const res = await complianceApi.getAdminActions(params)
    rows.value = res.rows
    total.value = res.total
  } catch (err) {
    rows.value = []
    total.value = 0
    ElMessage.error((err as { message?: string }).message || t('compliance.admin.adminActionsLoadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* 纸墨 token（admin 布局已挂 artist-tokens）；间距 4px 倍数 */
.admin-actions { padding: 8px 0 32px; }
.report-filter-group { margin-bottom: 16px; }
.actions-table { width: 100%; }
.actions-empty { margin-top: 24px; }
.actions-total { margin-top: 12px; font-size: 12px; color: var(--ink3, #888); text-align: right; }
.target-id { margin-left: 4px; color: var(--ink3, #888); font-family: var(--font-mono, monospace); }

/* 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） */
.group {
  padding: 4px 24px 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.filter-text { min-width: 0; }
.filter-controls { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; justify-content: flex-end; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .filter-controls { justify-content: flex-start; }
}
</style>
