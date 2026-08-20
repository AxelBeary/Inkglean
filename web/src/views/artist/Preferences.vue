<template>
  <!-- 819-G: 偏好设置重构——顶部导航三 tab（通用 / 显示与字号 / 快捷入口），
       分组卡片 + 统一行结构「说明在左 / 控件在右」，结构与视觉对齐 proto-preferences-818 -->
  <div class="pref-page" v-loading="loading">
    <h2 class="font-display pref-title">{{ $t('preferences.title') }}</h2>
    <p class="pref-sub">{{ $t('preferences.subtitle') }}</p>

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

    <!-- 820-M: 自绘顶部导航改 el-tabs（对齐价格管理 tab-change + EP 自带切换过渡）。
         三面板含表单状态，故不设 lazy：非 lazy 下全部面板保持挂载（等价原 v-show），切换不丢状态 -->
    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- ── Tab 通用：通知 / 仪表盘（保留现有数据流） ── -->
      <el-tab-pane :label="$t('preferences.tabGeneral')" name="general">
        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupNotify') }}</div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.notifyLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.notifyDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <el-switch v-model="form.notifyEnabled" />
            </div>
          </div>
        </div>

        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupDashboard') }}</div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.defaultPanelLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.defaultPanelDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <el-select v-model="form.dashboardDefaultPanel" style="width: 200px">
                <el-option value="queue" :label="$t('dashboard.panelQueue')" />
                <el-option value="orders" :label="$t('dashboard.panelOrders')" />
                <el-option value="manual" :label="$t('dashboard.panelManual')" />
                <el-option value="tiers" :label="$t('dashboard.panelTiers')" />
              </el-select>
            </div>
          </div>
          <!-- 自定义首页批一（v70）：吞并旧「看板显示的模块」开关集群——
               板块顺序/显隐/宽度/行数统一收进「自定义我的首页」抽屉（说明在左、控件在右既有排版） -->
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('dashboardPrefs.entryLabel') }}</div>
              <div class="pref-row-desc">{{ $t('dashboardPrefs.entryDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <el-button @click="drawerOpen = true">{{ $t('dashboardPrefs.entryBtn') }}</el-button>
            </div>
          </div>
        </div>

        <div class="pref-save-bar">
          <el-button type="primary" @click="save" :loading="saving" :disabled="loadFailed">{{ $t('settings.save') }}</el-button>
          <span class="form-hint">{{ $t('preferences.saveHint') }}</span>
        </div>
      </el-tab-pane>

      <!-- ── Tab 显示与字号：字号（818-A 保留不动）/ 页面宽度（v70）/ 暗色模式 / 动画速度 + 减少动效 ── -->
      <el-tab-pane :label="$t('preferences.tabDisplay')" name="display">
        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupFont') }}</div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.fontSize') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.fontSizeHint') }}</div>
            </div>
            <div class="pref-row-control font-size-row">
              <el-slider
                v-model="fontSize"
                :min="FONT_SIZE_MIN" :max="FONT_SIZE_MAX" :step="1" show-stops
                class="font-size-slider"
                :aria-label="$t('preferences.fontSize')"
              />
              <span class="font-size-value">{{ fontSize }}px</span>
            </div>
          </div>
        </div>

        <!-- 自定义首页批一（v70）：页面宽度控件（与字号滑块同页并排）。
             与抽屉共用同一份 prefs 控制器；滑杆松手（change）才提交 PUT，
             input 只更新旁边数字显示（防闪拍板）。 -->
        <div class="pref-group">
          <div class="pref-group-head">{{ $t('dashboardPrefs.pageWidthTitle') }}</div>

          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('dashboardPrefs.pageAlignLabel') }}</div>
              <div class="pref-row-desc">{{ $t('dashboardPrefs.pageAlignDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <el-radio-group :model-value="pageAlign" :disabled="!prefs" @change="onPageAlignChange">
                <el-radio-button value="left">{{ $t('dashboardPrefs.pageAlignLeft') }}</el-radio-button>
                <el-radio-button value="center">{{ $t('dashboardPrefs.pageAlignCenter') }}</el-radio-button>
                <el-radio-button value="full">{{ $t('dashboardPrefs.pageAlignFull') }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('dashboardPrefs.pageMaxLabel') }}</div>
              <div class="pref-row-desc">{{ $t('dashboardPrefs.pageMaxDesc') }}</div>
            </div>
            <div class="pref-row-control page-max-row">
              <el-slider
                :model-value="pageMaxDraft"
                :min="PAGE_MAX_MIN"
                :max="PAGE_MAX_MAX"
                :step="PAGE_MAX_STEP"
                :disabled="!prefs || pageAlign === 'full'"
                class="page-max-slider"
                :aria-label="$t('dashboardPrefs.pageMaxLabel')"
                @input="onPageMaxInput"
                @change="onPageMaxChange"
              />
              <span class="page-max-value">{{ pageMaxDraft }}px</span>
            </div>
          </div>
        </div>

        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupAppearance') }}</div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.darkModeLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.darkModeDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <!-- 与 ThemeToggle 同一口径：theme store 宣纸/墨黑切换 -->
              <el-switch :model-value="themeStore.isArtistInk" @change="toggleDarkMode" />
            </div>
          </div>
        </div>

        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupAnimation') }}</div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.animSpeedLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.animSpeedDesc') }}</div>
            </div>
            <div class="pref-row-control anim-speed-row">
              <el-slider
                v-model="animSpeed"
                :min="ANIM_SPEED_MIN" :max="ANIM_SPEED_MAX" :step="ANIM_SPEED_STEP" show-stops
                class="font-size-slider"
                :aria-label="$t('preferences.animSpeedLabel')"
              />
              <span class="anim-speed-value">{{ formatSpeed(animSpeed) }}</span>
            </div>
          </div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.reduceMotionLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.reduceMotionDesc') }}</div>
            </div>
            <div class="pref-row-control">
              <el-switch v-model="reduceMotion" />
            </div>
          </div>
          <div class="pref-row">
            <div class="pref-row-text">
              <div class="pref-row-label">{{ $t('preferences.animPreviewLabel') }}</div>
              <div class="pref-row-desc">{{ $t('preferences.animPreviewDesc') }}</div>
            </div>
            <div class="pref-row-control anim-preview-control">
              <button type="button" class="anim-demo-btn" @click="runAnimDemo">{{ $t('preferences.animPreviewBtn') }}</button>
              <span class="anim-demo-track" aria-hidden="true"><span class="anim-demo-bar" :class="{ on: animDemoOn }"></span></span>
            </div>
          </div>
        </div>

        <div class="pref-save-bar">
          <span class="form-hint">{{ $t('preferences.displayHint') }}</span>
        </div>
      </el-tab-pane>

      <!-- ── Tab 快捷入口：数量不限，0 个=隐藏仪表盘快捷区 ── -->
      <el-tab-pane :label="$t('preferences.tabQuick')" name="quick">
        <div class="pref-group">
          <div class="pref-group-head">{{ $t('preferences.groupQuick') }}</div>
          <el-checkbox-group v-model="quickSelected" class="quick-config">
            <el-checkbox
              v-for="opt in quickPoolOptions" :key="opt.key" :value="opt.key"
              class="quick-config-item"
            >
              <el-icon class="quick-config-icon"><component :is="opt.icon" /></el-icon>
              <span class="quick-config-name">{{ $t(opt.labelKey) }}</span>
              <template v-if="opt.type === 'action'"><span class="quick-action-badge">{{ $t('settings.quickActionBadge') }}</span></template>
            </el-checkbox>
          </el-checkbox-group>
          <div class="quick-config-footer">
            <div class="form-hint">{{ $t('settings.quickHint') }}</div>
            <el-button size="small" type="primary" @click="saveQuickActions" :loading="quickSaving" :disabled="loadFailed">
              {{ $t('settings.quickSave') }}
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 自定义首页批一（v70）：「自定义我的首页」抽屉（与本页面宽度控件共用 prefs 控制器） -->
    <DashboardPrefsDrawer v-model="drawerOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, provide } from 'vue'
