<template>
  <!-- REQ-042: 举报处理（待处理/已处理 + 处理/下架/封禁操作，全部写 admin_actions 留痕） -->
  <div class="admin-page report-manage">
    <h2 class="font-display report-title">{{ $t('compliance.admin.reportManage') }}</h2>

    <el-tabs v-model="statusTab" class="report-tabs" @tab-change="load">
      <el-tab-pane :label="$t('compliance.admin.tabPending')" name="pending" />
      <el-tab-pane :label="$t('compliance.admin.tabResolved')" name="resolved" />
    </el-tabs>

    <el-table :data="reports" v-loading="loading" class="report-table" empty-text="">
      <el-table-column prop="id" :label="$t('compliance.admin.colId')" width="72" />
      <el-table-column :label="$t('compliance.admin.colType')" width="120">
        <template #default="{ row }">
          {{ typeLabel(row.target_type) }}
        </template>
      </el-table-column>
      <el-table-column prop="target_id" :label="$t('compliance.admin.colTargetId')" width="96">
        <template #default="{ row }">{{ row.target_id ?? '—' }}</template>
      </el-table-column>
      <el-table-column prop="description" :label="$t('compliance.admin.colDescription')" min-width="220" show-overflow-tooltip />
      <el-table-column prop="contact" :label="$t('compliance.admin.colContact')" width="120">
        <template #default="{ row }">{{ row.contact || '—' }}</template>
      </el-table-column>
      <el-table-column prop="created_at" :label="$t('compliance.admin.colCreatedAt')" width="168" />
      <el-table-column :label="$t('compliance.admin.colActions')" width="240" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="primary" plain @click="resolveReport(row)">
              {{ $t('compliance.admin.resolve') }}
            </el-button>
            <el-button
              v-if="row.target_type === 'artwork' && row.target_id"
              size="small" type="danger" plain
              @click="removeContent('artwork', row)"
            >
              {{ $t('compliance.admin.removeArtwork') }}
            </el-button>
            <el-button
              v-if="row.target_type === 'message' && row.target_id"
              size="small" type="danger" plain
              @click="removeContent('message', row)"
            >
              {{ $t('compliance.admin.removeMessage') }}
            </el-button>
            <el-button
              v-if="row.target_type === 'artist_home' && row.target_id"
              size="small" type="warning" plain
              @click="banArtist(row)"
            >
              {{ $t('compliance.admin.ban') }}
            </el-button>
          </template>
          <span v-else class="report-resolved-text">{{ $t('compliance.admin.resolved') }}</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && reports.length === 0"
      :description="$t('compliance.admin.empty')"
      class="report-empty"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { complianceApi } from '../../api/index.js'
import type { ReportItem, ReportTargetType } from '../../api/types.js'

const { t } = useI18n()

const statusTab = ref<'pending' | 'resolved'>('pending')
const reports = ref<ReportItem[]>([])
const loading = ref(false)

function typeLabel(type: ReportTargetType): string {
  return t(`compliance.report.types.${type}`)
}

async function load() {
  loading.value = true
  try {
    reports.value = await complianceApi.getReports(statusTab.value)
  } catch (err) {
    ElMessage.error((err as { message?: string }).message || t('compliance.admin.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 可选原因输入（prompt；取消=中止，空值=不带原因直接处理） */
async function askReason(title: string, message: string): Promise<{ cancelled: boolean; reason: string | null }> {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputPlaceholder: t('compliance.admin.reasonPlaceholder'),
      inputValidator: () => true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputValue: ''
    })
    return { cancelled: false, reason: (value || '').trim() || null }
  } catch {
    return { cancelled: true, reason: null }
  }
}

/** 标记已解决（写留痕） */
async function resolveReport(row: ReportItem) {
  const { cancelled, reason } = await askReason(t('compliance.admin.resolve'), t('compliance.admin.resolveConfirm'))
  if (cancelled) return
  try {
    await complianceApi.resolveReport(row.id, reason)
    ElMessage.success(t('compliance.admin.resolvedToast'))
    await load()
  } catch (err) {
    ElMessage.error((err as { message?: string }).message)
  }
}

/** 内容下架（artwork/message，写留痕） */
async function removeContent(type: 'artwork' | 'message', row: ReportItem) {
  const { cancelled, reason } = await askReason(
    type === 'artwork' ? t('compliance.admin.removeArtwork') : t('compliance.admin.removeMessage'),
    t('compliance.admin.removeConfirm')
  )
  if (cancelled) return
  try {
    await complianceApi.removeContent(type, Number(row.target_id), reason)
    ElMessage.success(t('compliance.admin.removedToast'))
    await load()
  } catch (err) {
    ElMessage.error((err as { message?: string }).message)
  }
}

/** 封禁画师（is_banned=1 + 踢下线，写留痕） */
async function banArtist(row: ReportItem) {
  const { cancelled, reason } = await askReason(t('compliance.admin.ban'), t('compliance.admin.banConfirm'))
  if (cancelled) return
  try {
    await complianceApi.banArtist(Number(row.target_id), reason)
    ElMessage.success(t('compliance.admin.bannedToast'))
    await load()
  } catch (err) {
    ElMessage.error((err as { message?: string }).message)
  }
}

onMounted(load)
</script>

<style scoped>
/* 纸墨 token（admin 布局已挂 artist-tokens）；间距 4px 倍数 */
.report-manage { padding: 8px 0 32px; }
.report-title { font-size: 24px; font-weight: 700; color: var(--ink); margin: 0 0 20px; letter-spacing: 0.02em; }
.report-tabs { margin-bottom: 16px; }
.report-table { width: 100%; }
.report-resolved-text { color: var(--ink3, #888); font-size: 13px; }
.report-empty { margin-top: 24px; }
</style>
