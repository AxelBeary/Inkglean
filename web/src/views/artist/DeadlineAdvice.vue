<template>
  <div class="deadline-page">
    <h2 class="od-page-title">{{ $t('deadlineAdvice.title') }}</h2>
    <p class="page-sub">{{ $t('deadlineAdvice.subtitle') }}</p>

    <!-- 818-H：计算控制按行结构整理（说明在左、控件在右） -->
    <div class="group deadline-form">
      <div class="group-head">{{ $t('deadlineAdvice.groupCalc') }}</div>
      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('deadlineAdvice.workDays') }}</div>
          <div class="desc">{{ $t('deadlineAdvice.workDaysDesc') }}</div>
        </div>
        <div class="ctrl">
          <el-input-number v-model="workDays" :min="1" :max="365" :step="1" class="da-input" />
        </div>
      </div>

      <div class="row">
        <div class="field-text">
          <div class="lab">{{ $t('deadlineAdvice.queueMode') }}</div>
          <div class="desc">{{ $t('deadlineAdvice.queueHint', { n: queueCount }) }}</div>
        </div>
        <div class="ctrl ctrl--switch">
          <el-switch v-model="includeQueue" active-text="" inactive-text="" :aria-label="$t('deadlineAdvice.queueMode')" />
        </div>
      </div>

      <div class="form-actions">
        <el-button type="primary" @click="compute">{{ $t('deadlineAdvice.compute') }}</el-button>
      </div>
    </div>

    <!-- 结果 -->
    <div v-if="result" class="deadline-result">
      <div class="deadline-result-main">
        <div class="deadline-result-label">{{ $t('deadlineAdvice.resultLabel') }}</div>
        <div class="deadline-result-date">{{ result.date }}</div>
        <div class="deadline-result-week">{{ result.week }}</div>
      </div>
      <div class="deadline-result-breakdown">
        <div class="deadline-line"><span>{{ $t('deadlineAdvice.today') }}</span><span>{{ result.today }}</span></div>
        <div class="deadline-line"><span>{{ $t('deadlineAdvice.workDaysShort') }}</span><span>{{ result.workDays }} {{ $t('deadlineAdvice.daysUnit') }}</span></div>
        <div v-if="includeQueue" class="deadline-line">
          <span>{{ $t('deadlineAdvice.queueBuffer') }}</span><span>{{ result.queueCount }} {{ $t('deadlineAdvice.ordersUnit') }} × {{ result.queueDays }} {{ $t('deadlineAdvice.daysUnit') }}</span>
        </div>
        <div class="deadline-line deadline-line--total"><span>{{ $t('deadlineAdvice.totalDays') }}</span><span>{{ result.totalDays }} {{ $t('deadlineAdvice.daysUnit') }}</span></div>
      </div>
      <p class="deadline-disclaimer">{{ $t('deadlineAdvice.disclaimer') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../api/index.js'

/** 交稿日推算结果 */
interface DeadlineResult {
  today: string
  date: string
  week: string
  workDays: number
  queueCount: number
  queueDays: number
  totalDays: number
}

// 简单 MVP：建议日期 = 今天 + 工期天数 + 队列缓冲（正式队列每单 + 1 天）
const BUFFER_DAYS_PER_ORDER = 1
const workDays = ref(3)
const includeQueue = ref(true)
const queueCount = ref(0)
const result = ref<DeadlineResult | null>(null)

/** 周几文案（走 i18n，weekdays.0=周日 … 6=周六） */
const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const { t } = useI18n()

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function compute() {
  const base = new Date()
  const days = workDays.value + (includeQueue.value ? queueCount.value * BUFFER_DAYS_PER_ORDER : 0)
  const target = addDays(base, days)
  result.value = {
    today: formatDate(base),
    date: formatDate(target),
    week: t('deadlineAdvice.weekdays.' + WEEK_KEYS[target.getDay()]),
    workDays: workDays.value,
    queueCount: queueCount.value,
    queueDays: queueCount.value * BUFFER_DAYS_PER_ORDER,
    totalDays: days
  }
}

onMounted(async () => {
  try {
    const queue = await artistApi.getQueue()
    queueCount.value = Array.isArray(queue) ? queue.length : 0
  } catch {
    queueCount.value = 0
  }
})
</script>


<style scoped>
/* 纸墨 token 体系（--ink/--paper/--hq/--card/--line），亮暗双主题自动适配 */
.deadline-page { padding: 24px; max-width: 860px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.page-sub { margin-top: 6px; color: var(--ink3); font-size: 13px; }

.deadline-form {
  margin-top: 20px;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}

/* 818-H 三原则：分组卡片收纳，组头带朱砂小印点 */
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

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
.da-input { width: 160px; }
.form-actions { display: flex; justify-content: flex-end; padding: 12px 0 0; }

.deadline-result {
  margin-top: 20px; padding: 22px 24px;
  background: var(--card);
  border: 1px solid var(--hq, var(--el-color-primary));
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.deadline-result-main { text-align: center; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.deadline-result-label { font-size: 13px; color: var(--ink3); }
.deadline-result-date { margin-top: 6px; font-size: 32px; font-weight: 700; color: var(--hq, var(--el-color-primary)); letter-spacing: .02em; }
.deadline-result-week { margin-top: 4px; font-size: 14px; color: var(--ink2); }

.deadline-result-breakdown { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.deadline-line { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--ink2); }
.deadline-line--total { font-weight: 600; color: var(--ink); }
.deadline-disclaimer { margin-top: 14px; font-size: 12px; color: var(--ink3); }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .ctrl--switch { width: auto; }
}
</style>