import { artistApi } from '../../api/index'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../../stores/theme'
// 819-G: 快捷按钮候选池（与 Dashboard QuickActions 共用）
import { QUICK_ACTION_POOL, QUICK_ACTIONS_DEFAULT, QUICK_ACTIONS_KEY, readQuickActionsConfig, parseQuickActions } from '../../components/artist/dashboard/QuickActions.vue'
import { safeSetItem } from '../../utils/storage'
// 818-A: 字号滑块共享 util（Preferences 与 ArtistLayout 同一映射/读写口径）
import { FONT_SIZE_MIN, FONT_SIZE_MAX, readFontSize, applyFontSize, writeFontSize } from '../../utils/fontSize'
// 819-G: 动画速度 + 减少动效共享 util（Preferences 与 ArtistLayout 同一映射/应用口径）
import { ANIM_SPEED_MIN, ANIM_SPEED_MAX, ANIM_SPEED_STEP, readAnimSpeed, applyAnimSpeed, writeAnimSpeed, readReduceMotion, applyReduceMotion, writeReduceMotion } from '../../utils/animSpeed'
// 自定义首页批一（v70）：抽屉入口 + 页面宽度控件（与抽屉共用同一份 prefs 控制器）
import DashboardPrefsDrawer from '../../components/artist/dashboard/DashboardPrefsDrawer.vue'
import { DASHBOARD_PREFS_KEY, useDashboardPrefs, PAGE_MAX_MIN, PAGE_MAX_MAX, PAGE_MAX_STEP, PAGE_MAX_DEFAULT, clampPageMax } from '../../utils/dashboard-prefs'

