<script setup lang="ts">
// ops 板块「经营」（方向 A 长卷·题跋 aside 区）：收入概览（fetchIncomeOverview）
// + 收入统计摘要（fetchRevenue）+ 墨环（enso，数据源＝本地手动计时器 stores/timer.ts）。
// F8 二期（波8）：自动识别在画/离开/其他占比条（autoTime store，仅存本机永不上传）。
// 本地模式：收入位空态，墨环照常（本地数据）。等高纪律：定行数，内容截断。
import { computed } from 'vue'
import type { IncomeOverview, RevenueResult } from '../api/types'
import { useTimerStore, formatSeconds } from '../stores/timer'
import { useAutoTimeStore } from '../stores/autoTime'
import EnsoRing from '../components/home/EnsoRing.vue'
import TornPlaceholder from '../components/home/TornPlaceholder.vue'
import WeekBars from '../components/home/WeekBars.vue'

const props = defineProps<{
  mode: 'cloud' | 'local'
  income: IncomeOverview | null
  revenue: RevenueResult | null
  failed: boolean
  /** 计时器已撕成悬浮小窗 */
  torn: boolean
}>()

const timer = useTimerStore()
const autoTime = useAutoTimeStore()

function fmtYuan(cents: number): string {
  return `¥${Math.round(cents / 100).toLocaleString('zh-CN')}`
}

const receivedText = computed(() => props.income ? fmtYuan(props.income.monthReceivedCents) : null)
const tailText = computed(() => {
  const parts: string[] = []
  if (props.revenue) parts.push(`已完稿 ${props.revenue.summary.completedCount} 单`)
  if (props.income && props.income.pendingCents > 0) parts.push(`应收尾款 ${fmtYuan(props.income.pendingCents)}`)
  return parts.join(' · ')
})

/** 近 7 日周条（波14）：有时长数据才渲染 */
const hasWeek = computed(() => autoTime.week.some(d => d.paint + d.other + d.idle > 0))

/** 月对比（波16 · F8「日/月对比图」之月）：近两月有在画数据才渲染 */
const hasMonths = computed(() => autoTime.months.length === 2 && autoTime.months.some(m => m.paint > 0))
const monthText = computed(() => {
  if (!hasMonths.value) return ''
  const [prev, cur] = autoTime.months
  const parts = [`本月在画 ${formatSeconds(cur.paint)}`]
  if (prev.paint > 0) {
    const arrow = cur.paint >= prev.paint ? '↑' : '↓'
    parts.push(`上月 ${formatSeconds(prev.paint)} ${arrow}`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <div class="sec-head">
    <h2>经营</h2>
    <span class="meta">本月</span>
  </div>

  <!-- 收入一行纪律：只一行「本月已收」，无曲线无涨跌箭头 -->
  <div v-if="mode === 'cloud' && (income || revenue)" class="income">
    <span class="k">本月已收</span>
    <span class="v num">{{ receivedText ?? '—' }}</span>
    <span v-if="tailText" class="tail">{{ tailText }}</span>
  </div>
  <p v-else-if="mode === 'cloud' && failed" class="ops-empty">暂时取不到收入</p>
  <p v-else-if="mode === 'local'" class="ops-empty">收入概览 · 登录同步后显示</p>

  <!-- 墨环：今日在画（本地计时）；已撕出则留淡墨占位 -->
  <div class="ring-row">
    <TornPlaceholder v-if="torn" kind="timer" label="计时器" />
    <template v-else>
      <EnsoRing :seconds="timer.todaySeconds" />
      <div class="ring-side">
        <span class="k2">手动计时 · 今日累计</span>
        <!-- F8 二期（波8）：自动识别占比条（在画/离开/其他，仅存本机） -->
        <template v-if="autoTime.hasData">
          <div class="auto-bar" aria-hidden="true">
            <i class="seg seg--paint" :style="{ flexGrow: Math.max(autoTime.today.paint, 1) }"></i>
            <i class="seg seg--idle" :style="{ flexGrow: Math.max(autoTime.today.idle, 1) }"></i>
            <i class="seg seg--other" :style="{ flexGrow: Math.max(autoTime.today.other, 1) }"></i>
          </div>
          <span class="k2 k2--dim">
            自动 · 在画 {{ formatSeconds(autoTime.today.paint) }} / 离开 {{ formatSeconds(autoTime.today.idle) }} / 其他 {{ formatSeconds(autoTime.today.other) }}
          </span>
        </template>
        <span v-else-if="!autoTime.unavailable" class="k2 k2--dim">自动识别运行中 · 数据仅存本机</span>
        <span v-else class="k2 k2--dim">自动识别 · 仅桌面壳内可用</span>
      </div>
    </template>
  </div>

  <div class="live">
    <i :class="{ on: timer.running }" aria-hidden="true"></i>
    <span>{{ timer.running ? '正在计时 · 数据仅存本机' : '计时未开始' }}</span>
  </div>

  <!-- 近 7 日周条（波14 · F8 摸鱼可视化输出件）：在画/其他/离开三色堆叠，悬停看时长 -->
  <div v-if="hasWeek" class="week-sec">
    <span class="week-k">近 7 日 · 在画与摸鱼</span>
    <WeekBars :week="autoTime.week" />
    <!-- 月对比（波16）：本月/上月在画，↑↓ 随行 -->
    <span v-if="hasMonths" class="month-line">{{ monthText }}</span>
  </div>
</template>

<style scoped>
.sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.sec-head h2 { font-family: var(--f-d); font-size: 17px; font-weight: 700; letter-spacing: .08em; color: var(--ink); line-height: 1.25; }
.sec-head .meta { font-size: 12px; color: var(--ink4); }

.income { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.income .v { font-size: 24px; font-weight: 700; color: var(--ink); }
.income .k { font-size: 13px; color: var(--ink3); }
.income .tail { font-size: 12px; color: var(--ink4); }
.ops-empty { margin: 8px 0; font-size: 12.5px; color: var(--ink4); font-family: var(--f-d); }

.ring-row { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
.ring-row .torn-slot { flex: 1; }
.ring-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ring-side .k2 { font-size: 12px; color: var(--ink4); }
.ring-side .k2--dim { opacity: 0.75; }
/* F8 二期占比条：三色分段（在画花青/离开灰/其他藤），flex 比例渲染 */
.auto-bar {
  display: flex; height: 6px; border-radius: 3px; overflow: hidden;
  background: rgba(var(--ink-rgb), .08);
}
.auto-bar .seg { display: block; height: 100%; }
.auto-bar .seg--paint { background: var(--hq); }
.auto-bar .seg--idle { background: var(--buf); }
.auto-bar .seg--other { background: var(--th); }

.live { margin-top: auto; padding-top: 10px; font-size: 12px; color: var(--ink3); display: flex; align-items: center; gap: 6px; }
.live i { width: 6px; height: 6px; border-radius: 50%; background: var(--buf); }
.live i.on { background: var(--hq); animation: pulse 2.2s ease-in-out infinite; }
/* 近 7 日周条（波14）：定高不撑面板 */
.week-sec { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(var(--ink-rgb), .08); }
.week-k { font-size: 11px; letter-spacing: .1em; color: var(--ink4); display: block; margin-bottom: 6px; }
/* 月对比（波16）：周条下一行小字，随行不撑面板 */
.month-line { display: block; margin-top: 6px; font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .live i.on { animation: none; }
}
</style>
