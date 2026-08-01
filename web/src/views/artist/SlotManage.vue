<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('slots.title') }}</h2>

    <div v-loading="loading" class="slot-manage">
      <!-- 当前状态只读卡片 -->
      <el-card class="slot-card" shadow="never">
        <div class="status-row">
          <el-tag :type="statusType" size="large">{{ $t(`common.statusShort.${profile?.status || 'open'}`) }}</el-tag>
          <span class="status-desc">{{ statusDesc }}</span>
          <router-link to="/dashboard" class="status-link">{{ $t('slots.goDashboard') }}</router-link>
        </div>
      </el-card>

      <!-- 名额区 -->
      <el-card class="slot-card" shadow="never">
        <template #header><span>{{ $t('slots.slotSection') }}</span></template>
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
        <template #header><span>{{ $t('slots.quotaSection') }}</span></template>
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
        <template #header><span>{{ $t('slots.queueSection') }}</span></template>
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

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)
const profile = ref(null)

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

const statusType = computed(() => {
  const s = profile.value?.status
  if (s === 'open') return 'success'
  if (s === 'full') return 'warning'
  if (s === 'break') return 'info'
  return 'danger'
})

const statusDesc = computed(() => {
  const s = profile.value?.status
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
.slot-manage { max-width: 640px; margin-top: 16px; display: flex; flex-direction: column; gap: 16px; }
.slot-card { border-radius: 12px; }
.status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.status-desc { color: var(--text-secondary); font-size: 14px; }
.status-link { color: var(--el-color-primary); font-size: 13px; text-decoration: none; margin-left: auto; }
.status-link:hover { text-decoration: underline; }
.slot-config { display: flex; flex-direction: column; gap: 8px; }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 120px; }
.slot-unit { color: var(--text-secondary); font-size: 14px; }
.slot-total { margin-top: 8px; padding: 8px 12px; background: var(--bg-inset); border-radius: 8px; font-size: 13px; color: var(--text-secondary); }
.form-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.switch-grid { display: flex; flex-direction: column; gap: 12px; }
.switch-row { display: flex; align-items: center; gap: 12px; }
</style>