const { t } = useI18n()
const themeStore = useThemeStore()
const loading = ref(true)
const saving = ref(false)
const quickSaving = ref(false)
/** 偏好加载失败（防止默认值覆盖真实设置，对齐 Settings profileLoadFailed） */
const loadFailed = ref(false)
/** 顶部导航当前 tab（el-tabs 非 lazy：面板保持挂载，表单状态不丢） */
const activeTab = ref('general')
/** 「点我看速度」演示条（一次性切换，无循环无位移） */
const animDemoOn = ref(false)

const form = reactive({
  notifyEnabled: true,
  dashboardDefaultPanel: 'queue'
})

// ─── 自定义首页批一（v70）：prefs 共享控制器（抽屉 provide/inject 同一实例） ───
const prefsCtrl = useDashboardPrefs()
provide(DASHBOARD_PREFS_KEY, prefsCtrl)
const { prefs } = prefsCtrl
/** 「自定义我的首页」抽屉开关 */
const drawerOpen = ref(false)
/** 页面位置三档（读自 prefs；未加载时按服务端默认 center 展示，控件禁用） */
const pageAlign = computed(() => prefs.value?.pageAlign ?? 'center')
/** 最大宽度滑杆草稿：input 只更新此值（旁边数字同步），松手 change 才提交 */
const pageMaxDraft = ref(PAGE_MAX_DEFAULT)
watch(() => prefs.value?.pageMax, (v) => {
  if (typeof v === 'number') pageMaxDraft.value = v
}, { immediate: true })

function onPageAlignChange(value: string | number | boolean) {
  if (value !== 'left' && value !== 'center' && value !== 'full') return
  void prefsCtrl.mutate(d => { d.pageAlign = value })
}
function onPageMaxInput(value: number) {
  pageMaxDraft.value = value
}
function onPageMaxChange(value: number) {
  const next = clampPageMax(value)
  pageMaxDraft.value = next
  void prefsCtrl.mutate(d => { d.pageMax = next })
}

// ─── 818-A: 后台字号滑块（localStorage 持久化，watch 即时生效，默认 15px） ───
// 旧值（large/xlarge/normal/非法/无值）由共享 util 归一化到 14~20 数字档
const fontSize = ref(readFontSize())
watch(fontSize, (val) => {
  const size = applyFontSize(val)
  writeFontSize(size)
})

// ─── 819-G: 动画速度（0.5×~2× 七档，默认 1×，localStorage 持久化，拖动即时生效） ───
const animSpeed = ref(readAnimSpeed())
watch(animSpeed, (val) => {
  const speed = applyAnimSpeed(val)
  writeAnimSpeed(speed)
})

// ─── 819-G: 减少动效开关（localStorage 持久化，即时生效；减少动效优先于动画速度） ───
const reduceMotion = ref(readReduceMotion())
watch(reduceMotion, (on) => {
  applyReduceMotion(on)
  writeReduceMotion(on)
})

function formatSpeed(v: number) {
  return `${v}×`
}

/** 暗色模式：与 ThemeToggle 同一口径（theme store 宣纸/墨黑切换 + toast） */
function toggleDarkMode() {
  themeStore.toggleArtistTheme()
  ElMessage.success(themeStore.isArtistInk ? t('pref.artistToastInk') : t('pref.artistToastPaper'))
}

function runAnimDemo() {
  animDemoOn.value = !animDemoOn.value
}

// ─── #3: 快捷按钮配置（v0.25: DB 持久化，localStorage 作回退缓存） ───
// #45: 过滤掉 dashboard（在仪表盘上加去仪表盘的按钮无意义）
const quickPoolOptions = QUICK_ACTION_POOL.filter(a => a.key !== 'dashboard')
const quickSelected = ref(readQuickActionsConfig())

async function saveQuickActions() {
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
      dashboardDefaultPanel: form.dashboardDefaultPanel
    })
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error((err instanceof Error ? err.message : '') || String(err)) }
  finally { saving.value = false }
}

