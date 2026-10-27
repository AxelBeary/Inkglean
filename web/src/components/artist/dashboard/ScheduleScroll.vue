<template>
  <!-- 排期 · 案头横格（2026-10-25 重画，替换旧卷轴骨架）：
       细分栏线 + 日序大字 + 今日墨线；纸签条沿用五色语义（花青进行中 / 藤黄待确认 / 朱砂逾期 / 浅花青未开工）。
       数据源 /artist/dashboard/schedule（近 7 日窗）。
       E1：纸签悬停 title 含阶段名；点击弹订单摘要浮层（客户/节点/画风/尺寸/开工/截稿/状态，
       缺项不硬凑）；Esc/点外部关闭，焦点回退纸签。 -->
  <section class="sched-card" :aria-label="t('dashboard.scheduleTitle')">
    <div class="sched-head">
      <span class="sched-title f-kai">{{ t('dashboard.scheduleTitle') }}</span>
      <span v-if="state === 'ok'" class="sched-meta">{{ t('dashboard.scheduleWindowMeta', { n: bars.length }) }}</span>
      <button class="sched-more" type="button" @click="goQueue">{{ t('dashboard.scheduleExpand') }}</button>
    </div>

    <!-- 加载态 -->
    <div v-if="state === 'loading'" class="scroll-skeleton">
      <div class="scroll-skeleton-row"></div>
      <div class="scroll-skeleton-row"></div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="state === 'error'" class="scroll-error">
      <span>{{ t('common.networkError') }}</span>
      <button class="retry-btn" type="button" @click="load">{{ t('dashboard.retry') }}</button>
    </div>

    <template v-else>
      <div class="days">
        <div v-for="(d, i) in days" :key="d.key" class="day" :class="{ 'is-today': i === 1 }">
          <b>{{ d.day }}</b>
          <span>{{ d.week }}</span>
        </div>
      </div>

      <!-- 空态 -->
      <p v-if="!placed.length" class="scroll-empty">{{ t('dashboard.scheduleEmpty') }}</p>

      <div v-else class="track">
        <i class="now" aria-hidden="true"></i>
        <button
          v-for="p in placed"
          :key="p.bar.id"
          type="button"
          class="tl-bar"
          :class="barClass(p.bar)"
          :style="{ gridColumn: `${p.start + 1}/${p.end + 2}` }"
          :title="`${p.bar.orderNo}${p.bar.clientName ? ' · ' + p.bar.clientName : ''}${p.bar.stageName ? ' · ' + p.bar.stageName : ''}`"
          @click="openSummary(p.bar, $event)"
          @keydown.enter="openSummary(p.bar, $event)"
        >
          <span class="nm">{{ p.bar.clientName || p.bar.orderNo }}</span>
          <span v-if="p.bar.stageName" class="st">{{ p.bar.stageName }}</span>
        </button>
      </div>

      <!-- E1：纸签点击弹订单摘要浮层（纸墨体系）。
           消费 /artist/dashboard/schedule 返回字段：客户名/当前节点/画风/尺寸/开工/截稿/状态；
           画风/尺寸为清扫批补全的只增字段，旧单无值时缺项不展示。 -->
      <template v-if="popBar">
        <div class="tl-pop-backdrop" aria-hidden="true" @click="closeSummary"></div>
        <div
          ref="popRef"
          class="tl-pop"
          role="dialog"
          tabindex="-1"
          :aria-label="t('dashboard.scheduleSummaryTitle')"
        >
          <div class="tl-pop-head">
            <span class="tl-pop-title f-kai">{{ t('dashboard.scheduleSummaryTitle') }} · #{{ popBar.orderNo }}</span>
            <button class="tl-pop-close" type="button" :aria-label="t('common.close')" @click="closeSummary">×</button>
          </div>
          <dl class="tl-pop-body">
            <div class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryClient') }}</dt>
              <dd>{{ popBar.clientName || popBar.orderNo }}</dd>
            </div>
            <div v-if="popBar.stageName" class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStage') }}</dt>
              <dd>{{ popBar.stageName }}</dd>
            </div>
            <div v-if="popBar.styleName || popBar.sizeName" class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStyle') }}</dt>
              <dd>{{ [popBar.styleName, popBar.sizeName].filter(Boolean).join(' · ') }}</dd>
            </div>
            <div v-if="popBar.startDate" class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStart') }}</dt>
              <dd>{{ popBar.startDate }}</dd>
            </div>
            <div v-if="popBar.deadline" class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryDeadline') }}</dt>
              <dd>{{ formatDateTime(popBar.deadline) }}</dd>
            </div>
            <div class="tl-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStatus') }}</dt>
              <dd>{{ t(`common.orderStatus.${popBar.status}`) }}</dd>
            </div>
          </dl>
          <button class="tl-pop-detail" type="button" @click="goDetailFromPop">{{ t('dashboard.scheduleSummaryDetail') }} →</button>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { artistApi } from '../../../api/index'
import { formatDateTime } from '../../../utils/datetime'
import type { ScheduleBar } from '../../../api/types'
import { useScrollLock } from '../../../composables/useScrollLock'

