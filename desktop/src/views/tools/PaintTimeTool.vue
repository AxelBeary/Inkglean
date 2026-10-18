<script setup lang="ts">
// 绘画时间·桌面工具页（RingoTrack 款整年在画热力图）：
// 把本地 local_time_log 的按日在画时长铺成 GitHub 小绿砖式方格墙（墨色深浅），
// 配一行汇总（近一年在画 / 活跃天数 / 最长连击 / 单日最高）+ 复用近 7 日周条与月对比。
// 纯本地、不联网（合双模式分离纪律）；数据源＝autoTime store。
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAutoTimeStore } from '../../stores/autoTime'
import { formatSeconds } from '../../stores/timer'
import { buildHeatmap } from '../../tools/heatmap'
import { isDesktop } from '../../bridge'
import PaintHeatmap from '../../components/home/PaintHeatmap.vue'
import WeekBars from '../../components/home/WeekBars.vue'

const router = useRouter()
const autoTime = useAutoTimeStore()

onMounted(async () => {
  // 幂等只读：热力图页单独拉全量按日数据，周/月/今日复用经营板块同源（store 内已加载则近乎零成本）
  await Promise.all([autoTime.loadHeat(), autoTime.loadWeek(), autoTime.loadMonths(), autoTime.loadToday()])
})

function goHome() { void router.push({ name: 'home' }) }

/** 按日在画秒数映射（热力图数据源） */
const paintByDate = computed(() => new Map(autoTime.heatDays.map(d => [d.date, d.paint])))

/** 整年热力图（列 + 汇总）：以本地今天为末列基准 */
const heat = computed(() => buildHeatmap(paintByDate.value, new Date()))

const hasAnyPaint = computed(() => heat.value.summary.totalSecs > 0)
const hasWeek = computed(() => autoTime.week.some(d => d.paint + d.other + d.idle > 0))
const hasMonths = computed(() => autoTime.months.length === 2 && autoTime.months.some(m => m.paint > 0))

/** 单日最高：MM月DD日 · 时长 */
const maxDayText = computed(() => {
  const md = heat.value.summary.maxDay
  if (!md) return '—'
  const [, m, d] = md.date.split('-')
  return `${Number(m)}月${Number(d)}日 · ${formatSeconds(md.secs)}`
})

const monthText = computed(() => {
  if (!hasMonths.value) return ''
  const [prev, cur] = autoTime.months
  const parts = [`本月在画 ${formatSeconds(cur.paint)}`]
  if (prev.paint > 0) parts.push(`上月 ${formatSeconds(prev.paint)} ${cur.paint >= prev.paint ? '↑' : '↓'}`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="tool-page">
    <header class="tool-bar">
      <button type="button" class="back" @click="goHome">← 回首页</button>
      <span class="badge">工具箱</span>
    </header>

    <div class="pt-card">
      <h2 class="pt-title">绘画时间</h2>
      <p class="pt-sub">一整面墙记录你的画画节奏——颜色越深，那天画得越久。数据只存本机，永不上传。</p>

      <p v-if="!isDesktop()" class="pt-empty">绘画时间统计仅在桌面壳内可用</p>

      <template v-else-if="!hasAnyPaint">
        <p class="pt-empty">还没有画画记录，开着拾绘画一会儿，这面墙就会慢慢上色</p>
      </template>

      <template v-else>
        <!-- 汇总一行 -->
        <div class="stats">
          <div class="stat">
            <span class="sv num">{{ formatSeconds(heat.summary.totalSecs) }}</span>
            <span class="sk">近一年在画</span>
          </div>
          <div class="stat">
            <span class="sv num">{{ heat.summary.activeDays }}</span>
            <span class="sk">活跃天数</span>
          </div>
          <div class="stat">
            <span class="sv num">{{ heat.summary.longestStreak }}</span>
            <span class="sk">最长连击（天）</span>
          </div>
          <div class="stat">
            <span class="sv num">{{ heat.summary.currentStreak }}</span>
            <span class="sk">当前连击（天）</span>
          </div>
          <div class="stat stat--wide">
            <span class="sv sv--sm num">{{ maxDayText }}</span>
            <span class="sk">单日最高</span>
          </div>
        </div>

        <!-- 整年热力图 -->
        <PaintHeatmap :columns="heat.columns" />

        <!-- 近 7 日周条 + 月对比（复用经营板块同款输出件） -->
        <div v-if="hasWeek" class="pt-div">
          <span class="pt-k">近 7 日 · 在画与摸鱼</span>
          <WeekBars :week="autoTime.week" />
          <span v-if="hasMonths" class="pt-month">{{ monthText }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tool-page { min-height: var(--app-h); background: var(--paper); padding: 18px clamp(16px, 6vw, 72px) 48px; }
.tool-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.back {
  font-size: 12.5px; color: var(--ink3); padding: 5px 12px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), border-color var(--dur-fast);
}
.back:hover { color: var(--ink); border-color: var(--ink4); }
.badge {
  font-size: 11px; color: var(--hq-d); padding: 3px 9px;
  background: var(--hq-t); border: 1px solid var(--hq-t2); border-radius: var(--r-s-hand);
}

.pt-card {
  max-width: 860px; background: var(--card); border: 1px solid rgba(var(--ink-rgb), .06);
  border-radius: var(--r-paper); padding: 20px 24px 24px;
}
.pt-title { font-family: var(--f-d); font-size: 19px; font-weight: 700; letter-spacing: .06em; color: var(--ink); }
.pt-sub { font-size: 12px; color: var(--ink4); margin: 4px 0 18px; max-width: 620px; line-height: 1.6; }
.pt-empty { font-size: 13px; color: var(--ink3); font-family: var(--f-d); padding: 12px 0; }

.stats { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-bottom: 20px; }
.stat { display: flex; flex-direction: column; gap: 3px; }
.sv { font-size: 22px; font-weight: 700; color: var(--ink); line-height: 1.2; }
.sv--sm { font-size: 14px; font-weight: 600; padding-top: 6px; }
.sk { font-size: 11px; color: var(--ink4); }

.pt-div { margin-top: 22px; padding-top: 16px; border-top: 1px solid rgba(var(--ink-rgb), .08); }
.pt-k { font-size: 11px; letter-spacing: .1em; color: var(--ink4); display: block; margin-bottom: 8px; }
.pt-month { display: block; margin-top: 8px; font-size: 11.5px; color: var(--ink3); }
</style>
