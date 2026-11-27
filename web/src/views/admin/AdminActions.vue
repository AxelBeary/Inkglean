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
          <!-- R-2：导出按当前筛选条件走（不受列表条数限制）；导出动作本身会写一条留痕 -->
          <el-button
            type="primary"
            plain
            :loading="exporting"
            :disabled="exporting"
            :title="$t('compliance.admin.adminActionsExportHint')"
            @click="doExport"
          >
            {{ exporting ? $t('compliance.admin.adminActionsExporting') : $t('compliance.admin.adminActionsExport') }}
          </el-button>
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
import { useArtistStore } from '../../stores/artist'

const { t } = useI18n()
const store = useArtistStore()

/** 动作白名单（对齐后端 compliance.routes.ts ADMIN_ACTIONS；筛选下拉与标签同源） */
const ACTION_OPTIONS = [
  'report_resolve', 'content_remove', 'content_restore',
  'artist_ban', 'artist_unban', 'home_takedown', 'home_restore',
  'artist_status_set', 'artist_remove', 'delivery_link_reissue',
  // B7-F0111：更换管理员留痕动作（对齐后端白名单新登记项）
  'admin_transfer',
  // R-2：导出动作自身的留痕（对齐后端白名单；不列出来就筛不到「谁导出过」）
  'admin_actions_export'
] as const
/** 对象类型取值（后端 writeAdminAction 实际写入的 target_type） */
const TARGET_TYPE_OPTIONS = ['report', 'artwork', 'message', 'artist', 'deliverable', 'admin_action'] as const
const LIMIT_OPTIONS = [50, 100, 200, 500] as const

const rows = ref<AdminActionItem[]>([])
const total = ref(0)
const loading = ref(false)
const exporting = ref(false)
const actionFilter = ref('')
const targetTypeFilter = ref('')
const limit = ref<number>(100)

/** 导出超时：留痕量可达万行级，比 JSON 请求的 15s 宽（同 ToolsExport 的导出档口径再放宽一档） */
const EXPORT_TIMEOUT_MS = 60_000

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

/** 当前筛选条件（列表与导出同源：页面上筛什么，导出的就是什么） */
function currentFilters(): { action?: string; targetType?: string } {
  const params: { action?: string; targetType?: string } = {}
  if (actionFilter.value) params.action = actionFilter.value
  if (targetTypeFilter.value) params.targetType = targetTypeFilter.value
  return params
}

/** 从 Content-Disposition 取文件名（同 HealthCheck 口径） */
function filenameFromDisposition(header: string | null, fallback: string): string {
  const m = /filename="?([^";]+)"?/.exec(header || '')
  return m ? m[1] : fallback
}

/**
 * R-2：导出留痕 CSV。
 *
 * 走 fetch + blob 而不是 JSON 请求核：要读 Content-Disposition 的文件名、要单独设超时，
 * 且响应体是流式 CSV 而非 JSON（对齐 ToolsExport / HealthCheck 两处同类实现）。
 * 401 → 清会话跳登录（与拦截器口径一致）；导出成功后**不刷新列表**——
 * 留痕里会多一条 admin_actions_export，但那是审计事实，不该让页面数据在用户没要求时跳动。
 */
async function doExport() {
  if (exporting.value) return
  exporting.value = true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS)
  try {
    const res = await fetch(complianceApi.adminActionsExportUrl(currentFilters()), {
      credentials: 'include',
      signal: controller.signal
    })
    if (!res.ok) {
      if (res.status === 401) {
        // REQ-043 I6-e: 清会话统一走 store action（store 为准，localStorage 由 action 清理）
        store.logout()
        window.location.href = '/login'
        return
      }
      let msg = `HTTP ${res.status}`
      try {
        const data = await res.json()
        if (data?.error) msg = data.error
      } catch { /* 非 JSON 错误体，用状态码兜底 */ }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameFromDisposition(
      res.headers.get('Content-Disposition'),
      `admin-actions-${new Date().toISOString().slice(0, 10)}.csv`
    )
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('compliance.admin.adminActionsExported'))
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      ElMessage.error(t('compliance.admin.adminActionsExportTimeout'))
      return
    }
    ElMessage.error((err as Error).message || t('compliance.admin.adminActionsExportFailed'))
  } finally {
    clearTimeout(timer)
    exporting.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const params: { limit: number; action?: string; targetType?: string; targetId?: number } = { limit: limit.value, ...currentFilters() }
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
