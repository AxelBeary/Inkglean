<template>
  <h2 class="font-display slot-page-title">{{ $t('slots.title') }}</h2>

  <div v-loading="loading" class="slot-manage">
    <!-- 加载失败错误态 + 重试（对齐 Settings profileLoadFailed 模式）；未加载成功不显默认表单值 -->
    <el-alert
      v-if="loadFailed"
      type="error" :closable="false" show-icon
      :title="$t('settings.loadFailedTitle')"
    >
      <div>{{ $t('settings.loadFailedDesc') }}</div>
      <el-button size="small" type="primary" style="margin-top: 8px" @click="loadProfile">{{ $t('settings.retry') }}</el-button>
    </el-alert>

    <template v-else>
      <!-- 820-M: 分组卡片改 el-tabs（对齐价格管理结构与动画口径）。
           接稿状态/名额/月度额度/队列行为各作一页签；表单字段跨页签，
           不设 lazy 保持全部挂载，切页签不丢未保存状态；保存条统一留在页签外 -->
      <el-tabs v-model="activeTab">
        <!-- 接稿状态 -->
        <el-tab-pane :label="$t('slots.statusSection')" name="status">
          <div class="group">
            <div class="group-head">{{ $t('slots.statusSection') }}</div>
            <!-- REQ-016 B: 接稿状态可操作（原只读卡片 → 即时切换，与开稿管理内联逻辑一致） -->
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.statusLabel') }}</div>
                <div class="desc">{{ $t('slots.statusSectionDesc') }}</div>
              </div>
              <div class="ctrl">
                <el-radio-group :model-value="currentStatus" :disabled="statusUpdating" @change="updateStatus" size="large">
                  <el-radio-button value="open">{{ $t('settings.statusOpen') }}</el-radio-button>
                  <el-radio-button value="full">{{ $t('settings.statusFull') }}</el-radio-button>
                  <el-radio-button value="break">{{ $t('settings.statusBreak') }}</el-radio-button>
                </el-radio-group>
                <span class="status-desc">{{ statusDesc }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 名额区 -->
        <el-tab-pane :label="$t('slots.slotSection')" name="slots">
          <div class="group">
            <div class="group-head">{{ $t('slots.slotSection') }}</div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.slotLabel') }}</div>
                <div class="desc">{{ $t('settings.slotHint') }}</div>
              </div>
              <div class="ctrl">
                <div class="slot-row">
                  <el-switch v-model="form.batchLimitEnabled" :active-text="$t('settings.slotEnable')" />
                  <el-input-number
                    v-model="form.batchLimit" :min="0" :max="999"
                    :disabled="!form.batchLimitEnabled"
                    controls-position="right" class="slot-input"
                  />
                  <span class="slot-unit">{{ $t('settings.slotUnit') }}</span>
                </div>
              </div>
            </div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.bufferLabel') }}</div>
                <div class="desc">{{ $t('settings.bufferHint') }}</div>
              </div>
              <div class="ctrl">
                <el-input-number v-model="form.bufferLimit" :min="0" :max="999" controls-position="right" class="slot-input" />
              </div>
            </div>
            <div v-if="form.batchLimitEnabled" class="slot-total">
              {{ $t('slots.totalHint', { n: form.batchLimit, m: form.bufferLimit, sum: form.batchLimit + form.bufferLimit }) }}
            </div>
          </div>
        </el-tab-pane>

        <!-- 月度额度区 -->
        <el-tab-pane :label="$t('slots.quotaSection')" name="quota">
          <div class="group">
            <div class="group-head">{{ $t('slots.quotaSection') }}</div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.quotaLabel') }}</div>
                <div class="desc">{{ $t('settings.quotaHint') }}</div>
              </div>
              <div class="ctrl">
                <div class="slot-row">
                  <el-switch v-model="form.quotaEnabled" :active-text="$t('settings.quotaEnable')" />
                  <el-input-number
                    v-model="form.monthlyQuota" :min="0" :max="999"
                    :disabled="!form.quotaEnabled"
                    controls-position="right" class="slot-input"
                  />
                  <span class="slot-unit">{{ $t('settings.quotaUnit') }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 队列行为区 -->
        <el-tab-pane :label="$t('slots.queueSection')" name="queue">
          <div class="group">
            <div class="group-head">{{ $t('slots.queueSection') }}</div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.autoPromote') }}</div>
              </div>
              <div class="ctrl ctrl--switch">
                <el-switch v-model="form.autoPromote" :aria-label="$t('settings.autoPromote')" />
              </div>
            </div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.hideQueuePosition') }}</div>
              </div>
              <div class="ctrl ctrl--switch">
                <el-switch v-model="form.hideQueuePosition" :aria-label="$t('settings.hideQueuePosition')" />
              </div>
            </div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.hidePromoteNotify') }}</div>
              </div>
              <div class="ctrl ctrl--switch">
                <el-switch v-model="form.hidePromoteNotify" :aria-label="$t('settings.hidePromoteNotify')" />
              </div>
            </div>
            <div class="row">
              <div class="field-text">
                <div class="lab">{{ $t('settings.bufferShortForm') }}</div>
              </div>
              <div class="ctrl ctrl--switch">
                <el-switch v-model="form.bufferShortForm" :aria-label="$t('settings.bufferShortForm')" />
              </div>
            </div>
            <p class="group-hint">{{ $t('settings.bufferSwitchHint') }}</p>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="slot-actions">
        <el-button type="primary" size="large" @click="save" :loading="saving">
          {{ $t('settings.save') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)
/** 页签当前项（el-tabs 非 lazy：四面板保持挂载，切页签不丢未保存表单状态） */
const activeTab = ref('status')
/** 开稿配置加载失败（未加载成功不显示默认值，对齐 Settings profileLoadFailed） */
const loadFailed = ref(false)
const profile = ref(null)
// REQ-016 B: 接稿状态即时切换（与开稿管理内联逻辑一致）
const currentStatus = ref('open')
const lastKnownStatus = ref('open')
/** 状态切换请求在途锁（受控绑定 + 禁用，防快速切换时旧请求覆盖/回滚基准错乱） */
const statusUpdating = ref(false)

async function updateStatus(val) {
  if (statusUpdating.value) return
  // 受控绑定：请求发出前 currentStatus 仍是旧值，prev 即回滚基准（对齐 PlatformManage 正确模式）
  const prev = currentStatus.value
  statusUpdating.value = true
  try {
    await artistApi.updateProfile({ status: val })
    lastKnownStatus.value = val
    currentStatus.value = val
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    currentStatus.value = prev
    ElMessage.error(err.message)
  } finally {
    statusUpdating.value = false
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

async function loadProfile() {
  loading.value = true
  loadFailed.value = false
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
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.slot-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.slot-manage { max-width: 760px; margin-top: 16px; display: flex; flex-direction: column; gap: 16px; }

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group {
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}
.group-hint { margin: 0; padding-top: 12px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

/* 818-H 三原则：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ctrl--switch { width: 72px; }
.status-desc { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 14px); }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 120px; }
.slot-unit { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 14px); }
.slot-total { margin-top: 8px; padding: 8px 12px; background: var(--paper2); border-radius: var(--r-m); font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.slot-actions { display: flex; justify-content: flex-end; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .ctrl--switch { width: auto; }
}
</style>
