<template>
  <!-- v0.38: 纸墨 token（REQ-026）——H1 文楷 28/700，卡片 CardHead 朱砂 mark -->
  <h2 class="font-display pref-title">{{ $t('preferences.title') }}</h2>

  <!-- 加载失败错误态 + 重试（对齐 Settings profileLoadFailed 模式） -->
  <el-alert
    v-if="loadFailed"
    type="error" :closable="false" show-icon
    style="margin-top: 16px"
    :title="$t('settings.loadFailedTitle')"
  >
    <div>{{ $t('settings.loadFailedDesc') }}</div>
    <el-button size="small" type="primary" style="margin-top: 8px" @click="loadPreferences">{{ $t('settings.retry') }}</el-button>
  </el-alert>

  <!-- F1 批4: 后台字号档位（localStorage 持久化，watch 即时生效，无需 DB） -->
  <el-card class="pref-card">
    <template #header><CardHead :title="$t('preferences.fontSize')" /></template>
    <el-form label-position="top" size="large">
      <el-form-item>
        <el-radio-group v-model="fontSize">
          <el-radio value="normal">{{ $t('preferences.fontSizeNormal') }}</el-radio>
          <el-radio value="large">{{ $t('preferences.fontSizeLarge') }}</el-radio>
          <el-radio value="xlarge">{{ $t('preferences.fontSizeXLarge') }}</el-radio>
        </el-radio-group>
        <div class="form-hint">{{ $t('preferences.fontSizeHint') }}</div>
      </el-form-item>
    </el-form>
  </el-card>

  <!-- 通知与面板偏好 -->
  <el-card class="pref-card" v-loading="loading">
    <template #header><CardHead :title="$t('settings.notifyPanelTitle')" /></template>
    <el-form :model="form" label-position="top" size="large">
      <el-form-item :label="$t('settings.notifyLabel')">
        <el-switch
          v-model="form.notifyEnabled"
          :active-text="$t('settings.notifyText')"
        />
      </el-form-item>
      <!-- R8: 默认面板 -->
      <el-form-item :label="$t('settings.defaultPanelLabel')">
        <el-select v-model="form.dashboardDefaultPanel" style="width: 200px">
          <el-option value="queue" :label="$t('dashboard.panelQueue')" />
          <el-option value="orders" :label="$t('dashboard.panelOrders')" />
          <el-option value="manual" :label="$t('dashboard.panelManual')" />
          <el-option value="tiers" :label="$t('dashboard.panelTiers')" />
        </el-select>
        <div class="form-hint">{{ $t('settings.defaultPanelHint') }}</div>
      </el-form-item>
      <!-- 视觉批 P2：看板显示开关（模块级隐藏，null/默认=全部显示） -->
      <el-form-item :label="$t('settings.dashModulesLabel')">
        <div class="dash-modules-switches">
          <el-switch v-model="form.dashModules.schedule" :active-text="$t('settings.dashModuleSchedule')" />
          <el-switch v-model="form.dashModules.guestbook" :active-text="$t('settings.dashModuleGuestbook')" />
          <el-switch v-model="form.dashModules.activity" :active-text="$t('settings.dashModuleActivity')" />
          <el-switch v-model="form.dashModules.onboarding" :active-text="$t('settings.dashModuleOnboarding')" />
        </div>
        <div class="form-hint">{{ $t('settings.dashModulesHint') }}</div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="save" :loading="saving" :disabled="loadFailed">{{ $t('settings.save') }}</el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <!-- #3: 快捷按钮配置（v0.25: DB 持久化，独立保存） -->
  <el-card class="pref-card" v-loading="loading">
    <template #header><CardHead :title="$t('settings.quickTitle')" /></template>
    <el-form label-position="top" size="large">
      <el-form-item :label="$t('settings.quickLabel')">
        <el-checkbox-group v-model="quickSelected" :min="3" :max="9" class="quick-config">
          <el-checkbox
            v-for="opt in quickPoolOptions"
            :key="opt.key"
            :value="opt.key"
            class="quick-config-item"
          >
            <el-icon class="quick-config-icon"><component :is="opt.icon" /></el-icon>
            {{ $t(opt.labelKey) }}<template v-if="opt.type === 'action'"> <span class="quick-action-badge">⚡动作</span></template>
          </el-checkbox>
        </el-checkbox-group>
        <div class="quick-config-footer">
          <div class="form-hint">{{ $t('settings.quickHint') }}</div>
          <el-button size="small" type="primary" @click="saveQuickActions" :loading="quickSaving" :disabled="loadFailed">
            {{ $t('settings.quickSave') }}
          </el-button>
        </div>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
// v0.38: 统一卡片头部（REQ-026 §二）
import CardHead from '../../components/artist/visual/CardHead.vue'
import { QUICK_ACTION_POOL, QUICK_ACTIONS_DEFAULT, QUICK_ACTIONS_KEY, readQuickActionsConfig, parseQuickActions } from '../../components/artist/dashboard/QuickActions.vue'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../utils/storage.js'

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)
/** 偏好加载失败（防止默认值覆盖真实设置，对齐 Settings profileLoadFailed） */
const loadFailed = ref(false)

const form = reactive({
  notifyEnabled: true,
  dashboardDefaultPanel: 'queue',
  // 视觉批 P2：看板模块开关（全 true=全部显示）
  dashModules: { schedule: true, guestbook: true, activity: true, onboarding: true }
})

