<template>
  <div class="stats-page" v-loading="loading">
    <h2 class="od-page-title">{{ $t('stats.title') }}</h2>

    <!-- 总览卡：总事件数 -->
    <div class="stats-overview" v-if="data">
      <div class="stats-overview-item">
        <div class="stats-overview-num">{{ data.total }}</div>
        <div class="stats-overview-label">{{ $t('stats.totalEvents') }}</div>
      </div>
    </div>

    <!-- 按日趋势：柱状图（纯 CSS/div 实现，不引图表库） -->
    <div class="stats-section" v-if="byDay.length">
      <h3 class="od-section-title">{{ $t('stats.byDay') }}</h3>
      <div class="stats-bars">
        <div v-for="d in byDay" :key="d.day" class="stats-bar-col">
          <div class="stats-bar" :style="{ height: barHeight(d.count) }" :title="`${d.day}: ${d.count}`"></div>
          <div class="stats-bar-label">{{ shortDay(d.day) }}</div>
        </div>
      </div>
    </div>

    <!-- 事件明细：byName 列表 -->
    <div class="stats-section" v-if="byName.length">
      <h3 class="od-section-title">{{ $t('stats.byName') }}</h3>
      <div class="stats-list">
        <div v-for="e in byName" :key="e.name" class="stats-list-row">
          <span class="stats-list-name">{{ $t(`stats.events.${e.name}`, e.name) }}</span>
          <span class="stats-list-count">{{ e.count }}</span>
        </div>
      </div>
    </div>

    <!-- 已开启但暂无数据 -->
    <div v-if="mode === 'on' && !byDay.length && !byName.length" class="stats-disabled">
      {{ $t('stats.empty') }}
    </div>

    <!-- 未开启/不显示：提示去管理后台开启 -->
    <div v-if="mode !== 'on'" class="stats-disabled">
      {{ $t('stats.disabledHint') }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi } from '../../api/index.js'

const loading = ref(true)
const data = ref(null)
const mode = ref('')
const byDay = ref([])
const byName = ref([])

const MAX_BAR = 80

function barHeight(count) {
  const max = Math.max(...byDay.value.map(d => d.count), 1)
  return Math.max(4, Math.round((count / max) * MAX_BAR)) + 'px'
}
function shortDay(day) {
  return String(day).slice(5) // 'YYYY-MM-DD' → 'MM-DD'
}

onMounted(async () => {
  try {
    // REQ-033: 画师自己的事件统计（管理员三态控制：off 关 / hidden 不显 / on 开）
    const res = await artistApi.getMyTrackingSummary(14)
    mode.value = res.mode
    if (res.enabled) {
      data.value = { total: res.total }
      byDay.value = res.byDay || []
      byName.value = res.byName || []
    }
  } catch {
    // 静默失败，展示 disabled 提示即可
    mode.value = 'hidden'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stats-page { padding: 24px; }
.od-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.stats-overview { display: flex; gap: 16px; margin: 16px 0; }
.stats-overview-item {
  background: var(--card, #fff); border: 1px solid var(--line, #e5e5e5);
  border-radius: 10px; padding: 20px 24px; min-width: 140px;
}
.stats-overview-num { font-size: 32px; font-weight: 700; color: var(--ink, #222); font-variant-numeric: tabular-nums; }
.stats-overview-label { font-size: 13px; color: var(--ink3, #888); margin-top: 4px; }
.stats-section { margin-top: 24px; }
.od-section-title { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 600; color: var(--ink); margin-bottom: 8px; }
.stats-bars { display: flex; align-items: flex-end; gap: 4px; height: 110px; padding: 8px 0; overflow-x: auto; }
.stats-bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; flex: 1; min-width: 18px; }
.stats-bar { width: 12px; border-radius: 3px 3px 0 0; background: var(--hq, var(--el-color-primary)); min-height: 4px; }
.stats-bar-label { font-size: 10px; color: var(--ink4, #aaa); margin-top: 4px; transform: rotate(-30deg); white-space: nowrap; }
.stats-list { display: flex; flex-direction: column; gap: 6px; }
.stats-list-row { display: flex; justify-content: space-between; padding: 8px 12px; background: var(--card, #fff); border-radius: 6px; font-size: 13px; }
.stats-list-name { color: var(--ink, #222); }
.stats-list-count { color: var(--hq, var(--el-color-primary)); font-weight: 600; font-variant-numeric: tabular-nums; }
.stats-disabled { margin-top: 24px; padding: 16px; border: 1px dashed var(--line, #ccc); border-radius: 8px; color: var(--ink3, #888); text-align: center; }
</style>