async function loadPreferences() {
  loading.value = true
  loadFailed.value = false
  try {
    const profile = await artistApi.getProfile()
    form.notifyEnabled = !!profile.notify_enabled
    form.dashboardDefaultPanel = profile.dashboard_default_panel || 'queue'

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

onMounted(() => {
  loadPreferences()
  // 自定义首页批一（v70）：页面宽度控件需要 prefs；抽屉打开时还会再拉一次新鲜态
  void prefsCtrl.load()
})
</script>

<style scoped>
/* ═══ 819-G: 顶部导航 + 分组卡片 + 统一行结构（4px 栅格，圆角走 token） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.pref-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.pref-sub { margin-top: 4px; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }

/* 内容区：分组卡片 + 组头朱砂小印点 + 统一行（页签间距由 el-tabs 自带头部留白承担，对齐价格管理） */
.pref-group {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-l); box-shadow: var(--sh-1);
  padding: 8px 24px; margin-bottom: 16px;
}
.pref-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 12px;
  font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; color: var(--ink);
}
.pref-group-head::before { content: ""; width: 8px; height: 8px; background: var(--zs); border-radius: var(--r-paper); }
.pref-row {
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.pref-row-text { min-width: 0; }
.pref-row-label { font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink); }
.pref-row-desc { margin-top: 2px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink3); max-width: 520px; }
.pref-row-control { display: flex; align-items: center; }

/* 自定义首页批一（v70）：页面最大宽度滑杆（左滑杆 + 右当前值，与字号滑块同构） */
.page-max-row { gap: 16px; }
.page-max-slider { width: 260px; }
.page-max-value {
  flex: none; min-width: 56px; text-align: right;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--ink); font-variant-numeric: tabular-nums;
}

.form-hint { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
.pref-save-bar { margin-top: 20px; display: flex; gap: 12px; align-items: center; }
.pref-save-bar .form-hint { margin-top: 0; }

/* 818-A: 字号滑块（左侧滑杆 + 右侧当前值，保留不动） */
.font-size-row { gap: 16px; }
.font-size-slider { width: 260px; }
.font-size-value {
  flex: none; min-width: 46px;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--ink); font-variant-numeric: tabular-nums;
}

/* 819-G: 动画速度滑块（0.5×~2×，step 0.25） */
.anim-speed-row { gap: 16px; }
.anim-speed-value {
  flex: none; min-width: 56px; text-align: right;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--hq); font-variant-numeric: tabular-nums;
}

/* 819-G: 速度预览（点按钮触发一次淡入/淡出，无循环无位移） */
.anim-preview-control { gap: 12px; }
.anim-demo-btn {
  font: inherit; font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--hq); background: var(--hq-t);
  border: 1px solid var(--hq); border-radius: var(--r-m);
  padding: 8px 12px; cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.anim-demo-btn:hover { background: var(--hq); color: var(--paper); }
.anim-demo-track { width: 120px; height: 8px; border-radius: var(--r-pill); background: var(--line2); overflow: hidden; }
.anim-demo-bar {
  display: block; width: 100%; height: 100%; border-radius: var(--r-pill);
  background: var(--hq); opacity: 0;
  transition: opacity var(--dur-mid) var(--ease-out);
}
.anim-demo-bar.on { opacity: 1; }

/* #3: 快捷按钮勾选区（卡片化网格，数量不限，自动换行） */
.quick-config {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.quick-config :deep(.el-checkbox) {
  display: flex; align-items: center; margin-right: 0; height: auto;
  padding: 12px; border: 1px solid var(--line); border-radius: var(--r-m);
  background: var(--paper2); cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast);
}
.quick-config :deep(.el-checkbox.is-checked) { border-color: var(--hq); background: var(--hq-t); }
.quick-config :deep(.el-checkbox__label) {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); white-space: normal;
}
.quick-config-item { margin-right: 0; }
.quick-config-icon { font-size: calc(var(--font-scale, 1) * 15px); vertical-align: -2px; color: var(--hq); }
.quick-config-name { line-height: 1.4; }
/* 动作型候选标记（F3） */
.quick-action-badge {
  display: inline-block; margin-left: 4px; padding: 0 4px;
  font-size: calc(var(--font-scale, 1) * 10px); line-height: 16px;
  border-radius: var(--r-s);
  color: var(--hq-d, #b45309);
  background: var(--hq-t, rgba(180, 83, 9, 0.12));
}
.quick-config-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 0 0 12px; }
.quick-config-footer .form-hint { margin-top: 0; }

/* 窄屏：快捷网格两列，行结构上下堆叠（控件回左） */
@media (max-width: 600px) {
  .quick-config { grid-template-columns: repeat(2, 1fr); }
  .pref-row { grid-template-columns: 1fr; }
  .pref-row-control { justify-content: flex-start; }
}
</style>
