<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('preferences.title') }}</h2>

    <!-- 通知与面板偏好 -->
    <el-card style="max-width: 600px; margin-top: 16px" v-loading="loading">
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
        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">{{ $t('settings.save') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- #3: 快捷按钮配置（v0.25: DB 持久化，独立保存） -->
    <el-card style="max-width: 600px; margin-top: 16px" v-loading="loading">
      <template #header><span>{{ $t('settings.quickTitle') }}</span></template>
      <el-form label-position="top" size="large">
        <el-form-item :label="$t('settings.quickLabel')">
          <el-checkbox-group v-model="quickSelected" :min="3" :max="9" class="quick-config">
            <el-checkbox
              v-for="opt in quickPoolOptions"
              :key="opt.key"
              :value="opt.key"
              class="quick-config-item"
            >
              <el-icon class="quick-config-icon"><component :is="opt.icon" /></el-icon> {{ $t(opt.labelKey) }}
            </el-checkbox>
          </el-checkbox-group>
          <div class="form-hint">{{ $t('settings.quickHint') }}</div>
          <el-button size="small" type="primary" style="margin-top: 8px" @click="saveQuickActions" :loading="quickSaving">
            {{ $t('settings.quickSave') }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { QUICK_ACTION_POOL, QUICK_ACTIONS_DEFAULT, QUICK_ACTIONS_KEY, readQuickActionsConfig, parseQuickActions } from '../../components/artist/dashboard/QuickActions.vue'

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)

const form = reactive({
  notifyEnabled: true,
  dashboardDefaultPanel: 'queue'
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
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(quickSelected.value))
    ElMessage.success(t('settings.quickSaved'))
  } catch {
    // DB 写入失败（后端可能尚未支持该字段）：回退 localStorage，用户配置不丢
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(quickSelected.value))
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
      dashboardDefaultPanel: form.dashboardDefaultPanel
    })
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

onMounted(async () => {
  try {
    const profile = await artistApi.getProfile()
    form.notifyEnabled = !!profile.notify_enabled
    form.dashboardDefaultPanel = profile.dashboard_default_panel || 'queue'

    // v0.25: 快捷按钮从 DB 初始化（DB 有值→用 DB；DB 无值但 localStorage 有→一次性迁移到 DB）
    const dbQuick = parseQuickActions(profile.quick_actions)
    if (dbQuick) {
      quickSelected.value = dbQuick
      localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(dbQuick))
    } else {
      const localKeys = readQuickActionsConfig()
      quickSelected.value = localKeys
      // localStorage 有非默认值 → 尝试迁移到 DB（静默，失败不阻塞）
      const isDefault = JSON.stringify(localKeys) === JSON.stringify([...QUICK_ACTIONS_DEFAULT])
      if (!isDefault) {
        artistApi.updateProfile({ quickActions: localKeys }).catch(() => { /* 迁移失败静默，下次再试 */ })
      }
    }
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
})
</script>

<style scoped>
.form-hint { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
/* #3: 快捷按钮配置区 */
.quick-config { display: flex; flex-direction: column; gap: 8px; }
.quick-config-item { margin-right: 0; height: auto; }
/* v0.34 任务3：icon 改 SVG 后与文字对齐 */
.quick-config-icon { font-size: 15px; vertical-align: -2px; color: var(--el-color-primary); }
</style>
