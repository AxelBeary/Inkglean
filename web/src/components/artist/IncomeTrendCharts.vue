<template>
  <div class="itc">
    <div v-if="loading" class="itc-loading">{{ $t('toolsExport.incomeLoading') }}</div>
    <template v-else-if="loadFailed">
      <p class="itc-empty">{{ $t('toolsExport.incomeTrendFailed') }}</p>
    </template>
    <template v-else>
      <p v-if="empty" class="itc-empty">{{ $t('toolsExport.incomeTrendEmpty') }}</p>
      <div v-show="!empty" class="itc-grid">
        <div class="itc-cell">
          <h4 class="itc-cell-title">{{ $t('toolsExport.incomeMonthlyTitle') }}</h4>
          <div class="itc-canvas-wrap"><canvas ref="barCanvas"></canvas></div>
        </div>
        <div class="itc-cell">
          <h4 class="itc-cell-title">{{ $t('toolsExport.incomeCumulativeTitle') }}</h4>
          <div class="itc-canvas-wrap"><canvas ref="lineCanvas"></canvas></div>
        </div>
        <!-- oimimo 吸纳补遗：画风收入分布环图 + 客户消费排名 -->
        <div class="itc-cell">
          <h4 class="itc-cell-title">{{ $t('toolsExport.incomeStyleTitle') }}</h4>
          <p v-if="styleEmpty" class="itc-sub-empty">{{ $t('toolsExport.incomeDistEmpty') }}</p>
          <div v-else class="itc-canvas-wrap"><canvas ref="doughnutCanvas"></canvas></div>
        </div>
        <div class="itc-cell">
          <h4 class="itc-cell-title">{{ $t('toolsExport.incomeClientsTitle') }}</h4>
          <p v-if="!topClients.length" class="itc-sub-empty">{{ $t('toolsExport.incomeDistEmpty') }}</p>
          <ol v-else class="itc-clients">
            <li v-for="(c, i) in topClients" :key="c.clientQq" class="itc-client">
              <span class="itc-client-rank">{{ i + 1 }}</span>
              <span class="itc-client-name">{{ c.clientName || c.clientQq }}</span>
              <span class="itc-client-count">{{ $t('toolsExport.incomeClientOrders', { n: c.orderCount }) }}</span>
              <span class="itc-client-amt">{{ formatYuan(c.totalCents) }}</span>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// oimimo 吸纳批四：收入趋势图（月度堆叠柱 + 累计折线）
// 数据源与页面收入概览/导出 CSV 同源同口径（订单收款流水 + 散单记账，按到账日归属本地月）；
// Chart.js 动态加载（独立 chunk，不用图表的页面不承担体积）
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChartConfiguration } from 'chart.js'
import { artistApi } from '../../api/index.js'
import { formatYuan } from '../../utils/money.js'
import { INK_PALETTE } from '../../utils/ink-palette.js'
import { buildCumulative, isIncomeEmpty, monthLabels } from '../../utils/income-chart.js'
import type { IncomeMonthLike } from '../../utils/income-chart.js'
import type { IncomeByStyleRow, TopClientRow } from '../../api/types.js'

/** 图表实例最小形状（不导出 Chart 类型依赖到组件签名） */
interface ChartLike { destroy: () => void }

const { t, locale } = useI18n()

