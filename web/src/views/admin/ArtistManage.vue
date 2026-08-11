<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="page-head">
      <div>
        <h1 class="page-title font-display">{{ $t('admin.artistManage') }}</h1>
        <p class="page-sub">{{ $t('admin.artistManageSubtitle') }}</p>
      </div>
    </div>

    <!-- 操作条 -->
    <div class="action-bar">
      <span class="action-title">{{ $t('admin.artistActions') }}</span>
      <div class="action-buttons">
        <el-button type="primary" @click="dialogVisible = true">{{ $t('admin.addArtist') }}</el-button>
        <el-button type="warning" plain @click="openTransfer">{{ $t('admin.transferAdmin') }}</el-button>
        <!-- REQ-039: 邀请码管理入口 -->
        <el-button plain @click="openInviteCodes">{{ $t('invite.manageTitle') }}</el-button>
        <el-button plain @click="openRecycleBin">{{ $t('admin.recycleBin.title') }}</el-button>
      </div>
    </div>

    <el-card shadow="never" class="section-card">
      <el-table :data="artists" v-loading="loading" stripe>
        <el-table-column prop="name" :label="$t('admin.colName')" min-width="140">
          <template #default="{ row }">
            <span class="cell-name">{{ row.name }}</span>
            <el-tag v-if="row.isAdmin" type="danger" size="small" class="cell-tag">{{ $t('admin.adminTag') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" min-width="140">
          <template #default="{ row }"><code class="cell-code">{{ row.subdomain }}{{ $t('admin.domainSuffix') }}</code></template>
        </el-table-column>
        <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="120" />
        <el-table-column prop="bio" :label="$t('admin.colBio')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="$t('admin.colStatus')" width="130">
          <template #default="{ row }">
            <el-select
              v-model="row.status" size="small" style="width: 100px"
              @change="(val) => changeStatus(row, val)"
            >
              <el-option value="open" :label="$t('common.statusShort.open')" />
              <el-option value="full" :label="$t('common.statusShort.full')" />
              <el-option value="break" :label="$t('common.statusShort.break')" />
              <el-option value="hidden" :label="$t('common.statusShort.hidden')" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.actions')" width="360" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button size="small" type="primary" @click="openDetail(row)">{{ $t('admin.manage') }}</el-button>
              <el-button size="small" @click="viewOrders(row)">{{ $t('admin.artistOrders') }}</el-button>
              <!-- REQ-027: TOTP 绑定入口 -->
              <el-button size="small" type="success" plain @click="openTotpBind(row)">
                {{ row.totp_verified ? $t('admin.totpRebind') : $t('admin.totpBind') }}
              </el-button>
              <el-button size="small" type="danger" plain @click="remove(row)" :disabled="row.isAdmin">{{ $t('common.remove') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加画师弹窗 -->
    <el-dialog v-model="dialogVisible" :title="$t('admin.addTitle')" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="$t('admin.qqLabel')" required>
          <el-input v-model="form.qqNumber" :placeholder="$t('admin.qqPlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.nameLabel')" required>
          <el-input v-model="form.name" :placeholder="$t('admin.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('admin.subdomainLabel')" required>
          <el-input v-model="form.subdomain" :placeholder="$t('admin.subdomainPlaceholder')">
            <template #append>{{ $t('admin.domainSuffix') }}</template>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('admin.codeLabel')">
          <el-input v-model="form.artistCode" :placeholder="$t('admin.codePlaceholder')" maxlength="10" />
        </el-form-item>
        <el-form-item :label="$t('admin.bioLabel')">
          <el-input v-model="form.bio" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addArtist" :loading="saving">{{ $t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- 订单记录弹窗 -->
    <el-dialog v-model="ordersVisible" :title="`${ordersArtist?.name} - ${$t('admin.artistOrders')}`" width="700px">
      <el-table :data="orders" v-loading="ordersLoading" stripe max-height="400" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="order-expand-pay">
              <!-- B7: 付款进度摘要 -->
              <div class="expand-pay-summary" v-if="row.final_price_cents != null || row.finalPriceCents != null">
                <span>{{ $t('admin.payPaid') }} <strong>¥{{ formatCents(row.paidTotalCents ?? row.paid_total_cents ?? 0) }}</strong></span>
                <span>/ {{ $t('admin.payFinal') }} <strong>¥{{ formatCents(row.finalPriceCents ?? row.final_price_cents ?? 0) }}</strong></span>
                <span>{{ $t('admin.payRemaining') }} <strong>¥{{ formatCents(Math.max(0, (row.finalPriceCents ?? row.final_price_cents ?? 0) - (row.paidTotalCents ?? row.paid_total_cents ?? 0))) }}</strong></span>
              </div>
              <!-- 分期三态参考 -->
              <div class="expand-pay-insts" v-if="row.installments?.length">
                <div v-for="(inst, idx) in row.installments" :key="idx" class="expand-inst-row">
                  <span>{{ inst.status === 'paid' ? '✓' : inst.status === 'partial' ? '◐' : '○' }}</span>
                  <span>{{ inst.name }}</span>
                  <span>¥{{ formatCents(inst.amountCents || inst.amount_cents || 0) }}</span>
                  <el-tag :type="inst.status === 'paid' ? 'success' : inst.status === 'partial' ? 'warning' : 'info'" size="small">
                    {{ inst.status === 'paid' ? $t('admin.payRefPaid') : inst.status === 'partial' ? $t('admin.payRefPartial') : $t('admin.payRefPending') }}
                  </el-tag>
                </div>
              </div>
              <p v-else class="expand-no-data">{{ $t('admin.payNoData') }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="order_no" :label="$t('admin.orderColNo')" width="120" />
        <el-table-column prop="client_qq" :label="$t('admin.orderColQq')" width="120" />
        <el-table-column prop="tier_name" :label="$t('admin.orderColType')" width="100">
          <template #default="{ row }">{{ row.tier_name || $t('common.custom') }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.orderColStatus')" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ $t(`common.orderStatus.${row.status}`) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="$t('admin.orderColTime')">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!ordersLoading && orders.length === 0" :description="$t('admin.noOrders')" :image-size="60" />
    </el-dialog>

    <!-- 更换管理员弹窗（两步 TOTP 验证，REQ-027） -->
    <el-dialog v-model="transferVisible" :title="$t('admin.transferTitle')" width="450px" :close-on-click-modal="false">
      <!-- 步骤1：验证当前管理员 -->
      <div v-if="transferStep === 1">
        <h4 class="dialog-h4">{{ $t('admin.transferStep1Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.currentAdminQq')">
            <el-input :model-value="currentAdminQq" disabled />
          </el-form-item>
          <el-form-item :label="$t('admin.totpCodeLabel')">
            <el-input v-model="currentCode" maxlength="6" :placeholder="$t('admin.totpCodePlaceholder')" />
          </el-form-item>
          <p class="transfer-hint">{{ $t('admin.transferTotpHint') }}</p>
        </el-form>
      </div>

      <!-- 步骤2：验证新管理员 -->
      <div v-else>
        <h4 class="dialog-h4">{{ $t('admin.transferStep2Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.newAdminQq')">
            <el-input v-model="newQq" :placeholder="$t('admin.newAdminQqPlaceholder')" />
          </el-form-item>
          <el-form-item :label="$t('admin.totpCodeLabel')">
            <el-input v-model="newCode" maxlength="6" :placeholder="$t('admin.totpCodePlaceholder')" />
          </el-form-item>
          <p class="transfer-hint">{{ $t('admin.transferTotpHint') }}</p>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="transferVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button v-if="transferStep === 1" type="primary" :disabled="!currentCode" @click="transferStep = 2">
          {{ $t('admin.nextStep') }}
        </el-button>
        <el-button v-else type="primary" :disabled="!newCode" @click="confirmTransfer" :loading="transferring">
          {{ $t('admin.confirmTransfer') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- REQ-041 集成接线：更换管理员动作级再验（提交遇 STEP_UP_REQUIRED 弹窗，验证通过自动重提交） -->
    <StepUpDialog v-model="actionStepUpVisible" @verified="onActionStepUpVerified" @cancel="actionStepUpVisible = false" />

    <!-- TOTP 绑定弹窗（REQ-027 R2：管理员协助画师扫码绑定） -->
    <el-dialog v-model="totpVisible" :title="$t('admin.totpBindTitle', { name: totpArtist?.name || '' })" width="420px" :close-on-click-modal="false">
      <div v-loading="totpLoading">
        <p class="totp-step">{{ $t('admin.totpStep1') }}</p>
        <div class="totp-qr-wrap">
          <img v-if="totpQr" :src="totpQr" alt="TOTP QR" class="totp-qr" />
          <el-button v-else text type="primary" @click="genTotpQr">{{ $t('admin.totpRegenerate') }}</el-button>
        </div>
        <p class="totp-step">{{ $t('admin.totpStep2') }}</p>
        <el-input
          v-model="totpCode" maxlength="6" size="large"
          :placeholder="$t('admin.totpCodePlaceholder')" @keyup.enter="confirmTotpBind"
        />
        <p class="totp-hint">{{ $t('admin.totpRegenerateHint') }}</p>
      </div>
      <template #footer>
        <el-button @click="totpVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="danger" plain :loading="totpLoading" @click="resetTotpBind">
          {{ $t('admin.totpReset') }}
        </el-button>
        <el-button @click="genTotpQr" :loading="totpLoading">{{ $t('admin.totpRegenerate') }}</el-button>
        <el-button type="primary" :disabled="!totpCode" @click="confirmTotpBind" :loading="totpLoading">
          {{ $t('admin.totpBindConfirm') }}
        </el-button>
      </template>
    </el-dialog>
    <!-- 画师详情抽屉 -->
    <!-- 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） -->
    <el-dialog v-model="recycleVisible" :title="$t('admin.recycleBin.title')" width="720px" :close-on-click-modal="false">
      <div class="recycle-body">
        <el-table v-if="recycleLoading || recycleItems.length > 0" :data="recycleItems" v-loading="recycleLoading" stripe max-height="420">
          <el-table-column prop="fileName" :label="$t('admin.recycleBin.colFile')" min-width="160" show-overflow-tooltip />
          <el-table-column prop="originalPath" :label="$t('admin.recycleBin.colPath')" min-width="180" show-overflow-tooltip />
          <el-table-column :label="$t('admin.recycleBin.colSize')" width="90">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.recycleBin.colMovedAt')" width="160">
            <template #default="{ row }">{{ formatDateTime(row.movedAt) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="$t('admin.recycleBin.emptyHint')" />
        <!-- REQ-022 F4: 分页（每页 20 条） -->
        <div v-if="recycleTotal > 0" class="pager">
          <el-pagination
            v-model:current-page="recyclePage"
            :page-size="recyclePageSize"
            :total="recycleTotal"
            layout="total, prev, pager, next"
            @current-change="loadRecycleBin"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="recycleVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button v-if="recycleTotal > 0" type="danger" plain :loading="emptying" @click="handleEmptyRecycleBin">
          {{ $t('admin.recycleBin.empty') }}
        </el-button>
      </template>
    </el-dialog>

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
            <el-form-item class="invite-form-action">
              <el-button type="primary" :loading="inviteGenerating" @click="generateInviteCodes">
                {{ $t('invite.generateBtn') }}
              </el-button>
            </el-form-item>
          </el-form>
          <p class="invite-hint">{{ $t('invite.manageHint') }}</p>
        </div>

        <CardHead :title="$t('invite.colCode')" />
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
              <el-tag :type="inviteStatusType(row.status)" size="small">
                {{ $t(`invite.status${row.status[0].toUpperCase()}${row.status.slice(1)}`) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('invite.colExpires')" width="180">
            <template #default="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
          </el-table-column>
          <el-table-column :label="$t('invite.colUsedBy')" min-width="130">
            <template #default="{ row }">
              <span v-if="row.usedBy">{{ row.usedBy.name || row.usedBy.qqNumber }}</span>
              <span v-else class="invite-unused">—</span>
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
      </div>
    </el-dialog>

    <ArtistDetailDrawer v-model="detailVisible" :artist="detailArtist" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistDetailDrawer from './ArtistDetailDrawer.vue'
// REQ-041 集成接线：更换管理员动作级再验对话框（后端 requireAdminReauth 已就位）
import StepUpDialog from '../../components/admin/StepUpDialog.vue'
// REQ-039: 纸墨卡片头（管理弹窗内分组标题）
import CardHead from '../../components/artist/visual/CardHead.vue'

const { t } = useI18n()
const artists = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })

// ─── REQ-039: 邀请码管理 ───
const inviteVisible = ref(false)
const inviteCodes = ref([])
const inviteLoading = ref(false)
const inviteGenerating = ref(false)
const inviteCount = ref(5)
const inviteValidDays = ref(3)

function inviteStatusType(status) {
  return { unused: 'success', used: 'info', revoked: 'danger' }[status] || 'info'
}

async function openInviteCodes() {
  inviteVisible.value = true
  await loadInviteCodes()
}

async function loadInviteCodes() {
  inviteLoading.value = true
  try {
    const res = await adminApi.getInviteCodes()
    inviteCodes.value = res.codes || []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    inviteLoading.value = false
  }
}

async function generateInviteCodes() {
  if (!inviteCount.value || inviteCount.value < 1 || inviteCount.value > 50) {
    return ElMessage.warning(t('invite.countHint'))
  }
  if (!inviteValidDays.value || inviteValidDays.value < 1 || inviteValidDays.value > 30) {
    return ElMessage.warning(t('invite.validDaysHint'))
  }
  inviteGenerating.value = true
  try {
    const res = await adminApi.generateInviteCodes({
      count: inviteCount.value,
      validDays: inviteValidDays.value
    })
    ElMessage.success(t('invite.generated', { count: res.codes.length }))
    await loadInviteCodes()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    inviteGenerating.value = false
  }
}

async function copyInviteCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('invite.copied'))
  } catch { /* 剪贴板受限时静默（非关键路径） */ }
}

async function revokeInviteCode(row) {
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
    ElMessage.error(err.message)
  }
}

// 画师详情抽屉
const detailVisible = ref(false)
const detailArtist = ref(null)
function openDetail(row) {
  detailArtist.value = row
  detailVisible.value = true
}

import { ARTIST_STATUS_TYPE } from '../../constants/order.js'
import { formatDateTime } from '../../utils/datetime.js'
import { formatCents } from '../../utils/money.js'

const statusType = (s) => ARTIST_STATUS_TYPE[s] || 'info'

/** 金额分 → 元（B7 行展开始用） */
// 订单弹窗
const ordersVisible = ref(false)
const ordersLoading = ref(false)
const ordersArtist = ref(null)
const orders = ref([])

// 更换管理员（REQ-027: 双 TOTP 动态码）
const transferVisible = ref(false)
const transferStep = ref(1)
const currentAdminQq = ref('')
const currentCode = ref('')
const newQq = ref('')
const newCode = ref('')
const transferring = ref(false)

async function loadArtists() {
  loading.value = true
  try {
    artists.value = await adminApi.getArtists()
    const admin = artists.value.find(a => a.isAdmin)
    if (admin) currentAdminQq.value = admin.qq_number
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function addArtist() {
  if (!form.qqNumber || !form.name || !form.subdomain) {
    return ElMessage.warning(t('admin.requiredFields'))
  }
  saving.value = true
  try {
    await adminApi.createArtist({
      qqNumber: form.qqNumber.trim(),
      name: form.name.trim(),
      subdomain: form.subdomain.trim().toLowerCase(),
      bio: form.bio.trim(),
      artistCode: form.artistCode.trim() || undefined
    })
    ElMessage.success(t('admin.added'))
    dialogVisible.value = false
    Object.assign(form, { qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })
    await loadArtists()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      t('admin.confirmRemove', { name: row.name }),
      t('admin.confirmRemoveTitle'), { type: 'error', confirmButtonText: t('admin.confirmRemoveBtn') }
    )
    await adminApi.deleteArtist(row.id)
    ElMessage.success(t('common.removed'))
    await loadArtists()
  } catch { /* cancelled */ }
}

async function changeStatus(row, status) {
  try {
    await adminApi.updateArtistStatus(row.id, status)
    ElMessage.success(t('admin.statusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
    await loadArtists()
  }
}

async function viewOrders(row) {
  ordersArtist.value = row
  ordersVisible.value = true
  ordersLoading.value = true
  try {
    const res = await adminApi.getArtistOrders(row.id)
    orders.value = res.items ?? res
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    ordersLoading.value = false
  }
}

// ─── 更换管理员（REQ-027: 双 TOTP 动态码验证） ───

// ─── 回收站（从主页迁入：孤儿文件可恢复；REQ-022 F4 分页） ───
const recycleVisible = ref(false)
const recycleItems = ref([])
const recycleLoading = ref(false)
const emptying = ref(false)
const recyclePage = ref(1)
const recyclePageSize = 20
const recycleTotal = ref(0)

async function openRecycleBin() {
  recyclePage.value = 1
  recycleVisible.value = true
  await loadRecycleBin()
}

async function loadRecycleBin() {
  recycleLoading.value = true
  try {
    const res = await adminApi.getRecycleBin({ page: recyclePage.value, pageSize: recyclePageSize })
    recycleItems.value = res.items || []
    recycleTotal.value = res.total || 0
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    recycleLoading.value = false
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function handleEmptyRecycleBin() {
  try {
    await ElMessageBox.confirm(
      t('admin.recycleBin.emptyConfirm'),
      t('admin.recycleBin.emptyTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  emptying.value = true
  try {
    const res = await adminApi.emptyRecycleBin()
    ElMessage.success(t('admin.recycleBin.emptied', { n: res.deleted }))
    // REQ-022 F4: 清空后回到第 1 页并刷新
    recyclePage.value = 1
    await loadRecycleBin()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    emptying.value = false
  }
}
function openTransfer() {
  transferStep.value = 1
  currentCode.value = ''
  newQq.value = ''
  newCode.value = ''
  transferVisible.value = true
}

// REQ-041 集成接线：动作级再验对话框状态（仅更换管理员提交链路使用，与 AdminLayout 入口级守卫互不干扰）
const actionStepUpVisible = ref(false)

async function confirmTransfer() {
  transferring.value = true
  try {
    const res = await adminApi.transferAdmin({
      newQq: newQq.value.trim(),
      currentCode: currentCode.value.trim(),
      newCode: newCode.value.trim()
    })
    ElMessage.success(t('admin.transferSuccess', { name: res.newAdminName }))
    transferVisible.value = false
    await loadArtists()
  } catch (err) {
    // 动作级再验：刚验证过（≤60s）才放行；否则弹 StepUpDialog，验证通过后自动重提交
    if (err && err.code === 'STEP_UP_REQUIRED') {
      actionStepUpVisible.value = true
      return
    }
    ElMessage.error(err.message)
  } finally {
    transferring.value = false
  }
}

/** 动作级验证通过：admin_verified_at 刚刷新（满足 ≤60s 窗口），自动重提交更换管理员 */
function onActionStepUpVerified() {
  actionStepUpVisible.value = false
  confirmTransfer()
}

// ─── TOTP 绑定/重置（REQ-027 R2/R5） ───
const totpVisible = ref(false)
const totpArtist = ref(null)
const totpQr = ref('')
const totpCode = ref('')
const totpLoading = ref(false)

async function openTotpBind(row) {
  totpArtist.value = row
  totpCode.value = ''
  totpQr.value = ''
  totpVisible.value = true
  await genTotpQr()
}

/** 生成/重新生成绑定二维码（覆盖旧密钥，旧 App 绑定立即失效） */
async function genTotpQr() {
  if (!totpArtist.value) return
  totpLoading.value = true
  try {
    const res = await adminApi.totpBindInit(totpArtist.value.id)
    totpQr.value = res.qrDataUrl
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    totpLoading.value = false
  }
}

/** 输入画师报的 6 位码，完成绑定 */
async function confirmTotpBind() {
  if (!totpCode.value.trim()) return
  totpLoading.value = true
  try {
    await adminApi.totpBindConfirm(totpArtist.value.id, totpCode.value.trim())
    ElMessage.success(t('admin.totpBindSuccess'))
    totpVisible.value = false
    await loadArtists()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    totpLoading.value = false
  }
}

/** R5 恢复方案：重置绑定，旧密钥立即失效，画师须重新绑定才能登录 */
async function resetTotpBind() {
  if (!totpArtist.value) return
  try {
    await ElMessageBox.confirm(
      t('admin.totpResetConfirm', { name: totpArtist.value.name }),
      t('admin.confirmRemoveTitle'), { type: 'warning', confirmButtonText: t('admin.totpReset') }
    )
  } catch { return }
  totpLoading.value = true
  try {
    await adminApi.totpReset(totpArtist.value.id)
    ElMessage.success(t('admin.totpResetSuccess'))
    totpVisible.value = false
    await loadArtists()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    totpLoading.value = false
  }
}

onMounted(loadArtists)
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

/* 页头 */
.page-head { margin-bottom: var(--sp-5, 24px); }
.page-title {
  font-size: var(--fs-page-title, 26px);
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 var(--sp-1, 4px);
  letter-spacing: .02em;
}
.page-sub { margin: 0; font-size: var(--fs-aux, 12.5px); color: var(--ink3); }

/* 操作条 */
.action-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--sp-3, 12px); flex-wrap: wrap;
  margin-bottom: var(--sp-4, 16px);
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-l, 11px);
}
.action-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }
.action-buttons { display: flex; gap: var(--sp-2, 8px); flex-wrap: wrap; }

.section-card { border-radius: var(--r-l, 11px); border: 1px solid var(--line); }
.cell-name { font-weight: 600; color: var(--ink); }
.cell-tag { margin-left: var(--sp-1, 4px); }
.cell-code { font-size: 12px; color: var(--ink2); background: var(--paper2); padding: 1px 6px; border-radius: var(--r-s, 4px); }

/* 行操作按钮组（统一间距） */
.row-actions { display: flex; gap: var(--sp-1, 4px); flex-wrap: nowrap; }
/* 回收站分页 */
.pager { display: flex; justify-content: flex-end; margin-top: var(--sp-4, 16px); }

/* B7: 订单行展开——收款摘要 */
.order-expand-pay { padding: 8px 16px; }
.expand-pay-summary { display: flex; gap: 12px; font-size: 13px; color: var(--ink2); margin-bottom: 8px; flex-wrap: wrap; }
.expand-pay-summary strong { color: var(--ink); }
.expand-inst-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px; }
.expand-no-data { font-size: 12px; color: var(--ink3); margin: 4px 0; }
/* REQ-027: TOTP 绑定弹窗 + transfer 提示 */
.dialog-h4 { margin: 0 0 var(--sp-3, 12px); font-size: var(--fs-body, 14px); color: var(--ink); }
.totp-qr-wrap { display: flex; justify-content: center; margin: 12px 0 4px; }
.totp-qr { width: 200px; height: 200px; border: 1px solid var(--line); border-radius: var(--r-m); }
.totp-step { font-size: 13px; color: var(--ink); margin: 8px 0; }
.totp-hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }
.transfer-hint { font-size: 12px; color: var(--ink2); margin: 0; }
/* ─── REQ-039: 邀请码弹窗（纸墨 token） ─── */
.invite-body { display: flex; flex-direction: column; gap: 12px; }
.invite-gen {
  padding: 12px 14px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-m, 8px);
}
.invite-form { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.invite-form :deep(.el-form-item) { margin-bottom: 0; }
.invite-form-hint { display: block; font-size: 11px; color: var(--ink3); margin-top: 4px; }
.invite-form-action { margin-left: auto; }
.invite-hint { font-size: 12px; color: var(--ink2); margin: 8px 0 0; line-height: 1.6; }
.invite-code {
  font-family: var(--f-mono, ui-monospace, monospace);
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--paper2);
  padding: 2px 6px;
  border-radius: var(--r-s, 4px);
}
.invite-copy { margin-left: 8px; }
.invite-unused { color: var(--ink3); }
</style>