// ─── F1 批4: 后台字号档位（localStorage 持久化，watch 即时生效） ───
// 与 ArtistLayout.vue 的 FONT_SIZE_KEY 一致；normal 清除 dataset，恢复默认 14px
const FONT_SIZE_KEY = 'huiyue_admin_font_size'
function readFontSize() {
  // G-5: 裸读写换 safe 封装（存储禁用时按默认档降级）
  const v = safeGetItem(FONT_SIZE_KEY)
  return v === 'large' || v === 'xlarge' ? v : 'normal'
}
const fontSize = ref(readFontSize())
watch(fontSize, (val) => {
  if (val === 'normal') {
    safeRemoveItem(FONT_SIZE_KEY)
    delete document.documentElement.dataset.fontSize
  } else {
    safeSetItem(FONT_SIZE_KEY, val)
    document.documentElement.dataset.fontSize = val
  }
})

// ─── #3: 快捷按钮配置（v0.25: DB 持久化，localStorage 作回退缓存） ───
// #45: 过滤掉 dashboard（在仪表盘上加去仪表盘的按钮无意义）
const quickPoolOptions = QUICK_ACTION_POOL.filter(a => a.key !== 'dashboard')
const quickSelected = ref(readQuickActionsConfig())
const quickSaving = ref(false)

async function saveQuickActions() {
  if (quickSelected.value.length < 3 || quickSelected.value.length > 9) {
    ElMessage.warning(t('settings.quickLimitError'))
    return
  }
  quickSaving.value = true
  try {
    await artistApi.updateProfile({ quickActions: quickSelected.value })
    // DB 写入成功，同步 localStorage 缓存（离线/降级时回退用）
    safeSetItem(QUICK_ACTIONS_KEY, JSON.stringify(quickSelected.value))
    ElMessage.success(t('settings.quickSaved'))
  } catch {
    // DB 写入失败（后端可能尚未支持该字段）：回退 localStorage，用户配置不丢
    safeSetItem(QUICK_ACTIONS_KEY, JSON.stringify(quickSelected.value))
    ElMessage.warning(t('settings.quickLocalFallback'))
  } finally {
    quickSaving.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await artistApi.updateProfile({
      notifyEnabled: form.notifyEnabled,
      dashboardDefaultPanel: form.dashboardDefaultPanel,
      dashboardModules: { ...form.dashModules }
    })
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

async function loadPreferences() {
  loading.value = true
  loadFailed.value = false
  try {
    const profile = await artistApi.getProfile()
    form.notifyEnabled = !!profile.notify_enabled
    form.dashboardDefaultPanel = profile.dashboard_default_panel || 'queue'
    // 视觉批 P2：看板模块开关回读（JSON 串，null/坏值=全部显示）
    let mods = null
    if (profile.dashboard_modules) {
      try { mods = JSON.parse(profile.dashboard_modules) } catch { mods = null }
    }
    form.dashModules.schedule = mods?.schedule ?? true
    form.dashModules.guestbook = mods?.guestbook ?? true
    form.dashModules.activity = mods?.activity ?? true
    form.dashModules.onboarding = mods?.onboarding ?? true

    // v0.25: 快捷按钮从 DB 初始化（DB 有值→用 DB；DB 无值但 localStorage 有→一次性迁移到 DB）
    const dbQuick = parseQuickActions(profile.quick_actions)
    if (dbQuick) {
      quickSelected.value = dbQuick
      safeSetItem(QUICK_ACTIONS_KEY, JSON.stringify(dbQuick))
    } else {
      const localKeys = readQuickActionsConfig()
      quickSelected.value = localKeys
      // localStorage 有非默认值 → 尝试迁移到 DB（静默，失败不阻塞）
      const isDefault = JSON.stringify(localKeys) === JSON.stringify([...QUICK_ACTIONS_DEFAULT])
      if (!isDefault) {
        artistApi.updateProfile({ quickActions: localKeys }).catch(() => { /* 迁移失败静默，下次再试 */ })
      }
    }
  } catch {
    loadFailed.value = true
  }
  finally { loading.value = false }
}

onMounted(loadPreferences)
</script>

<style scoped>
/* ═══ v0.38: 纸墨 token（REQ-026） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.pref-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.pref-card { max-width: 600px; margin-top: 16px; }
.form-hint { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
/* #3: 快捷按钮配置区 */
.quick-config { display: flex; flex-direction: column; gap: 8px; }
.quick-config-item { margin-right: 0; height: auto; }
.quick-config-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 8px; flex-basis: 100%; }
.quick-config-footer .form-hint { margin-top: 0; }
/* v0.34 任务3：icon 改 SVG 后与文字对齐 */
.quick-config-icon { font-size: calc(var(--font-scale, 1) * 15px); vertical-align: -2px; color: var(--hq); }
/* F3: 动作型候选标记 */
.quick-action-badge {
  display: inline-block; margin-left: 4px; padding: 0 5px;
  font-size: calc(var(--font-scale, 1) * 10px); line-height: 16px;
  border-radius: 4px;
  color: var(--hq-d, #b45309);
  background: var(--hq-t, rgba(180, 83, 9, 0.12));
}
</style>