const { t, locale } = useI18n()
const router = useRouter()

const state = ref<'loading' | 'ok' | 'error'>('loading')
const bars = ref<ScheduleBar[]>([])

const WINDOW_DAYS = 7 // [今日-1, 今日+6]

/** 本地日历日键（零点），时区口径与后端 date.ts 一致（JS 本地日，不用 SQLite localtime） */
function dayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function daysFromWindowStart(d: Date): number {
  const start = new Date()
  start.setDate(start.getDate() - 1)
  return Math.round((dayKey(d) - dayKey(start)) / 86400000)
}

/** 近 7 日日期头（第 2 列固定为今日）：日序大字 + 星期小字 */
function buildDays() {
  const out: { key: number; day: string; week: string }[] = []
  const base = new Date()
  base.setDate(base.getDate() - 1)
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const tag = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
    out.push({
      key: dayKey(d),
      day: String(d.getDate()),
      week: d.toLocaleDateString(tag, { weekday: 'short' })
    })
  }
  return out
}
const days = computed(buildDays)

interface Placed { bar: ScheduleBar; start: number; end: number }

/** 排期条落格：start/end 为 0-6 索引（grid 列 = 索引+1，end 为闭区间索引） */
function computePlaced(): Placed[] {
  const out: Placed[] = []
  for (const bar of bars.value) {
    let sIdx: number | null = null
    let eIdx: number | null = null
    if (bar.startDate) {
      const sd = new Date(`${bar.startDate}T00:00:00`)
      sIdx = daysFromWindowStart(sd)
    }
    if (bar.deadline) {
      const dl = new Date(bar.deadline)
      eIdx = daysFromWindowStart(dl)
    }
    if (sIdx == null && eIdx == null) continue
    // 单端缺失时以另一端为准（上一行已保证至少一端非空）
    const sFinal = sIdx ?? (eIdx as number)
    const eFinal = eIdx ?? sFinal
    const start = Math.min(Math.max(sFinal, 0), WINDOW_DAYS - 1)
    const end = Math.min(Math.max(eFinal, start), WINDOW_DAYS - 1)
    out.push({ bar, start, end })
  }
  return out
}
const placed = ref<Placed[]>([])

/** 逾期判定：deadline 早于本地今日零点 */
function isOverdue(bar: ScheduleBar): boolean {
  if (!bar.deadline) return false
  return dayKey(new Date(bar.deadline)) < dayKey(new Date())
}

function barClass(bar: ScheduleBar) {
  if (isOverdue(bar)) return 'tl-over'
  if (bar.status === 'pending') return 'tl-pend'
  if (bar.status === 'confirmed') return 'tl-wip2'
  return 'tl-wip'
}

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getDashboardSchedule()
    bars.value = res.bars || []
    placed.value = computePlaced()
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

function goQueue() {
  router.push('/queue')
}

// ─── E1：纸签点击订单摘要浮层 ───
// 只用接口已返回字段；浮层内“进订单详情”承接原点击跳转语义。
const popBar = ref<ScheduleBar | null>(null)
// #56-6：浮层只挡点击不挡滚动——打开时锁页面滚动，关闭/卸载释放
useScrollLock(computed(() => !!popBar.value))
const popRef = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

function openSummary(bar: ScheduleBar, ev: Event) {
  lastFocused = (ev.currentTarget as HTMLElement) ?? null
  popBar.value = bar
  nextTick(() => popRef.value?.focus())
}
function closeSummary() {
  if (!popBar.value) return
  popBar.value = null
  // 键盘可达：关闭后焦点回退到触发纸签
  nextTick(() => lastFocused?.focus())
}
function goDetailFromPop() {
  const bar = popBar.value
  popBar.value = null
  if (bar) router.push(`/orders/${bar.id}?from=dashboard`)
}
function onWindowKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeSummary()
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onWindowKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<style scoped>
/* ─── 案头横格：一张纸、细分栏线、日序大字 ─── */
.sched-card {
  background: var(--card);
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-1);
  padding: 16px 20px 18px;
  margin: 0 0 26px;
}
.sched-head {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding-bottom: 10px; margin-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.sched-title { font-size: calc(var(--font-scale, 1) * 16px); letter-spacing: .26em; color: var(--ink); }
.sched-meta { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); letter-spacing: .04em; }
.sched-more {
  margin-left: auto; font: inherit; font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--hq); background: none; border: none; cursor: pointer; padding: 0;
}
.sched-more:hover { text-decoration: underline; }

/* 三态 */
.scroll-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.scroll-skeleton-row { height: 28px; border-radius: 2px; background: var(--paper2); animation: sched-pulse 1.2s ease-in-out infinite; }
@keyframes sched-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.scroll-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 20px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
.retry-btn {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--hq); background: none; border: 1px solid color-mix(in srgb, var(--hq) 40%, transparent);
  padding: 2px 12px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.retry-btn:hover { background: var(--hq-t); }
.scroll-empty { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); padding: 10px 2px; margin: 0; }

