<template>
  <!-- 自定义首页批二（子代理 E）：本月收入概览（可选板块，板块库添加后才上首页）
       数据源 = artistApi.getIncomeOverview()；金额分转元统一走 money.ts（formatYuan = ¥ + formatCents）；
       视觉事实源 = proto-dashboard-drag-820.html #incomeMonth -->
  <el-card shadow="hover" class="income-month-card">
    <template #header>
      <CardHead :title="t('dashboardPrefs.moduleIncomeMonth')" />
    </template>

    <!-- 错误态 -->
    <div v-if="state === 'error'" class="module-error">
      <span>{{ t('dashboardPrefs.moduleLoadError') }}</span>
      <el-button size="small" @click="load">{{ t('dashboardPrefs.retry') }}</el-button>
    </div>

    <!-- 加载态：骨架格 -->
    <div v-else-if="state === 'loading'" class="im-skeleton" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="im-skeleton-cell"></div>
    </div>

    <!-- 三数字：本月到账 / 待收尾款（+N 单待收小字）/ 今年累计（顺序同原型 820） -->
    <div v-else-if="data" class="im-grid">
      <div class="im-cell">
        <div class="im-num">{{ formatYuan(data.monthReceivedCents) }}</div>
        <div class="im-lab">{{ t('dashboardPrefs.incomeMonthReceived') }}</div>
      </div>
      <div class="im-cell">
        <div class="im-num">{{ formatYuan(data.pendingCents) }}</div>
        <div class="im-lab">{{ t('dashboardPrefs.incomePending') }}</div>
        <div class="im-sub">{{ t('dashboardPrefs.incomePendingCount', { n: data.pendingCount }) }}</div>
      </div>
      <div class="im-cell">
        <div class="im-num">{{ formatYuan(data.yearReceivedCents) }}</div>
        <div class="im-lab">{{ t('dashboardPrefs.incomeYearCumulative') }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index'
import type { IncomeOverview } from '../../../api/types'
import CardHead from '../visual/CardHead.vue'
import { formatYuan } from '../../../utils/money'

const { t } = useI18n()
const state = ref<'loading' | 'ok' | 'error'>('loading')
const data = ref<IncomeOverview | null>(null)

async function load() {
  state.value = 'loading'
  try {
    data.value = await artistApi.getIncomeOverview()
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

onMounted(() => load())
</script>

<style scoped>
/* 纸墨卡片（与 ActivityFeed 同手法：纸边圆角 + hover 只深阴影不抬升） */
.income-month-card {
  background: var(--card);
  border: none;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}

.im-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}
.im-cell { min-width: 0; }
.im-num {
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 18px);
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.im-lab {
  margin-top: 4px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
}
/* 「{n} 单待收」小字（只挂在待收尾款下） */
.im-sub {
  margin-top: 4px;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink4);
  font-variant-numeric: tabular-nums;
}

/* 骨架格（脉动） */
.im-skeleton {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.im-skeleton-cell {
  height: 56px;
  border-radius: var(--r-m);
  background: var(--paper2);
  animation: income-month-pulse 1.2s ease-in-out infinite;
}
@keyframes income-month-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

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
