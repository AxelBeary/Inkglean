<template>
  <div class="admin-page" v-loading="loading">
    <!-- 页头 -->
    <div class="page-head">
      <div>
        <h1 class="page-title font-display">{{ $t('admin.tracking.title') }}</h1>
        <p class="page-sub">{{ $t('admin.trackingSubtitle') }}</p>
      </div>
    </div>

    <!-- 顶部：总事件数 / 画师门面可见开关 / 天数选择 -->
    <div class="stat-grid">
      <el-card shadow="never" class="stat-card">
        <div class="stat-num">{{ summary?.total ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.tracking.total') }}</div>
      </el-card>
      <el-card shadow="never" class="stat-card stat-card-center">
        <div class="stat-label">{{ $t('admin.tracking.visibleLabel') }}</div>
        <el-radio-group v-model="statsMode" :disabled="savingVisible" @change="onModeChange">
          <el-radio value="off">{{ $t('tracking.modeOff') }}</el-radio>
          <el-radio value="hidden">{{ $t('tracking.modeHidden') }}</el-radio>
          <el-radio value="on">{{ $t('tracking.modeOn') }}</el-radio>
        </el-radio-group>
      </el-card>
      <el-card shadow="never" class="stat-card stat-card-center">
        <div class="stat-label">{{ $t('admin.tracking.daysLabel') }}</div>
        <el-select v-model="days" size="small" style="width: 120px" @change="loadSummary">
          <el-option v-for="d in dayOptions" :key="d" :label="$t(`admin.tracking.days${d}`)" :value="d" />
        </el-select>
      </el-card>
    </div>

    <!-- 下单漏斗 -->
    <el-card shadow="never" class="section-card">
      <template #header><span class="card-title">{{ $t('admin.tracking.funnelTitle') }}</span></template>
      <el-table v-if="funnel.length" :data="funnel" stripe>
        <el-table-column :label="$t('admin.tracking.colName')" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.tracking.colCount')" width="120" align="right">
          <template #default="{ row }">{{ row.count }}</template>
        </el-table-column>
        <el-table-column :label="$t('admin.tracking.colRatio')" width="160" align="right">
          <template #default="{ row }">{{ ratio(row.count) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="$t('admin.tracking.empty')" />
    </el-card>

    <!-- 事件分布 + 按日趋势（不引图表库，表格直出） -->
    <div class="track-grid">
      <el-card shadow="never" class="section-card">
        <template #header><span class="card-title">{{ $t('admin.tracking.byNameTitle') }}</span></template>
        <el-table :data="byName" stripe max-height="420">
          <el-table-column prop="name" :label="$t('admin.tracking.colName')" show-overflow-tooltip />
          <el-table-column prop="count" :label="$t('admin.tracking.colCount')" width="120" align="right" />
        </el-table>
      </el-card>
      <el-card shadow="never" class="section-card">
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

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const loading = ref(true)
const summary = ref(null)
const statsMode = ref('hidden')
const savingVisible = ref(false)
const days = ref(30)
const dayOptions = [7, 14, 30, 90]

const funnel = computed(() => summary.value?.funnel || [])
const byName = computed(() => summary.value?.byName || [])
const byDay = computed(() => summary.value?.byDay || [])

function ratio(count) {
  const total = summary.value?.total
  if (!total) return '0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function dayRatio(count) {
  const total = summary.value?.total
  if (!total) return 0
  return Math.round((count / total) * 100)
}

async function loadSummary() {
  loading.value = true
  try {
    summary.value = await adminApi.getTrackingSummary(days.value)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function onModeChange(v) {
  const prev = statsMode.value
  savingVisible.value = true
  try {
    const res = await adminApi.setTrackingConfig(v)
    statsMode.value = res.statsMode
    ElMessage.success(t('tracking.saved'))
  } catch (err) {
    ElMessage.error(err.message)
    // 失败回滚（后端为准，不本地存）
    statsMode.value = prev
  } finally {
    savingVisible.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const [s, cfg] = await Promise.all([
      adminApi.getTrackingSummary(days.value),
      adminApi.getTrackingConfig()
    ])
    summary.value = s
    statsMode.value = cfg.statsMode || 'hidden'
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
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

/* 统计卡 */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4, 16px); }
.stat-card { border-radius: var(--r-l, 11px); border: 1px solid var(--line); transition: box-shadow .15s, transform .15s ease-out; }
.stat-card:hover { box-shadow: var(--sh-2); transform: translateY(-1px); }
.stat-num {
  font-size: 30px; font-weight: bold; color: var(--ink);
  font-family: var(--f-d); text-align: center;
  font-variant-numeric: tabular-nums; margin-top: var(--sp-2, 8px);
}
.stat-label { color: var(--ink2); font-size: 13px; text-align: center; margin-bottom: var(--sp-2, 8px); }
.stat-card-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2, 8px); padding: var(--sp-3, 12px) 0; }

/* 区块卡 */
.section-card { border-radius: var(--r-l, 11px); border: 1px solid var(--line); margin-top: var(--sp-5, 24px); }
.card-title { font-size: var(--fs-section, 17px); font-weight: 600; color: var(--ink); }

.track-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4, 16px); margin-top: var(--sp-5, 24px); }
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: 1fr; }
  .track-grid { grid-template-columns: 1fr; }
}
</style>
