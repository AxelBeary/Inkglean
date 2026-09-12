<template>
  <!-- REQ-039: 邀请码管理弹窗（生成/列表/复制/吊销；纸墨 token + CardHead） -->
  <el-dialog v-model="inviteVisible" :title="$t('invite.manageTitle')" width="760px" :close-on-click-modal="false">
    <div class="invite-body">
      <CardHead :title="$t('invite.generateTitle')" />
      <div class="invite-gen">
        <el-form inline label-position="top" class="invite-form">
          <el-form-item :label="$t('invite.countLabel')">
            <el-input-number v-model="inviteCount" :min="1" :max="50" controls-position="right" />
            <span class="invite-form-hint">{{ $t('invite.countHint') }}</span>
          </el-form-item>
          <el-form-item :label="$t('invite.validDaysLabel')">
            <el-input-number v-model="inviteValidDays" :min="1" :max="30" controls-position="right" />
            <span class="invite-form-hint">{{ $t('invite.validDaysHint') }}</span>
          </el-form-item>
          <el-form-item :label="$t('invite.maxUsesLabel')">
            <el-input-number v-model="inviteMaxUses" :min="1" :max="100" controls-position="right" />
            <span class="invite-form-hint">{{ $t('invite.maxUsesHint') }}</span>
          </el-form-item>
          <el-form-item class="invite-form-action">
            <el-button type="primary" :loading="inviteGenerating" @click="generateInviteCodes">
              {{ $t('invite.generateBtn') }}
            </el-button>
          </el-form-item>
        </el-form>
        <p class="invite-hint">{{ $t('invite.manageHint') }}</p>
      </div>

      <CardHead :title="$t('invite.colCode')" />
      <!-- 服务端筛选栏：状态下拉 + 码搜索（任一变更回第 1 页重拉） -->
      <div class="invite-filter">
        <el-select v-model="inviteStatusFilter" style="width: 130px" @change="onInviteFilterChange">
          <el-option value="all" :label="$t('invite.statusAll')" />
          <el-option value="unused" :label="$t('invite.statusUnused')" />
          <el-option value="used" :label="$t('invite.statusUsed')" />
          <el-option value="expired" :label="$t('invite.statusExpired')" />
          <el-option value="revoked" :label="$t('invite.statusRevoked')" />
        </el-select>
        <el-input
          v-model="inviteQuery"
          :placeholder="$t('invite.searchPlaceholder')"
          clearable
          prefix-icon="Search"
          class="invite-search-input"
          @change="onInviteFilterChange"
        />
      </div>
      <el-table :data="inviteCodes" v-loading="inviteLoading" stripe max-height="420">
        <el-table-column :label="$t('invite.colCode')" min-width="170">
          <template #default="{ row }">
            <code class="invite-code">{{ row.code }}</code>
            <el-button
              v-if="row.status === 'unused'" size="small" text type="primary"
              class="invite-copy" @click="copyInviteCode(row.code)"
            >
              {{ $t('invite.copy') }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column :label="$t('invite.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="inviteStatusType(row)" size="small">
              {{ $t(inviteStatusLabelKey(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('invite.colExpires')" width="180">
          <template #default="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
        </el-table-column>
        <el-table-column :label="$t('invite.colUsage')" min-width="140">
          <template #default="{ row }">
            <!-- 多次码：已用 N/M 可点开使用记录；单次码保持显示使用人 -->
            <el-button
              v-if="row.maxUses > 1" size="small" text type="primary"
              @click="openInviteUses(row)"
            >
              {{ $t('invite.usedCount', { used: row.useCount, max: row.maxUses }) }}
            </el-button>
            <template v-else>
              <span v-if="row.usedBy">{{ row.usedBy.name || row.usedBy.qqNumber }}</span>
              <span v-else class="invite-unused">—</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="$t('invite.colActions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'unused'" size="small" type="danger" plain
              @click="revokeInviteCode(row)"
            >
              {{ $t('invite.revoke') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!inviteLoading && inviteCodes.length === 0" :description="$t('invite.empty')" :image-size="60" />
      <!-- 服务端分页（默认 20/页） -->
      <div v-if="inviteTotal > 0" class="pager">
        <el-pagination
          v-model:current-page="invitePage"
          :page-size="invitePageSize"
          :total="inviteTotal"
          layout="total, prev, pager, next"
          @current-change="loadInviteCodes"
        />
      </div>
    </div>
  </el-dialog>

  <!-- 邀请码使用记录子弹窗（多次码；倒序最近在前） -->
  <el-dialog v-model="inviteUsesVisible" :title="$t('invite.usesTitle')" width="560px" append-to-body>
    <el-table v-if="inviteUsesLoading || inviteUses.length > 0" :data="inviteUses" v-loading="inviteUsesLoading" stripe max-height="360">
      <el-table-column :label="$t('invite.usesColName')" min-width="120">
        <template #default="{ row }">{{ row.name || '—' }}</template>
      </el-table-column>
      <el-table-column :label="$t('invite.usesColQq')" width="130">
        <template #default="{ row }">{{ row.qqNumber || '—' }}</template>
      </el-table-column>
      <el-table-column :label="$t('invite.usesColTime')" width="180">
        <template #default="{ row }">{{ formatDateTime(row.usedAt) }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-else :description="$t('invite.usesEmpty')" :image-size="60" />
  </el-dialog>
</template>

<script setup lang="ts">
// F-09 巨型文件拆分：自 views/admin/ArtistManage.vue 整体搬入（REQ-039 邀请码管理弹窗 + 使用记录子弹窗），
// 模板/文案键/样式取值一字未改；ALLOWLIST 注释点名的「后续可拆弹窗组件瘦身」即此文件。
import { ref } from 'vue'
import { adminApi } from '../../../api/index'
import type { AdminInviteCode, InviteCodeUse } from '../../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
// REQ-039: 纸墨卡片头（管理弹窗内分组标题）
import CardHead from '../../artist/visual/CardHead.vue'
import { formatDateTime } from '../../../utils/datetime'

const { t } = useI18n()
const inviteVisible = defineModel({ type: Boolean, default: false })

// ─── REQ-039: 邀请码管理（多次使用码 + 服务端分页/筛选） ───
const inviteCodes = ref<AdminInviteCode[]>([])
const inviteLoading = ref(false)
const inviteGenerating = ref(false)
const inviteCount = ref(5)
const inviteValidDays = ref(3)
/** 每码可用次数（1=一次性，1-100） */
const inviteMaxUses = ref(1)
// 服务端筛选/分页状态（'all' 哨兵值：el-select 空串值不渲染选项文案会退化成「请选择」占位）
const inviteStatusFilter = ref<'all' | 'unused' | 'used' | 'expired' | 'revoked'>('all')
const inviteQuery = ref('')
const invitePage = ref(1)
const invitePageSize = 20
const inviteTotal = ref(0)
// 使用记录子弹窗（多次码）
const inviteUsesVisible = ref(false)
const inviteUsesLoading = ref(false)
const inviteUses = ref<InviteCodeUse[]>([])

/** status 仍 unused 但已到期 → 展示为 expired（与后端筛选口径一致） */
function inviteDisplayStatus(row: AdminInviteCode): string {
  if (row.status === 'unused' && row.expired) return 'expired'
  return row.status
}
function inviteStatusType(row: AdminInviteCode) {
  return ({ unused: 'success', used: 'info', revoked: 'danger', expired: 'info' } as Record<string, string>)[inviteDisplayStatus(row)] || 'info'
}
function inviteStatusLabelKey(row: AdminInviteCode) {
  const s = inviteDisplayStatus(row)
  return `invite.status${s[0].toUpperCase()}${s.slice(1)}`
}

/** 打开弹窗：原函数体逐字搬入（置显 + 回第 1 页重拉，不缓存上次结果）。
 *  父页入口经 ref 委派调用本函数（ArtistManage.vue: inviteDialogRef），故同时 defineExpose；
 *  单一触发路径，不设 watch 旁路、不复制逻辑。 */
async function openInviteCodes() {
  inviteVisible.value = true
  invitePage.value = 1
  await loadInviteCodes()
}

defineExpose({ openInviteCodes })

async function loadInviteCodes() {
  inviteLoading.value = true
  try {
    const res = await adminApi.getInviteCodes({
      status: inviteStatusFilter.value === 'all' ? undefined : inviteStatusFilter.value,
      q: inviteQuery.value.trim() || undefined,
      page: invitePage.value,
      pageSize: invitePageSize
    })
    inviteCodes.value = res.codes || []
    inviteTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteLoading.value = false
  }
}

/** 筛选（状态/搜索）任一变更：回第 1 页重拉 */
function onInviteFilterChange() {
  invitePage.value = 1
  loadInviteCodes()
}

async function generateInviteCodes() {
  if (!inviteCount.value || inviteCount.value < 1 || inviteCount.value > 50) {
    return ElMessage.warning(t('invite.countHint'))
  }
  if (!inviteValidDays.value || inviteValidDays.value < 1 || inviteValidDays.value > 30) {
    return ElMessage.warning(t('invite.validDaysHint'))
  }
  if (!inviteMaxUses.value || inviteMaxUses.value < 1 || inviteMaxUses.value > 100) {
    return ElMessage.warning(t('invite.maxUsesHint'))
  }
  inviteGenerating.value = true
  try {
    const res = await adminApi.generateInviteCodes({
      count: inviteCount.value,
      validDays: inviteValidDays.value,
      maxUses: inviteMaxUses.value
    })
    ElMessage.success(t('invite.generated', { count: res.codes.length }))
    await loadInviteCodes()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteGenerating.value = false
  }
}

/** 打开多次码使用记录子弹窗（倒序，最近在前） */
async function openInviteUses(row: AdminInviteCode) {
  inviteUses.value = []
  inviteUsesVisible.value = true
  inviteUsesLoading.value = true
  try {
    const res = await adminApi.getInviteCodeUses(row.id)
    inviteUses.value = res.uses || []
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    inviteUsesLoading.value = false
  }
}

async function copyInviteCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('invite.copied'))
  } catch { /* 剪贴板受限时静默（非关键路径） */ }
}

async function revokeInviteCode(row: AdminInviteCode) {
  try {
    await ElMessageBox.confirm(
      t('invite.revokeConfirm', { code: row.code }),
      t('invite.revoke'),
      { type: 'warning', confirmButtonText: t('invite.revoke'), cancelButtonText: t('common.cancel') }
    )
  } catch { /* 取消 */ return }
  try {
    await adminApi.revokeInviteCode(row.id)
    ElMessage.success(t('invite.revoked'))
    await loadInviteCodes()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}
</script>

<style scoped>
/* 分页行（随弹窗搬入，取值与 ArtistManage.vue 同源） */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }

/* ─── REQ-039: 邀请码弹窗（纸墨 token） ─── */
.invite-body { display: flex; flex-direction: column; gap: 12px; }
.invite-gen {
  padding: 12px 16px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
}
.invite-form { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.invite-form :deep(.el-form-item) { margin-bottom: 0; }
.invite-form-hint { display: block; font-size: 11px; color: var(--ink3); margin-top: 4px; }
.invite-form-action { margin-left: auto; }
.invite-hint { font-size: 12px; color: var(--ink2); margin: 8px 0 0; line-height: 1.6; }
.invite-filter { display: flex; align-items: center; gap: var(--sp-2, 8px); flex-wrap: wrap; }
.invite-search-input { width: 220px; flex: none; }
.invite-code {
  font-family: var(--f-mono, ui-monospace, monospace);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--paper2);
  padding: 4px 8px;
  border-radius: var(--r-s);
}
.invite-copy { margin-left: 8px; }
.invite-unused { color: var(--ink3); }

@media (max-width: 720px) {
  .invite-search-input { width: 100%; }
}
</style>
