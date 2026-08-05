<template>
  <div class="admin-page">
    <div style="display: flex; gap: 12px; margin-bottom: 16px">
      <el-button type="primary" @click="dialogVisible = true">{{ $t('admin.addArtist') }}</el-button>
      <el-button type="warning" @click="openTransfer">{{ $t('admin.transferAdmin') }}</el-button>
    </div>

    <el-table :data="artists" v-loading="loading" stripe>
      <el-table-column prop="name" :label="$t('admin.colName')" width="120">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.isAdmin" type="danger" size="small" style="margin-left: 4px">{{ $t('admin.adminTag') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="subdomain" :label="$t('admin.colSubdomain')" width="120">
        <template #default="{ row }">{{ row.subdomain }}{{ $t('admin.domainSuffix') }}</template>
      </el-table-column>
      <el-table-column prop="qq_number" :label="$t('admin.colQq')" width="120" />
      <el-table-column prop="bio" :label="$t('admin.colBio')" />
      <el-table-column :label="$t('admin.colStatus')" width="130">
        <template #default="{ row }">
          <el-select
            v-model="row.status" size="small" style="width: 100px"
            @change="(val) => changeStatus(row, val)" :disabled="row.isAdmin"
          >
            <el-option value="open" :label="$t('common.statusShort.open')" />
            <el-option value="full" :label="$t('common.statusShort.full')" />
            <el-option value="break" :label="$t('common.statusShort.break')" />
            <el-option value="hidden" :label="$t('common.statusShort.hidden')" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="340" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openDetail(row)">{{ $t('admin.manage') }}</el-button>
          <el-button size="small" @click="viewOrders(row)">{{ $t('admin.artistOrders') }}</el-button>
          <!-- REQ-027: TOTP 绑定入口 -->
          <el-button size="small" type="success" @click="openTotpBind(row)">
            {{ row.totp_verified ? $t('admin.totpRebind') : $t('admin.totpBind') }}
          </el-button>
          <el-button size="small" type="danger" @click="remove(row)" :disabled="row.isAdmin">{{ $t('common.remove') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

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
        <h4 style="margin-bottom: 12px">{{ $t('admin.transferStep1Title') }}</h4>
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
        <h4 style="margin-bottom: 12px">{{ $t('admin.transferStep2Title') }}</h4>
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
    <ArtistDetailDrawer v-model="detailVisible" :artist="detailArtist" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistDetailDrawer from './ArtistDetailDrawer.vue'

const { t } = useI18n()
const artists = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })

// 画师详情抽屉
const detailVisible = ref(false)
const detailArtist = ref(null)
function openDetail(row) {
  detailArtist.value = row
  detailVisible.value = true
}

import { ARTIST_STATUS_TYPE } from '../../constants/order.js'
import { formatDateTime } from '../../utils/datetime.js'

const statusType = (s) => ARTIST_STATUS_TYPE[s] || 'info'

/** 金额分 → 元（B7 行展开始用） */
function formatCents(cents) {
  return ((cents || 0) / 100).toFixed(2)
}

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
function openTransfer() {
  transferStep.value = 1
  currentCode.value = ''
  newQq.value = ''
  newCode.value = ''
  transferVisible.value = true
}

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
    ElMessage.error(err.message)
  } finally {
    transferring.value = false
  }
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
.admin-page { /* 容器由 AdminLayout 提供 */ }
/* B7: 订单行展开——收款摘要 */
.order-expand-pay { padding: 8px 16px; }
/* v0.38 第二批: 纸墨 token（REQ-026，管理后台从简） */
.expand-pay-summary { display: flex; gap: 12px; font-size: 13px; color: var(--ink2); margin-bottom: 8px; flex-wrap: wrap; }
.expand-pay-summary strong { color: var(--ink); }
.expand-inst-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px; }
.expand-no-data { font-size: 12px; color: var(--ink3); margin: 4px 0; }
/* REQ-027: TOTP 绑定弹窗 + transfer 提示 */
.totp-qr-wrap { display: flex; justify-content: center; margin: 12px 0 4px; }
.totp-qr { width: 200px; height: 200px; border: 1px solid var(--line); border-radius: var(--r-m); }
.totp-step { font-size: 13px; color: var(--ink); margin: 8px 0; }
.totp-hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }
.transfer-hint { font-size: 12px; color: var(--ink2); margin: 0; }
</style>
