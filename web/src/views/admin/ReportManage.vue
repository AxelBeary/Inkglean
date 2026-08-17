<template>
  <!-- REQ-042: 举报处理（待处理/已处理 + 处理/下架/封禁操作，全部写 admin_actions 留痕） -->
  <div class="admin-page report-manage">
    <!-- b3 清扫：页头并入公共 admin-page-head 体系（字体 24px→26px 口径统一） -->
    <div class="admin-page-head">
      <h1 class="admin-page-title font-display">{{ $t('compliance.admin.reportManage') }}</h1>
      <p class="admin-page-sub">{{ $t('compliance.admin.reportManageSubtitle') }}</p>
    </div>

    <!-- 819-I：一行一事——说明在左、筛选控件（处理状态 Tab）在右 -->
    <div class="group report-filter-group">
      <div class="row">
        <div class="report-filter-text">
          <div class="lab">{{ $t('compliance.admin.filterLabel') }}</div>
          <div class="desc">{{ $t('compliance.admin.filterDesc') }}</div>
        </div>
        <el-tabs v-model="statusTab" class="report-tabs" @tab-change="load">
          <el-tab-pane :label="$t('compliance.admin.tabPending')" name="pending" />
          <el-tab-pane :label="$t('compliance.admin.tabResolved')" name="resolved" />
        </el-tabs>
      </div>
    </div>

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
      <!-- 813-fq-tail-shared 战役 S：≤760px 操作列收成图标按钮（aria-label/title 保留文案），
           防止 240px 固定列在窄屏挤压、横向溢出 -->
      <el-table-column :label="$t('compliance.admin.colActions')" :width="compactActions ? 128 : 240" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <template v-if="compactActions">
              <el-button
                size="small" circle :icon="CircleCheck"
                :title="$t('compliance.admin.resolve')" :aria-label="$t('compliance.admin.resolve')"
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="resolveReport(row)"
              />
              <el-button
                v-if="row.target_type === 'artwork' && row.target_id"
                size="small" circle type="danger" plain :icon="Delete"
                :title="$t('compliance.admin.removeArtwork')" :aria-label="$t('compliance.admin.removeArtwork')"
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="removeContent('artwork', row)"
              />
              <el-button
                v-if="row.target_type === 'message' && row.target_id"
                size="small" circle type="danger" plain :icon="ChatDotRound"
                :title="$t('compliance.admin.removeMessage')" :aria-label="$t('compliance.admin.removeMessage')"
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="removeContent('message', row)"
              />
              <el-button
                v-if="row.target_type === 'artist_home' && row.target_id && !bannedArtistIds.has(Number(row.target_id))"
                size="small" circle type="warning" plain :icon="Warning"
                :title="$t('compliance.admin.ban')" :aria-label="$t('compliance.admin.ban')"
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="banArtist(row)"
              />
              <el-button
                v-else-if="row.target_type === 'artist_home' && row.target_id && bannedArtistIds.has(Number(row.target_id))"
                size="small" circle type="success" plain :icon="Unlock"
                :title="$t('compliance.admin.unban')" :aria-label="$t('compliance.admin.unban')"
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="unbanArtist(row)"
              />
            </template>
            <template v-else>
              <el-button
                size="small" type="primary" plain
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="resolveReport(row)"
              >
                {{ $t('compliance.admin.resolve') }}
              </el-button>
              <el-button
                v-if="row.target_type === 'artwork' && row.target_id"
                size="small" type="danger" plain
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="removeContent('artwork', row)"
              >
                {{ $t('compliance.admin.removeArtwork') }}
              </el-button>
              <el-button
                v-if="row.target_type === 'message' && row.target_id"
                size="small" type="danger" plain
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="removeContent('message', row)"
              >
                {{ $t('compliance.admin.removeMessage') }}
              </el-button>
              <el-button
                v-if="row.target_type === 'artist_home' && row.target_id && !bannedArtistIds.has(Number(row.target_id))"
                size="small" type="warning" plain
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="banArtist(row)"
              >
                {{ $t('compliance.admin.ban') }}
              </el-button>
              <el-button
                v-else-if="row.target_type === 'artist_home' && row.target_id && bannedArtistIds.has(Number(row.target_id))"
                size="small" type="success" plain
                :loading="pendingId === row.id" :disabled="pendingId != null"
                @click="unbanArtist(row)"
              >
                {{ $t('compliance.admin.unban') }}
              </el-button>
            </template>
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

    <!-- 815-b3-ban：封禁/解封动作级再验（对齐更换管理员 StepUpDialog 同款接线） -->
    <StepUpDialog v-model="actionStepUpVisible" @verified="onActionStepUpVerified" @cancel="onActionStepUpCancel" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { CircleCheck, Delete, ChatDotRound, Warning, Unlock } from '@element-plus/icons-vue'