/* 日期头：日序大字 + 星期小字；今日加墨线，不用朱砂（本组件朱砂已表示逾期） */
.days { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 8px; }
.day { text-align: center; color: var(--ink4); font-variant-numeric: tabular-nums; }
.day b {
  display: block; font-family: var(--f-d, inherit); font-size: calc(var(--font-scale, 1) * 15px);
  font-weight: 400; color: var(--ink2); letter-spacing: .02em;
}
.day span { font-size: calc(var(--font-scale, 1) * 11px); letter-spacing: .04em; }
.day.is-today b { color: var(--ink); font-weight: 700; }
.day.is-today::after { content: ''; display: block; width: 14px; height: 1px; background: var(--ink); margin: 3px auto 0; opacity: .55; }

/* 轨道：细分栏线 + 今日墨线 */
.track {
  position: relative; display: grid; grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 30px; gap: 6px 0;
  background-image: linear-gradient(90deg, transparent calc(100% - 1px), color-mix(in srgb, var(--line) 60%, transparent) calc(100% - 1px));
  background-size: calc(100% / 7) 100%;
}
.now {
  position: absolute; top: -2px; bottom: -2px; left: calc((100% / 7) * 1.5); width: 1px; z-index: 2;
  background: var(--ink); opacity: .35;
}

/* 纸签条：纸底 + 状态色左边 + 墨字（与旧卷轴同语义，去掉盒状描边） */
.tl-bar {
  display: flex; align-items: center; gap: 8px; min-width: 0;
  padding: 0 10px; font: inherit; font-size: calc(var(--font-scale, 1) * 12px);
  text-align: left; color: var(--ink2); cursor: pointer; z-index: 1;
  overflow: hidden; white-space: nowrap;
  background: var(--paper2); border: none; border-left: 3px solid var(--hq);
  border-radius: 2px;
  transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.tl-bar:focus-visible { outline: 2px solid var(--hq); outline-offset: 1px; }
.tl-bar:hover { background: var(--card); box-shadow: var(--sh-1); }
.tl-bar .nm { overflow: hidden; text-overflow: ellipsis; }
.tl-bar .st { font-size: calc(var(--font-scale, 1) * 10.5px); color: var(--ink4); flex: none; }
.tl-wip { border-left-color: var(--hq); }
.tl-wip2 { border-left-color: var(--line2); color: var(--ink4); }
.tl-over { background: var(--zs-t); border-left-color: var(--zs); color: var(--zs); }
.tl-over .st { color: color-mix(in srgb, var(--zs) 72%, var(--card)); }
.tl-pend { background: var(--th-t); border-left-color: var(--th); color: var(--th); }
.tl-pend .st { color: color-mix(in srgb, var(--th) 70%, var(--card)); }
.tl-wip2 .st { color: var(--ink4); }

/* E1：订单摘要浮层（纸面 var(--paper2)/墨字/细边 var(--line)/圆角/轻投影；入场一次性淡入不循环） */
.tl-pop-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: color-mix(in srgb, var(--ink) 16%, transparent);
}
.tl-pop {
  position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(320px, calc(100vw - 32px));
  background: var(--paper2); color: var(--ink);
  border: 1px solid var(--line); box-shadow: var(--sh-2);
  border-radius: 6px 13px 7px 12px / 11px 7px 13px 6px;
  padding: 12px 16px 14px; outline: none;
  animation: tl-pop-in var(--dur-mid, .18s) var(--ease-out, ease-out) both;
}
@keyframes tl-pop-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
  to { opacity: 1; transform: translate(-50%, -50%); }
}
.tl-pop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.tl-pop-title { font-size: calc(var(--font-scale, 1) * 14px); letter-spacing: .12em; color: var(--ink); }
.tl-pop-close {
  font: inherit; line-height: 1; flex: none; cursor: pointer;
  color: var(--ink3); background: none; border: 1px solid var(--line);
  width: 22px; height: 22px; border-radius: 4px 7px 5px 6px / 6px 5px 7px 4px;
}
.tl-pop-close:hover { color: var(--ink); background: var(--card); }
.tl-pop-body { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.tl-pop-row { display: flex; gap: 10px; font-size: calc(var(--font-scale, 1) * 13px); }
.tl-pop-row dt { flex: none; width: 62px; color: var(--ink4); }
.tl-pop-row dd { margin: 0; min-width: 0; color: var(--ink2); overflow-wrap: anywhere; }
.tl-pop-detail {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--hq); background: none; border: 1px solid color-mix(in srgb, var(--hq) 40%, transparent);
  margin-top: 11px; padding: 3px 12px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.tl-pop-detail:hover { background: var(--hq-t); }

/* 响应式：≤960 收紧内边距；≤600 只留日序数字（星期隐藏），纸签收窄 */
@media (max-width: 960px) {
  .sched-card { padding: 13px 16px 15px; }
  .day b { font-size: calc(var(--font-scale, 1) * 14px); }
}
@media (max-width: 600px) {
  .sched-meta { display: none; }
  .day span { display: none; }
  .day.is-today::after { margin-top: 2px; }
  .tl-bar { font-size: calc(var(--font-scale, 1) * 11px); padding: 0 7px; }
  .tl-bar .st { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .scroll-skeleton-row { animation: none; }
  .tl-pop { animation: none; }
}
</style>
