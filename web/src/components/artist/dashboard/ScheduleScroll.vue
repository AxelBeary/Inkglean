<template>
  <!-- 排期卷轴（视觉批 P1，提案 §5.6 已拍板器物）：两端纸卷+轴头 / 宣纸长卷 /
       纸签式五色条（花青进行中/浅花青未开工/朱砂逾期/藤黄待确认）+ 今日笔触线。
       数据源 /artist/dashboard/schedule（近 7 日窗口）。
       E1：纸签悬停 title 含阶段名；点击弹订单摘要浮层（只用接口已返回字段，
       画风/档位接口未返回故不展示）；Esc/点外部关闭，焦点回退纸签。 -->
  <section class="scroll-strip" :aria-label="t('dashboard.scheduleTitle')">
    <div class="scroll-roll" aria-hidden="true"><i class="axis axis-top"></i><i class="axis axis-bot"></i></div>
    <div class="scroll-paper">
      <div class="scroll-head">
        <span class="scroll-title f-kai">{{ t('dashboard.scheduleTitle') }}</span>
        <button class="scroll-more" type="button" @click="goQueue">{{ t('dashboard.scheduleExpand') }}</button>
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
        <div class="tl-days f-kai">
          <template v-for="(d, i) in days" :key="d.key">
            <span :class="{ 'tl-today': i === 1, 'tl-alt': i % 2 === 0 }">{{ d.label }}</span>
          </template>
        </div>

        <!-- 空态 -->
        <p v-if="!placed.length" class="scroll-empty">{{ t('dashboard.scheduleEmpty') }}</p>

        <div v-else class="tl-track">
          <div class="tl-nowline" aria-hidden="true"><i class="tl-drop"></i></div>
          <div
            v-for="p in placed"
            :key="p.bar.id"
            class="tl-bar"
            :class="barClass(p.bar)"
            :style="{ gridColumn: `${p.start + 1}/${p.end + 1}` }"
            :title="`${p.bar.orderNo}${p.bar.clientName ? ' · ' + p.bar.clientName : ''}${p.bar.stageName ? ' · ' + p.bar.stageName : ''}`"
            role="button"
            tabindex="0"
            @click="openSummary(p.bar, $event)"
            @keydown.enter="openSummary(p.bar, $event)"
          >
            <span>{{ p.bar.clientName || p.bar.orderNo }}</span>
          </div>
        </div>

        <!-- E1：纸签点击弹订单摘要浮层（纸墨体系）。
             只消费 /artist/dashboard/schedule 已返回字段：客户名/当前节点/开工/截稿/状态；
             画风/档位接口未返回 → 缺项不硬凑，浮层省略。 -->
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
    </div>
    <div class="scroll-roll" aria-hidden="true"><i class="axis axis-top"></i><i class="axis axis-bot"></i></div>
  </section>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { artistApi } from '../../../api/index.js'
import { formatDateTime } from '../../../utils/datetime.js'
import type { ScheduleBar } from '../../../api/types.js'

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

