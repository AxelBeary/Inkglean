<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToPanel')" :content="$t('admin.artistManage')" />

    <div style="display: flex; gap: 12px; margin: 16px 0">
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
          <el-select v-model="row.status" size="small" style="width: 100px"
            @change="(val) => changeStatus(row, val)" :disabled="row.isAdmin">
            <el-option value="open" :label="$t('common.statusShort.open')" />
            <el-option value="full" :label="$t('common.statusShort.full')" />
            <el-option value="break" :label="$t('common.statusShort.break')" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewOrders(row)">{{ $t('admin.artistOrders') }}</el-button>
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
      <el-table :data="orders" v-loading="ordersLoading" stripe max-height="400">
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
        <el-table-column prop="created_at" :label="$t('admin.orderColTime')" />
      </el-table>
      <el-empty v-if="!ordersLoading && orders.length === 0" :description="$t('admin.noOrders')" :image-size="60" />
    </el-dialog>

    <!-- 更换管理员弹窗（两步验证） -->
    <el-dialog v-model="transferVisible" :title="$t('admin.transferTitle')" width="450px" :close-on-click-modal="false">
      <!-- 步骤1：验证当前管理员 -->
      <div v-if="transferStep === 1">
        <h4 style="margin-bottom: 12px">{{ $t('admin.transferStep1Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.currentAdminQq')">
            <el-input :model-value="currentAdminQq" disabled />
          </el-form-item>
          <el-form-item>
            <el-button @click="sendCurrentCode" :loading="sendingCurrent" :disabled="currentCodeSent">
              {{ currentCodeSent ? $t('admin.codeSent') : $t('admin.sendCode') }}
            </el-button>
          </el-form-item>
          <el-form-item v-if="currentCodeSent" :label="$t('admin.enterCode')">
            <el-input v-model="currentCode" maxlength="6" :placeholder="$t('admin.enterCode')" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤2：验证新管理员 -->
      <div v-else>
        <h4 style="margin-bottom: 12px">{{ $t('admin.transferStep2Title') }}</h4>
        <el-form label-position="top">
          <el-form-item :label="$t('admin.newAdminQq')">
            <el-input v-model="newQq" :placeholder="$t('admin.newAdminQqPlaceholder')" :disabled="newCodeSent" />
          </el-form-item>
          <el-form-item>
            <el-button @click="sendNewCode" :loading="sendingNew" :disabled="newCodeSent || !newQq">
              {{ newCodeSent ? $t('admin.codeSent') : $t('admin.sendCode') }}
            </el-button>
          </el-form-item>
          <el-form-item v-if="newCodeSent" :label="$t('admin.enterCode')">
            <el-input v-model="newCode" maxlength="6" :placeholder="$t('admin.enterCode')" />
          </el-form-item>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi, authApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const artists = ref([])
const loading = ref(true)
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({ qqNumber: '', name: '', subdomain: '', bio: '', artistCode: '' })

const statusType = (s) => ({ open: 'success', full: 'warning', break: 'danger' }[s] || 'info')

// 订单弹窗
const ordersVisible = ref(false)
const ordersLoading = ref(false)
const ordersArtist = ref(null)
const orders = ref([])

// 更换管理员
const transferVisible = ref(false)
const transferStep = ref(1)
const currentAdminQq = ref('')
const currentCodeSent = ref(false)
const currentCode = ref('')
const sendingCurrent = ref(false)
const newQq = ref('')
const newCodeSent = ref(false)
const newCode = ref('')
const sendingNew = ref(false)
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
      qqNumber: form.qqNumber,
      name: form.name,
      subdomain: form.subdomain.toLowerCase(),
      bio: form.bio,
      artistCode: form.artistCode || undefined
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
    orders.value = await adminApi.getArtistOrders(row.id)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    ordersLoading.value = false
  }
}

// ─── 更换管理员 ───
function openTransfer() {
  transferStep.value = 1
  currentCode.value = ''
  currentCodeSent.value = false
  newQq.value = ''
  newCode.value = ''
  newCodeSent.value = false
  transferVisible.value = true
}

async function sendCurrentCode() {
  sendingCurrent.value = true
  try {
    await authApi.sendCode(currentAdminQq.value)
    currentCodeSent.value = true
    ElMessage.success(t('admin.codeSent'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sendingCurrent.value = false
  }
}

async function sendNewCode() {
  if (!newQq.value.trim()) return
  sendingNew.value = true
  try {
    await authApi.sendCode(newQq.value.trim())
    newCodeSent.value = true
    ElMessage.success(t('admin.codeSent'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sendingNew.value = false
  }
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

onMounted(loadArtists)
</script>

<style scoped>
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
</style>