import { complianceApi, adminApi } from '../../api/index.js'
import type { AdminArtistItem, ReportItem, ReportTargetType } from '../../api/types.js'
import StepUpDialog from '../../components/admin/StepUpDialog.vue'

const { t } = useI18n()

/** /admin/artists 行实际含 is_banned（AdminArtistItem 类型未声明；本地交集补齐，不做 any） */
type ArtistWithBanState = AdminArtistItem & { is_banned: number }

const statusTab = ref<'pending' | 'resolved'>('pending')
const reports = ref<ReportItem[]>([])
// 815-b3-ban：被封禁画师 id 集合（复用 /admin/artists 的 is_banned；举报行据此切换封禁/解封入口）
const bannedArtistIds = ref(new Set<number>())
const loading = ref(false)
// b3 清扫：行级操作挂起 id（prompt/请求期间按钮 loading，防重复提交）
const pendingId = ref<number | null>(null)
// 815-b3-ban：动作级再验对话框状态（提交遇 STEP_UP_REQUIRED 弹出，验证通过自动重提交）
const actionStepUpVisible = ref(false)
let pendingStepUpAction: (() => void) | null = null

// 813-fq-tail-shared 战役 S：≤760px 行操作按钮收成图标（防窄屏 240px 固定列挤压）
const compactActions = ref(window.matchMedia('(max-width: 760px)').matches)
const mqCompactActions = window.matchMedia('(max-width: 760px)')
function onCompactActionsChange(e: MediaQueryListEvent) { compactActions.value = e.matches }
onMounted(() => mqCompactActions.addEventListener('change', onCompactActionsChange))
onUnmounted(() => mqCompactActions.removeEventListener('change', onCompactActionsChange))

function typeLabel(type: ReportTargetType): string {
  return t(`compliance.report.types.${type}`)
}

