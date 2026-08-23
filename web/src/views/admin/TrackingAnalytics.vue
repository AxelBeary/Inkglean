<template>
  <div class="admin-page" v-loading="loading">
    <!-- 页头 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.tracking.title') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.trackingSubtitle') }}</p>
      </div>
    </div>

    <!-- 819-I：总事件数统计卡 + 设置分组卡（说明在左、控件在右） -->
    <div class="stat-grid">
      <el-card shadow="never" class="admin-stat-card">
        <div class="stat-num">{{ summary?.total ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.tracking.total') }}</div>
      </el-card>
      <el-card shadow="never" class="admin-section-card track-config-card">
        <!-- 820-L：统计功能管理员总开关（默认关闭；关闭时画师后台隐藏整个统计导航） -->
        <div class="row">
          <div class="tc-text">
            <div class="lab">{{ $t('admin.tracking.enabledLabel') }}</div>
            <div class="desc">{{ $t('admin.tracking.enabledHint') }}</div>
          </div>
          <el-switch
            :model-value="statsEnabled"
            :loading="savingEnabled"
            :disabled="savingEnabled"
            @change="onEnabledChange"
          />
        </div>
        <div class="row">
          <div class="tc-text">
            <div class="lab">{{ $t('admin.tracking.visibleLabel') }}</div>
            <div class="desc">{{ $t('admin.tracking.visibleHint') }}</div>
          </div>
          <!-- A2: 受控绑定：切换前 statsMode 仍为旧值，onModeChange 内取 prev 才是真正的回滚目标 -->
          <el-radio-group :model-value="statsMode" :disabled="savingVisible" @change="onModeChange">
            <el-radio value="off">{{ $t('tracking.modeOff') }}</el-radio>
            <el-radio value="hidden">{{ $t('tracking.modeHidden') }}</el-radio>
            <el-radio value="on">{{ $t('tracking.modeOn') }}</el-radio>
          </el-radio-group>
        </div>
        <div class="row">
          <div class="tc-text">
            <div class="lab">{{ $t('admin.tracking.daysLabel') }}</div>
            <div class="desc">{{ $t('admin.tracking.daysHint') }}</div>
          </div>
          <el-select v-model="days" size="small" style="width: 128px" @change="loadSummary">
            <el-option v-for="d in dayOptions" :key="d" :label="$t(`admin.tracking.days${d}`)" :value="d" />
          </el-select>
        </div>
      </el-card>
    </div>

    <!-- 下单漏斗 -->
    <el-card shadow="never" class="admin-section-card admin-section-card--stack">
      <template #header><span class="card-title">{{ $t('admin.tracking.funnelTitle') }}</span></template>
      <el-table v-if="funnel.length" :data="funnel" stripe>
        <el-table-column :label="$t('admin.tracking.colName')" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.tracking.colCount')" width="120" align="right">
          <template #default="{ row }">{{ row.count }}</template>
        </el-table-column>
        <!-- 824 响应式巡逻：占比列右固定，防窄屏藏进表内横滚 -->
        <el-table-column :label="$t('admin.tracking.colRatio')" width="160" align="right" fixed="right">
          <template #default="{ row }">{{ ratio(row.count) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.tracking.empty')" />
    </el-card>

    <!-- 事件分布 + 按日趋势（不引图表库，表格直出） -->
    <div class="track-grid">
      <el-card shadow="never" class="admin-section-card admin-section-card--stack">
        <template #header><span class="card-title">{{ $t('admin.tracking.byNameTitle') }}</span></template>
        <el-table :data="byName" stripe max-height="420">
          <el-table-column prop="name" :label="$t('admin.tracking.colName')" show-overflow-tooltip />
          <el-table-column prop="count" :label="$t('admin.tracking.colCount')" width="120" align="right" />
        </el-table>
      </el-card>
      <el-card shadow="never" class="admin-section-card admin-section-card--stack">
        <template #header><span class="card-title">{{ $t('admin.tracking.byDayTitle') }}</span></template>
        <el-table :data="byDay" stripe max-height="420">
          <el-table-column prop="day" :label="$t('admin.tracking.colDay')" width="140" />
          <el-table-column :label="$t('admin.tracking.colCount')" width="120" align="right">
            <template #default="{ row }">{{ row.count }}</template>
          </el-table-column>
          <!-- 简单比例条：不引图表库，用 el-progress 手写 -->
          <el-table-column :label="$t('admin.tracking.colRatio')" min-width="140">
            <template #default="{ row }">
              <el-progress :percentage="dayRatio(row.count)" :stroke-width="10" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index'
import type { TrackingSummary, StatsMode } from '../../api/types'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const loading = ref(true)
const summary = ref<TrackingSummary | null>(null)
const statsMode = ref<StatsMode>('hidden')
const savingVisible = ref(false)
/** 820-L：统计功能总开关（默认关闭） */
const statsEnabled = ref(false)
const savingEnabled = ref(false)
const days = ref(30)
const dayOptions = [7, 14, 30, 90]

const funnel = computed(() => summary.value?.funnel || [])
const byName = computed(() => summary.value?.byName || [])
const byDay = computed(() => summary.value?.byDay || [])

function ratio(count: number) {
  const total = summary.value?.total
  if (!total) return '0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function dayRatio(count: number) {
  const total = summary.value?.total
  if (!total) return 0
  return Math.round((count / total) * 100)
}

async function onModeChange(v: string | number | boolean) {
  const prev = statsMode.value
  savingVisible.value = true
  try {
    const res = await adminApi.setTrackingConfig(v as StatsMode)
    statsMode.value = res.statsMode
    ElMessage.success(t('tracking.saved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    // 失败回滚（后端为准，不本地存）
    statsMode.value = prev
  } finally {
    savingVisible.value = false
  }
}

/** 820-L：总开关切换（失败回滚，与三态开关同口径） */
async function onEnabledChange(v: string | number | boolean) {
  const prev = statsEnabled.value
  savingEnabled.value = true
  try {
    const res = await adminApi.setStatsEnabled(!!v)
    statsEnabled.value = res.statsEnabled
    ElMessage.success(t('tracking.saved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
    statsEnabled.value = prev
  } finally {
    savingEnabled.value = false
  }
}

// 天数快切竞态守卫：仅最新一次请求可写 summary/loading（对齐项目 seq 模式）
let summarySeq = 0
async function loadSummary() {
  const mySeq = ++summarySeq
  loading.value = true
  try {
    const res = await adminApi.getTrackingSummary(days.value)
    if (mySeq !== summarySeq) return
    summary.value = res
  } catch (err) {
    if (mySeq !== summarySeq) return
    ElMessage.error((err as Error).message)
  } finally {
    if (mySeq === summarySeq) loading.value = false
  }
}

onMounted(async () => {
  const mySeq = ++summarySeq
  loading.value = true
  try {
    const [s, cfg] = await Promise.all([
      adminApi.getTrackingSummary(days.value),
      adminApi.getTrackingConfig()
    ])
    if (mySeq !== summarySeq) return
    summary.value = s
    statsMode.value = cfg.statsMode || 'hidden'
    statsEnabled.value = !!cfg.statsEnabled
  } catch (err) {
    if (mySeq !== summarySeq) return
    ElMessage.error((err as Error).message)
  } finally {
    if (mySeq === summarySeq) loading.value = false
  }
})
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

/* 统计卡 */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4, 16px); }
.stat-num {
  font-size: 30px; font-weight: bold; color: var(--ink);
  font-family: var(--f-d); text-align: center;
  font-variant-numeric: tabular-nums; margin-top: var(--sp-2, 8px);
}
.stat-label { color: var(--ink2); font-size: 13px; text-align: center; margin-bottom: var(--sp-2, 8px); }
.track-config-card { grid-column: span 2; }

/* 819-I：一行一事（说明在左、控件在右，对齐 QuickNote 基准） */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.tc-text { min-width: 0; }

/* 区块卡 */
.admin-section-card--stack { margin-top: var(--sp-5, 24px); }
.card-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }

/* 813-fq-tail-shared 战役 S：断点 768 → 900，对齐全站管理后台两档（≤900px 紧凑） */
.track-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4, 16px); margin-top: var(--sp-5, 24px); }
@media (max-width: 900px) {
  .stat-grid { grid-template-columns: 1fr; }
  .track-config-card { grid-column: auto; }
  .track-grid { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