const rows = ref<IncomeMonthLike[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const empty = computed(() => isIncomeEmpty(rows.value))

// oimimo 吸纳补遗：画风分布 + 客户排名（独立失败隔离，不拖主图）
const styleRows = ref<IncomeByStyleRow[]>([])
const topClients = ref<TopClientRow[]>([])
const styleEmpty = computed(() => styleRows.value.length === 0)

const barCanvas = ref<HTMLCanvasElement | null>(null)
const lineCanvas = ref<HTMLCanvasElement | null>(null)
const doughnutCanvas = ref<HTMLCanvasElement | null>(null)
let barChart: ChartLike | null = null
let lineChart: ChartLike | null = null
let doughnutChart: ChartLike | null = null

/** 环图色板：宣纸色谱轮换（花青/松绿/朱砂/墨四/墨二；canvas 色板无藤黄 th，用墨阶补位） */
const DOUGHNUT_COLORS = [INK_PALETTE.hq, INK_PALETTE.sl, INK_PALETTE.zs, INK_PALETTE.ink4, INK_PALETTE.ink2]

function destroyCharts() {
  barChart?.destroy()
  lineChart?.destroy()
  doughnutChart?.destroy()
  barChart = null
  lineChart = null
  doughnutChart = null
}

async function renderCharts() {
  if (empty.value || !barCanvas.value || !lineCanvas.value) return
  const { default: Chart } = await import('chart.js/auto')
  destroyCharts()

  const labels = monthLabels(rows.value, locale.value)
  const axisColor = INK_PALETTE.ink3
  const gridColor = INK_PALETTE.line

  // 月度收入：订单收款 + 散单堆叠（宣纸色谱：花青/松绿）
  const barConfig: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: t('toolsExport.incomeOrder'),
          data: rows.value.map(r => r.orderCents / 100),
          backgroundColor: INK_PALETTE.hq,
          stack: 'income'
        },
        {
          label: t('toolsExport.incomeStandalone'),
          data: rows.value.map(r => r.standaloneCents / 100),
          backgroundColor: INK_PALETTE.sl,
          stack: 'income'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: INK_PALETTE.ink2 } } },
      scales: {
        x: { stacked: true, ticks: { color: axisColor }, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { color: axisColor, callback: (value) => formatYuan(Number(value) * 100) },
          grid: { color: gridColor }
        }
      }
    }
  }

  // 累计：滚动 12 月窗口逐月累加（朱砂单线）
  const lineConfig: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: t('toolsExport.incomeCumulativeTitle'),
        data: buildCumulative(rows.value).map(c => c / 100),
        borderColor: INK_PALETTE.zs,
        backgroundColor: INK_PALETTE.zsT,
        pointBackgroundColor: INK_PALETTE.zs,
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: axisColor }, grid: { display: false } },
        y: {
          ticks: { color: axisColor, callback: (value) => formatYuan(Number(value) * 100) },
          grid: { color: gridColor }
        }
      }
    }
  }

  barChart = new Chart(barCanvas.value, barConfig) as unknown as ChartLike
  lineChart = new Chart(lineCanvas.value, lineConfig) as unknown as ChartLike
}

/** 画风收入分布环图（空串桶落「未分类」；图例置底） */
async function renderDoughnut() {
  if (styleEmpty.value || !doughnutCanvas.value) return
  const { default: Chart } = await import('chart.js/auto')
  doughnutChart?.destroy()
  doughnutChart = null

  const labels = styleRows.value.map(s => s.styleName || t('toolsExport.incomeUncategorized'))
  const doughnutConfig: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: styleRows.value.map(s => s.cents / 100),
        backgroundColor: labels.map((_l, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length]),
        borderColor: INK_PALETTE.paper2,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: INK_PALETTE.ink2 } }
      }
    }
  }
  doughnutChart = new Chart(doughnutCanvas.value, doughnutConfig) as unknown as ChartLike
}

async function load() {
  loading.value = true
  loadFailed.value = false
  let fetched: IncomeMonthLike[] = []
  try {
    const res = await artistApi.getIncomeMonthly({ months: 12 })
    fetched = res.months
  } catch {
    loadFailed.value = true
  }
  // 分布两聚合：各自独立失败隔离（失败落空态，不拖主图）
  try { styleRows.value = (await artistApi.getIncomeByStyle({ months: 12 })).styles } catch { styleRows.value = [] }
  try { topClients.value = (await artistApi.getTopClients({ months: 12 })).clients } catch { topClients.value = [] }
  loading.value = false
  if (loadFailed.value) return
  // 时序关键：先落 loading=false 让画布进 DOM，再等一拍渲染图表（首版在 loading 态画布缺席导致画不出，测试抓出）
  rows.value = fetched
  await nextTick()
  await renderCharts()
  await renderDoughnut()
}

onMounted(() => { void load() })
onBeforeUnmount(destroyCharts)
</script>

<style scoped>
/* 纸墨 token 体系，亮暗双主题自动适配 */
.itc-loading,
.itc-empty {
  padding: 16px 0;
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 13px);
}
.itc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 960px) {
  .itc-grid { grid-template-columns: 1fr; }
}
.itc-cell { min-width: 0; }
.itc-cell-title {
  margin: 0 0 8px;
  font-size: calc(var(--font-scale, 1) * 14px);
  font-weight: 600;
  color: var(--ink);
}
.itc-canvas-wrap {
  height: 240px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: var(--paper2);
}

/* oimimo 吸纳补遗：分布区空态 + 客户排名榜 */
.itc-sub-empty {
  padding: 8px 0;
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 13px);
}
.itc-clients {
  list-style: none;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  background: var(--paper2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.itc-client {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: baseline;
  font-size: calc(var(--font-scale, 1) * 13px);
}
.itc-client-rank { color: var(--ink3); font-variant-numeric: tabular-nums; }
.itc-client:first-child .itc-client-rank { color: var(--zs); font-weight: 700; }
.itc-client-name { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.itc-client-count { color: var(--ink3); }
.itc-client-amt { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
