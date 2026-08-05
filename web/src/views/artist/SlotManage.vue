<template>
  <ArtistLayout>
    <h2 class="font-display slot-page-title">{{ $t('slots.title') }}</h2>

    <div v-loading="loading" class="slot-manage">
      <!-- REQ-016 B: 接稿状态可操作（原只读卡片 → 即时切换，与仪表盘 StatusSwitch 同逻辑） -->
      <el-card class="slot-card" shadow="never">
        <template #header><CardHead :title="$t('slots.statusSection')" /></template>
        <div class="status-row">
          <el-radio-group v-model="currentStatus" @change="updateStatus" size="large">
            <el-radio-button value="open">{{ $t('settings.statusOpen') }}</el-radio-button>
            <el-radio-button value="full">{{ $t('settings.statusFull') }}</el-radio-button>
            <el-radio-button value="break">{{ $t('settings.statusBreak') }}</el-radio-button>
          </el-radio-group>
          <span class="status-desc">{{ statusDesc }}</span>
        </div>
      </el-card>

      <!-- 名额区 -->
      <el-card class="slot-card" shadow="never">
        <template #header><CardHead :title="$t('slots.slotSection')" /></template>
        <el-form label-position="top" size="large">
          <el-form-item :label="$t('settings.slotLabel')">
            <div class="slot-config">
              <div class="slot-row">
                <el-switch v-model="form.batchLimitEnabled" :active-text="$t('settings.slotEnable')" />
                <el-input-number
                  v-model="form.batchLimit" :min="0" :max="999"
                  :disabled="!form.batchLimitEnabled"
                  controls-position="right" class="slot-input"
                />
                <span class="slot-unit">{{ $t('settings.slotUnit') }}</span>
              </div>
              <div class="form-hint">{{ $t('settings.slotHint') }}</div>
            </div>
          </el-form-item>
          <el-form-item :label="$t('settings.bufferLabel')">
            <el-input-number v-model="form.bufferLimit" :min="0" :max="999" controls-position="right" class="slot-input" />
            <div class="form-hint">{{ $t('settings.bufferHint') }}</div>
          </el-form-item>
          <div v-if="form.batchLimitEnabled" class="slot-total">
            {{ $t('slots.totalHint', { n: form.batchLimit, m: form.bufferLimit, sum: form.batchLimit + form.bufferLimit }) }}
          </div>
        </el-form>
      </el-card>

      <!-- 月度额度区 -->
      <el-card class="slot-card" shadow="never">
        <template #header><CardHead :title="$t('slots.quotaSection')" /></template>
        <el-form label-position="top" size="large">
          <el-form-item :label="$t('settings.quotaLabel')">
            <div class="slot-config">
              <div class="slot-row">
                <el-switch v-model="form.quotaEnabled" :active-text="$t('settings.quotaEnable')" />
                <el-input-number
                  v-model="form.monthlyQuota" :min="0" :max="999"
                  :disabled="!form.quotaEnabled"
                  controls-position="right" class="slot-input"
                />
                <span class="slot-unit">{{ $t('settings.quotaUnit') }}</span>
              </div>
              <div class="form-hint">{{ $t('settings.quotaHint') }}</div>
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 队列行为区 -->
      <el-card class="slot-card" shadow="never">
        <template #header><CardHead :title="$t('slots.queueSection')" /></template>
        <div class="switch-grid">
          <div class="switch-row">
            <el-switch v-model="form.autoPromote" />
            <span>{{ $t('settings.autoPromote') }}</span>
          </div>
          <div class="switch-row">
            <el-switch v-model="form.hideQueuePosition" />
            <span>{{ $t('settings.hideQueuePosition') }}</span>
          </div>
          <div class="switch-row">
            <el-switch v-model="form.hidePromoteNotify" />
            <span>{{ $t('settings.hidePromoteNotify') }}</span>
          </div>
          <div class="switch-row">
            <el-switch v-model="form.bufferShortForm" />
            <span>{{ $t('settings.bufferShortForm') }}</span>
          </div>
        </div>
        <div class="form-hint">{{ $t('settings.bufferSwitchHint') }}</div>
      </el-card>

      <el-button type="primary" size="large" style="margin-top: 16px" @click="save" :loading="saving">
        {{ $t('settings.save') }}
      </el-button>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
// v0.38 第二批: 统一卡片头部（REQ-026 §二）
import CardHead from '../../components/artist/visual/CardHead.vue'

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)
const profile = ref(null)
// REQ-016 B: 接稿状态即时切换（与仪表盘 StatusSwitch 同逻辑）
const currentStatus = ref('open')
const lastKnownStatus = ref('open')

async function updateStatus(val) {
  try {
    await artistApi.updateProfile({ status: val })
    lastKnownStatus.value = val
    currentStatus.value = val
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    currentStatus.value = lastKnownStatus.value
    ElMessage.error(err.message)
  }
}

const form = reactive({
  batchLimitEnabled: false,
  batchLimit: 0,
  bufferLimit: 0,
  quotaEnabled: false,
  monthlyQuota: 0,
  autoPromote: false,
  hideQueuePosition: false,
  hidePromoteNotify: false,
  bufferShortForm: false
})

const statusDesc = computed(() => {
  const s = currentStatus.value
  if (s === 'open') return t('slots.statusOpen')
  if (s === 'full') return t('slots.statusFull')
  if (s === 'break') return t('slots.statusBreak')
  return t('slots.statusHidden')
})

async function save() {
  // N+M ≥ 1 校验
  if (form.batchLimitEnabled && form.batchLimit + form.bufferLimit < 1) {
    ElMessage.warning(t('settings.slotMinError'))
    return
  }
  saving.value = true
  try {
    await artistApi.updateProfile({
      batchLimit: form.batchLimitEnabled ? form.batchLimit : null,
      bufferLimit: form.bufferLimit,
      monthlyQuota: form.quotaEnabled ? form.monthlyQuota : null,
      autoPromote: form.autoPromote,
      hideQueuePosition: form.hideQueuePosition,
      hidePromoteNotify: form.hidePromoteNotify,
      bufferShortForm: form.bufferShortForm
    })
    ElMessage.success(t('settings.saved'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const p = await artistApi.getProfile()
    profile.value = p
    // REQ-016 B: 初始化接稿状态
    currentStatus.value = p.status || 'open'
    lastKnownStatus.value = currentStatus.value
    Object.assign(form, {
      batchLimitEnabled: p.batch_limit != null,
      batchLimit: p.batch_limit ?? 0,
      bufferLimit: p.buffer_limit ?? 0,
      quotaEnabled: p.monthly_quota != null,
      monthlyQuota: p.monthly_quota ?? 0,
      autoPromote: !!p.auto_promote,
      hideQueuePosition: !!p.hide_queue_position,
      hidePromoteNotify: !!p.hide_promote_notify,
      bufferShortForm: !!p.buffer_short_form
    })
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.slot-page-title { font-size: 28px; font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.slot-manage { max-width: 640px; margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
.slot-card { border-radius: var(--r-l); }
.status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.status-desc { color: var(--ink2); font-size: 14px; }
.slot-config { display: flex; flex-direction: column; gap: 8px; }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 120px; }
.slot-unit { color: var(--ink2); font-size: 14px; }
.slot-total { margin-top: 8px; padding: 8px 12px; background: var(--paper2); border-radius: var(--r-m); font-size: 13px; color: var(--ink2); }
.form-hint { font-size: 12px; color: var(--ink3); margin-top: 4px; }
.switch-grid { display: flex; flex-direction: column; gap: 12px; }
.switch-row { display: flex; align-items: center; gap: 12px; }
</style>
