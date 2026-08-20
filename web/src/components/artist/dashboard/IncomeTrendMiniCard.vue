<template>
  <!-- 自定义首页批二（子代理 E）：收入趋势 mini 柱状图（可选板块，板块库添加后才上首页）
       数据源 = artistApi.getIncomeMonthly({ months: 12 })，与统计导出页收入趋势同源同口径；
       div 柱渲染（不引 Chart.js），花青柱色；视觉事实源 = proto-dashboard-drag-820.html #incomeChart -->
  <el-card shadow="hover" class="income-trend-card">
    <template #header>
      <CardHead :title="t('dashboardPrefs.moduleIncomeChart')" />
    </template>

    <!-- 错误态 -->
    <div v-if="state === 'error'" class="module-error">
      <span>{{ t('dashboardPrefs.moduleLoadError') }}</span>
      <el-button size="small" @click="load">{{ t('dashboardPrefs.retry') }}</el-button>
    </div>

    <!-- 加载态：骨架柱 -->
    <div v-else-if="state === 'loading'" class="chart-skeleton" aria-hidden="true">
      <div v-for="i in 12" :key="i" class="chart-skeleton-bar"></div>
    </div>

    <!-- 空态：全窗口零收入 -->
    <p v-else-if="empty" class="chart-empty">{{ t('dashboardPrefs.incomeChartEmpty') }}</p>

    <!-- 柱状图（柱高 = 相对窗口最大值的百分比，纯函数 buildMiniBarHeights） -->
    <div v-else>
      <div class="mini-bars">
        <div
          v-for="(pct, i) in barHeights"
          :key="rows[i].month"
          class="mini-bar"
          :style="{ height: pct + '%' }"
          :title="`${rows[i].month} ${formatYuan(rows[i].totalCents)}`"
        ></div>
      </div>
      <div class="mini-note">
        <span>{{ edgeLabels[0] }}</span>
        <span>{{ edgeLabels[1] }}</span>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index'
import type { IncomeMonthRow } from '../../../api/types'
import CardHead from '../visual/CardHead.vue'
import { buildMiniBarHeights, isIncomeEmpty, monthLabels } from '../../../utils/income-chart'
import { formatYuan } from '../../../utils/money'

const { t, locale } = useI18n()
const state = ref<'loading' | 'ok' | 'error'>('loading')
const rows = ref<IncomeMonthRow[]>([])

const empty = computed(() => isIncomeEmpty(rows.value))
const barHeights = computed(() => buildMiniBarHeights(rows.value.map(r => r.totalCents)))
/** 首/末月标签（跨年首月与 1 月自带年份，monthLabels 既有口径） */
const edgeLabels = computed<[string, string]>(() => {
  const labels = monthLabels(rows.value, locale.value)
  return [labels[0] ?? '', labels[labels.length - 1] ?? '']
})

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getIncomeMonthly({ months: 12 })
    rows.value = res.months ?? []
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

onMounted(() => load())
</script>

<style scoped>
/* 纸墨卡片（与 ActivityFeed 同手法：纸边圆角 + hover 只深阴影不抬升） */
.income-trend-card {
  background: var(--card);
  border: none;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}

/* mini 柱：花青单色，底线一道墨线（原型 820） */
.mini-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 112px;
  padding: 8px 4px 0;
  border-bottom: 2px solid var(--ink);
}
.mini-bar {
  flex: 1;
  min-width: 0;
  background: var(--hq);
  border-radius: var(--r-s) var(--r-s) 0 0;
  min-height: 4px;
}
.mini-note {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  font-variant-numeric: tabular-nums;
}

.chart-empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 13px);
}

/* 骨架柱（脉动） */
.chart-skeleton {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 112px;
  padding: 8px 4px 0;
}
.chart-skeleton-bar {
  flex: 1;
  height: 40%;
  background: var(--paper2);
  border-radius: var(--r-s) var(--r-s) 0 0;
  animation: income-trend-pulse 1.2s ease-in-out infinite;
}
.chart-skeleton-bar:nth-child(odd) { height: 64%; }
.chart-skeleton-bar:nth-child(3n) { height: 84%; }
@keyframes income-trend-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* 错误态（与 ActivityFeed 同口径） */
.module-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
}
</style>