async function load() {
  loading.value = true
  try {
    const [reportRows, artistRows] = await Promise.all([
      complianceApi.getReports(statusTab.value),
      // 画师列表失败不阻塞举报列表；封禁态未知时按未封禁展示（解封入口仍在画师管理页可用）
      adminApi.getArtists().catch(() => [] as never[]) as Promise<ArtistWithBanState[]>
    ])
    reports.value = reportRows
    bannedArtistIds.value = new Set(artistRows.filter(a => a.is_banned).map(a => a.id))
  } catch (err) {
    // b3 清扫：tab 切换加载失败清空旧 tab 数据，避免残留上一 tab 的举报行
    reports.value = []
    bannedArtistIds.value = new Set()
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
  if (pendingId.value != null) return
  pendingId.value = row.id
  const { cancelled, reason } = await askReason(t('compliance.admin.resolve'), t('compliance.admin.resolveConfirm'))
  if (!cancelled) {
    try {
      await complianceApi.resolveReport(row.id, reason)
      ElMessage.success(t('compliance.admin.resolvedToast'))
      await load()
    } catch (err) {
      ElMessage.error((err as { message?: string }).message)
    }
  }
  pendingId.value = null
}

/** 内容下架（artwork/message，写留痕） */
async function removeContent(type: 'artwork' | 'message', row: ReportItem) {
  if (pendingId.value != null) return
  pendingId.value = row.id
  const { cancelled, reason } = await askReason(
    type === 'artwork' ? t('compliance.admin.removeArtwork') : t('compliance.admin.removeMessage'),
    t('compliance.admin.removeConfirm')
  )
  if (!cancelled) {
    try {
      await complianceApi.removeContent(type, Number(row.target_id), reason)
      ElMessage.success(t('compliance.admin.removedToast'))
      await load()
    } catch (err) {
      ElMessage.error((err as { message?: string }).message)
    }
  }
  pendingId.value = null
}

/** 封禁画师（第一步：填写原因；第二步：必要时 StepUpDialog 升级确认后调接口） */
async function banArtist(row: ReportItem) {
  if (pendingId.value != null) return
  pendingId.value = row.id
  const { cancelled, reason } = await askReason(t('compliance.admin.ban'), t('compliance.admin.banConfirm'))
  if (!cancelled) {
    await submitBan(Number(row.target_id), reason)
    return
  }
  pendingId.value = null
}

/** 封禁提交（遇 STEP_UP_REQUIRED → 弹 StepUpDialog，验证通过后由 pendingStepUpAction 自动重提交） */
async function submitBan(artistId: number, reason: string | null) {
  try {
    await complianceApi.banArtist(artistId, reason)
    ElMessage.success(t('compliance.admin.bannedToast'))
    await load()
    pendingId.value = null
  } catch (err) {
    if ((err as { code?: string }).code === 'STEP_UP_REQUIRED') {
      pendingStepUpAction = () => submitBan(artistId, reason)
      actionStepUpVisible.value = true
      return // 保持行级 loading，验证通过后自动重提交
    }
    ElMessage.error((err as { message?: string }).message)
    pendingId.value = null
  }
}

/** 解封画师（与封禁对称：第一步填原因，第二步必要时 StepUpDialog 升级确认） */
async function unbanArtist(row: ReportItem) {
  if (pendingId.value != null) return
  pendingId.value = row.id
  const { cancelled, reason } = await askReason(t('compliance.admin.unban'), t('compliance.admin.unbanConfirm'))
  if (!cancelled) {
    await submitUnban(Number(row.target_id), reason)
    return
  }
  pendingId.value = null
}

/** 解封提交（与 submitBan 同款 step-up 接线） */
async function submitUnban(artistId: number, reason: string | null) {
  try {
    await complianceApi.unbanArtist(artistId, reason)
    ElMessage.success(t('compliance.admin.unbannedToast'))
    await load()
    pendingId.value = null
  } catch (err) {
    if ((err as { code?: string }).code === 'STEP_UP_REQUIRED') {
      pendingStepUpAction = () => submitUnban(artistId, reason)
      actionStepUpVisible.value = true
      return
    }
    ElMessage.error((err as { message?: string }).message)
    pendingId.value = null
  }
}

/** 动作级验证通过：自动重提交被 step-up 拦下的封禁/解封请求 */
function onActionStepUpVerified() {
  actionStepUpVisible.value = false
  const retry = pendingStepUpAction
  pendingStepUpAction = null
  if (retry) retry()
}

/** 取消验证：关闭对话框并释放挂起的封禁/解封请求与行级 loading */
function onActionStepUpCancel() {
  actionStepUpVisible.value = false
  pendingStepUpAction = null
  if (pendingId.value != null) pendingId.value = null
}

onMounted(load)
</script>

<style scoped>
/* 纸墨 token（admin 布局已挂 artist-tokens）；间距 4px 倍数 */
.report-manage { padding: 8px 0 32px; }
.report-filter-group { margin-bottom: 16px; }
.report-tabs { margin-bottom: 0; }
.report-table { width: 100%; }
.report-resolved-text { color: var(--ink3, #888); font-size: 13px; }
.report-empty { margin-top: 24px; }

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
.report-filter-text { min-width: 0; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
