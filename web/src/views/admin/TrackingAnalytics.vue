<template>
  <div class="admin-page" v-loading="loading">
    <!-- 顶部：总事件数 / 画师门面可见开关 / 天数选择 -->
    <div class="stat-grid">
      <el-card shadow="hover">
        <div class="stat-num">{{ summary?.total ?? '-' }}</div>
        <div class="stat-label">{{ $t('admin.tracking.total') }}</div>
      </el-card>
      <el-card shadow="hover" class="stat-card-center">
        <div class="stat-label">{{ $t('admin.tracking.visibleLabel') }}</div>
        <el-switch
          v-model="artistStatsVisible"
          :loading="savingVisible"
          @change="handleVisibleChange"
        />
      </el-card>
      <el-card shadow="hover" class="stat-card-center">
        <div class="stat-label">{{ $t('admin.tracking.daysLabel') }}</div>
        <el-select v-model="days" size="small" style="width: 120px" @change="loadSummary">
          <el-option v-for="d in dayOptions" :key="d" :label="$t(`admin.tracking.days${d}`)" :value="d" />
        </el-select>
      </el-card>
    </div>

    <!-- 下单漏斗 -->
    <el-card style="margin-top: 24px">
      <template #header><span>{{ $t('admin.tracking.funnelTitle') }}</span></template>
      <el-table v-if="funnel.length" :data="funnel" stripe>
        <el-table-column :label="$t('admin.tracking.colName')">
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
      <el-card>
        <template #header><span>{{ $t('admin.tracking.byNameTitle') }}</span></template>
        <el-table :data="byName" stripe max-height="420">
          <el-table-column prop="name" :label="$t('admin.tracking.colName')" show-overflow-tooltip />
          <el-table-column prop="count" :label="$t('admin.tracking.colCount')" width="120" align="right" />
        </el-table>
      </el-card>
      <el-card>
        <template #header><span>{{ $t('admin.tracking.byDayTitle') }}</span></template>
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
const artistStatsVisible = ref(false)
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

async function handleVisibleChange(val) {
  savingVisible.value = true
  try {
    const res = await adminApi.setTrackingConfig(val)
    artistStatsVisible.value = res.artistStatsVisible
    ElMessage.success(t('admin.tracking.visibleSaved'))
  } catch (err) {
    ElMessage.error(err.message)
    // 失败回滚开关（后端为准，不本地存）
    artistStatsVisible.value = !val
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
    artistStatsVisible.value = !!cfg.artistStatsVisible
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026，管理后台从简，与 AdminDashboard 同风格） ═══ */
.admin-page { }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-num { font-size: 28px; font-weight: bold; color: var(--ink); font-family: var(--f-d); text-align: center; font-variant-numeric: tabular-nums; }
.stat-label { color: var(--ink2); font-size: 13px; text-align: center; margin-bottom: 8px; }
.stat-card-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.track-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: 1fr; }
  .track-grid { grid-template-columns: 1fr; }
}
</style>