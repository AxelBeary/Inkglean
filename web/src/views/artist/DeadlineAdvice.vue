<template>
  <ArtistLayout>
    <div class="deadline-page">
      <h2 class="od-page-title">{{ $t('deadlineAdvice.title') }}</h2>
      <p class="page-sub">{{ $t('deadlineAdvice.subtitle') }}</p>

      <div class="deadline-form">
        <div class="deadline-field">
          <div class="deadline-field-label">{{ $t('deadlineAdvice.workDays') }}</div>
          <el-input-number v-model="workDays" :min="1" :max="365" :step="1" style="width: 160px" />
        </div>

        <div class="deadline-field">
          <div class="deadline-field-label">{{ $t('deadlineAdvice.queueMode') }}</div>
          <el-switch v-model="includeQueue" active-text="" inactive-text="" />
          <span class="deadline-field-hint">{{ $t('deadlineAdvice.queueHint', { n: queueDays }) }}</span>
        </div>

        <div class="deadline-field">
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
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { artistApi } from '../../api/index.js'

// 简单 MVP：建议日期 = 今天 + 工期天数 + 队列缓冲（正式队列每单 + 1 天）
const BUFFER_DAYS_PER_ORDER = 1
const workDays = ref(3)
const includeQueue = ref(true)
const queueCount = ref(0)
const result = ref(null)

const queueDays = BUFFER_DAYS_PER_ORDER

/** 周几文案（走 i18n，weekdays.0=周日 … 6=周六） */
const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const { t } = useI18n()

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
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
.page-sub { margin-top: 6px; color: var(--ink3, #888); font-size: 13px; }

.deadline-form {
  margin-top: 20px; padding: 18px 20px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #e5e5e5);
  border-radius: var(--r-m, 8px);
  display: flex; flex-direction: column; gap: 16px;
}
.deadline-field { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.deadline-field-label { font-size: 14px; font-weight: 600; color: var(--ink2, #555); min-width: 110px; }
.deadline-field-hint { font-size: 12px; color: var(--ink3, #888); }

.deadline-result {
  margin-top: 20px; padding: 22px 24px;
  background: var(--card, #fff);
  border: 1px solid var(--hq, var(--el-color-primary));
  border-radius: var(--r-m, 8px);
  box-shadow: var(--sh-1, 0 1px 3px rgba(0, 0, 0, 0.06));
}
.deadline-result-main { text-align: center; padding-bottom: 16px; border-bottom: 1px solid var(--line, #e5e5e5); }
.deadline-result-label { font-size: 13px; color: var(--ink3, #888); }
.deadline-result-date { margin-top: 6px; font-size: 32px; font-weight: 700; color: var(--hq, var(--el-color-primary)); letter-spacing: .02em; }
.deadline-result-week { margin-top: 4px; font-size: 14px; color: var(--ink2, #555); }

.deadline-result-breakdown { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.deadline-line { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--ink2, #555); }
.deadline-line--total { font-weight: 600; color: var(--ink); }
.deadline-disclaimer { margin-top: 14px; font-size: 12px; color: var(--ink3, #888); }
</style>