/** 近 7 日日期头（第 2 列固定为今日） */
function buildDays() {
  const out: { key: number; label: string }[] = []
  const base = new Date()
  base.setDate(base.getDate() - 1)
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const label = d.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' })
    out.push({ key: dayKey(d), label })
  }
  return out
}
const days = ref(buildDays())

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
/* ─── 排期卷轴（原型 v0.9 移植，纸墨 token） ─── */
.scroll-strip { display: flex; align-items: stretch; margin: 0 0 26px; }
.scroll-roll {
  position: relative; width: 26px; z-index: 2; margin: -11px 0; border-radius: 13px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--zhe) 34%, var(--paper2)) 0%,
    color-mix(in srgb, var(--paper2) 90%, var(--zhe)) 30%,
    color-mix(in srgb, var(--paper2) 97%, var(--zhe)) 47%,
    color-mix(in srgb, var(--paper2) 88%, var(--zhe)) 74%,
    color-mix(in srgb, var(--zhe) 38%, var(--paper2)) 100%);
  box-shadow: var(--sh-2);
}
.scroll-roll::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--zhe) 40%, transparent) 0, transparent 9%,
    transparent 91%, color-mix(in srgb, var(--zhe) 44%, transparent) 100%);
  opacity: .5;
}
.scroll-roll::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: repeating-linear-gradient(to bottom,
    transparent 0 26px, color-mix(in srgb, var(--zhe) 26%, transparent) 26px 27px);
  opacity: .3;
}
.axis {
  position: absolute; left: 50%; transform: translateX(-50%); width: 7px; height: 17px; border-radius: 3.5px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--zhe) 62%, var(--ink)), color-mix(in srgb, var(--zhe) 36%, var(--ink)));
}
.axis-top { top: -15px; } .axis-bot { bottom: -15px; }
.axis::after {
  content: ''; position: absolute; left: 50%; transform: translateX(-50%);
  width: 12px; height: 12px; border-radius: 50% 46% 52% 48%;
  background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--zhe) 55%, var(--ink)), color-mix(in srgb, var(--zhe) 26%, var(--ink)));
  box-shadow: var(--sh-1);
}
.axis-top::after { top: -8px; } .axis-bot::after { bottom: -8px; }
.scroll-paper {
  flex: 1; min-width: 0; position: relative; z-index: 1;
  padding: 15px 30px 16px;
  background: var(--card);
  border-radius: 3px 7px 4px 6px / 6px 4px 7px 3px;
  box-shadow: var(--sh-1),
    inset 18px 0 22px -18px color-mix(in srgb, var(--ink) 42%, transparent),
    inset -18px 0 22px -18px color-mix(in srgb, var(--ink) 42%, transparent);
}
.scroll-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.scroll-title { font-size: calc(var(--font-scale, 1) * 16px); letter-spacing: .3em; color: var(--ink); }
.scroll-more {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); color: var(--hq);
  background: none; border: none; cursor: pointer;
}
.scroll-more:hover { text-decoration: underline; }
/* 三态 */
.scroll-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.scroll-skeleton-row { height: 28px; border-radius: 6px; background: var(--paper2); animation: scroll-pulse 1.2s ease-in-out infinite; }
@keyframes scroll-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
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
.scroll-empty { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); padding: 10px 2px; }
/* 日期头与轨道 */
.tl-days {
  display: grid; grid-template-columns: repeat(7, 1fr);
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4);
  margin-bottom: 7px; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: .05em;
}
.tl-today { color: var(--ink); font-weight: 700; position: relative; }
.tl-today::after {
  content: ''; display: block; width: 5px; height: 5px; margin: 3px auto 0;
  border-radius: 50% 45% 55% 48%; background: var(--ink); opacity: .7;
}
.tl-track {
  display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: 28px; gap: 7px 0;
  position: relative;
  background-image: linear-gradient(90deg, transparent calc(100% - 1px), var(--line) calc(100% - 1px));
  background-size: calc(100% / 7) 100%;
}
.tl-nowline {
  position: absolute; top: -5px; bottom: -5px; left: calc((100% / 7) * 1.5); width: 2px; z-index: 2;
  border-radius: 2px;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--ink) 62%, transparent) 14%, color-mix(in srgb, var(--ink) 62%, transparent) 86%, transparent);
}
.tl-drop {
  position: absolute; top: -3px; left: -2px; width: 6px; height: 6px;
  border-radius: 50% 44% 56% 48%; background: var(--ink); opacity: .72;
}
/* 纸签条：纸底 + 状态色左边 + 墨字 */
.tl-bar {
  display: flex; align-items: center; padding: 0 11px;
  font-size: calc(var(--font-scale, 1) * 12px);
  border-radius: 4px 9px 5px 8px / 8px 5px 9px 4px; cursor: pointer;
  overflow: hidden; white-space: nowrap; z-index: 1;
  background: var(--paper2); border: 1px solid var(--line); border-left: 3px solid var(--hq);
  color: var(--ink2);
  transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.tl-bar:hover { background: var(--card); box-shadow: var(--sh-1); }
.tl-wip { border-left-color: var(--hq); }
.tl-wip2 { border-left-color: var(--line2); color: var(--ink4); }
.tl-over { background: var(--zs-t); border-color: color-mix(in srgb, var(--zs) 28%, transparent); border-left-color: var(--zs); color: var(--zs); }
.tl-pend { background: var(--th-t); border-color: color-mix(in srgb, var(--th) 28%, transparent); border-left-color: var(--th); color: var(--th); }
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
/* 响应式：≤600 隔日显示防挤（偶数序号日隐藏），纸卷收窄 */
@media (max-width: 960px) {
  .scroll-roll { width: 20px; margin: -7px 0; }
  .axis { height: 12px; } .axis-top { top: -10px; } .axis-bot { bottom: -10px; }
  .axis::after { width: 9px; height: 9px; }
  .scroll-paper { padding: 13px 20px 14px; }
}
@media (max-width: 600px) {
  .tl-days .tl-alt { visibility: hidden; }
  .tl-track { background-size: calc(100% / 7) 100%; }
  .tl-bar { font-size: calc(var(--font-scale, 1) * 11px); padding: 0 7px; }
}
@media (prefers-reduced-motion: reduce) {
  .scroll-skeleton-row { animation: none; }
  .tl-pop { animation: none; }
}
</style>
