<template>
  <!-- 排期块四款式切换（自定义首页批二·子代理 F）：
       bars=时间条（内嵌复用 ScheduleScroll 原画法）/ ledger=台账 / ptags=纸签（线上卷轴同款）/ waybill=运单。
       四款均多单兼容：超限折 +N 胶囊，点 +N 跳排期看板（/queue）不做就地展开；
       点条目弹订单摘要浮层（照搬 ScheduleScroll 的数据与浮层实现）。
       注意：Vue 保留 style/class 为 attribute、不可声明为同名 prop，
       故主 prop 用 variant，并兼容读取 attrs.style（主代理 :style="..." 接线也能吃到）。 -->
  <ScheduleScroll v-if="kind === 'bars'" />

  <section v-else class="sp-card" :aria-label="t('dashboard.scheduleTitle')">
    <div class="sp-head">
      <span class="sp-title f-kai">{{ t('dashboard.scheduleTitle') }}</span>
      <button class="sp-more" type="button" @click="goQueue">{{ t('dashboard.scheduleExpand') }}</button>
    </div>

    <!-- 加载态 -->
    <div v-if="state === 'loading' || state === 'idle'" class="sp-skeleton">
      <div class="sp-skeleton-row"></div>
      <div class="sp-skeleton-row"></div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="state === 'error'" class="sp-error">
      <span>{{ t('common.networkError') }}</span>
      <button class="sp-retry" type="button" @click="load">{{ t('dashboard.retry') }}</button>
    </div>

    <template v-else>
      <!-- 空态 -->
      <p v-if="!bars.length" class="sp-empty">{{ t('dashboard.scheduleEmpty') }}</p>

      <!-- 款式 B · 台账（一天一栏一事一行小纸条） -->
      <div v-else-if="kind === 'ledger'" class="led-cols">
        <div
          v-for="(ds, i) in daySchedules"
          :key="ds.day.key"
          class="led-col"
          :class="{ 'led-today': i === 1 }"
        >
          <div class="led-d f-kai">{{ dayLabels[i] }}</div>
          <button
            v-for="e in ds.visible"
            :key="e.bar.id"
            type="button"
            class="led-row"
            :class="`tone-${e.tone}`"
            :title="entryTitle(e)"
            @click="openSummary(e.bar, $event)"
          >
            {{ e.bar.clientName || e.bar.orderNo }}
            <span v-if="e.bar.stageName" class="led-st">{{ e.bar.stageName }}</span>
          </button>
          <button
            v-if="ds.hiddenCount > 0"
            type="button"
            class="sp-chip"
            :aria-label="t('dashboard.scheduleMoreAria', { n: ds.hiddenCount })"
            @click="goQueue"
          >
            +{{ ds.hiddenCount }}
          </button>
        </div>
      </div>

      <!-- 款式 C · 纸签（线上卷轴同款：米色纸签+状态左边线，不铺色块；全局限 8 签） -->
      <div v-else-if="kind === 'ptags'" class="pt-strip">
        <div class="pt-tags">
          <button
            v-for="e in tagList.tags"
            :key="e.bar.id"
            type="button"
            class="ptag"
            :class="`tone-${e.tone}`"
            :title="entryTitle(e)"
            @click="openSummary(e.bar, $event)"
          >
            {{ e.bar.clientName || e.bar.orderNo }}<template v-if="e.bar.stageName"> · {{ e.bar.stageName }}</template>
          </button>
          <button
            v-if="tagList.hiddenCount > 0"
            type="button"
            class="sp-chip"
            :aria-label="t('dashboard.scheduleMoreAria', { n: tagList.hiddenCount })"
            @click="goQueue"
          >
            +{{ tagList.hiddenCount }}
          </button>
        </div>
      </div>

      <!-- 款式 D · 运单（一天一叠小单据带圆戳，叠高折 +N） -->
      <div v-else class="way-days">
        <div
          v-for="(ds, i) in daySchedules"
          :key="ds.day.key"
          class="way-day"
          :class="{ 'way-today': i === 1 }"
        >
          <div class="way-d f-kai">{{ dayLabels[i] }}</div>
          <div v-if="ds.visible.length" class="way-stack">
            <button
              v-for="(e, j) in ds.visible"
              :key="e.bar.id"
              type="button"
              class="way-slip"
              :class="[`tone-${e.tone}`, stackPos(j)]"
              :title="entryTitle(e)"
              @click="openSummary(e.bar, $event)"
            >
              {{ e.bar.clientName || e.bar.orderNo }}
              <span v-if="e.bar.stageName" class="way-st">{{ e.bar.stageName }}</span>
              <i class="way-stamp" aria-hidden="true"></i>
            </button>
          </div>
          <button
            v-if="ds.hiddenCount > 0"
            type="button"
            class="sp-chip"
            :aria-label="t('dashboard.scheduleMoreAria', { n: ds.hiddenCount })"
            @click="goQueue"
          >
            +{{ ds.hiddenCount }}
          </button>
        </div>
      </div>

      <!-- 订单摘要浮层（照搬 ScheduleScroll E1 实现：Esc/点外部关闭，焦点回退） -->
      <template v-if="popBar">
        <div class="sp-pop-backdrop" aria-hidden="true" @click="closeSummary"></div>
        <div
          ref="popRef"
          class="sp-pop"
          role="dialog"
          tabindex="-1"
          :aria-label="t('dashboard.scheduleSummaryTitle')"
        >
          <div class="sp-pop-head">
            <span class="sp-pop-title f-kai">{{ t('dashboard.scheduleSummaryTitle') }} · #{{ popBar.orderNo }}</span>
            <button class="sp-pop-close" type="button" :aria-label="t('common.close')" @click="closeSummary">×</button>
          </div>
          <dl class="sp-pop-body">
            <div class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryClient') }}</dt>
              <dd>{{ popBar.clientName || popBar.orderNo }}</dd>
            </div>
            <div v-if="popBar.stageName" class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStage') }}</dt>
              <dd>{{ popBar.stageName }}</dd>
            </div>
            <div v-if="popBar.styleName || popBar.sizeName" class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStyle') }}</dt>
              <dd>{{ [popBar.styleName, popBar.sizeName].filter(Boolean).join(' · ') }}</dd>
            </div>
            <div v-if="popBar.startDate" class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStart') }}</dt>
              <dd>{{ popBar.startDate }}</dd>
            </div>
            <div v-if="popBar.deadline" class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryDeadline') }}</dt>
              <dd>{{ formatDateTime(popBar.deadline) }}</dd>
            </div>
            <div class="sp-pop-row">
              <dt>{{ t('dashboard.scheduleSummaryStatus') }}</dt>
              <dd>{{ t(`common.orderStatus.${popBar.status}`) }}</dd>
            </div>
          </dl>
          <button class="sp-pop-detail" type="button" @click="goDetailFromPop">{{ t('dashboard.scheduleSummaryDetail') }} →</button>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { artistApi } from '../../../api/index'
import { formatDateTime } from '../../../utils/datetime'
import type { ScheduleBar } from '../../../api/types'
import ScheduleScroll from './ScheduleScroll.vue'
import {
  buildScheduleWindow,
  aggregateScheduleDays,
  aggregateScheduleTags,
} from '../../../utils/schedule-day-aggregate'
import type { SchedulePanelKind, DayEntry } from '../../../utils/schedule-day-aggregate'

const KINDS: readonly SchedulePanelKind[] = ['bars', 'ledger', 'ptags', 'waybill']

function isKind(v: unknown): v is SchedulePanelKind {
  return typeof v === 'string' && (KINDS as readonly string[]).includes(v)
}

// Vue 保留 style/class 为 attribute（声明同名 prop 会告警且值到不了 props）：
// 主口径走 variant；兼容主代理按原拍板传 :style="schedStyle" 时从 attrs 取值。
const props = defineProps<{ variant?: SchedulePanelKind }>()
const attrs = useAttrs()
const kind = computed<SchedulePanelKind>(() => {
  if (isKind(props.variant)) return props.variant
  if (isKind(attrs.style)) return attrs.style
  return 'bars'
})

const { t, locale } = useI18n()
const router = useRouter()

const state = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
const bars = ref<ScheduleBar[]>([])
/** 聚合基准时刻（load 成功时刷新），保证纯函数可复算 */
const now = ref(new Date())

const windowDays = computed(() => buildScheduleWindow(now.value))
const daySchedules = computed(() => aggregateScheduleDays(bars.value, windowDays.value, now.value))
const tagList = computed(() => aggregateScheduleTags(bars.value, now.value))

/** 日期头文案（locale 响应式），第 2 天为今日、带「今」前缀 */
const dayLabels = computed(() =>
  windowDays.value.map((d) => {
    const label = d.date.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    })
    return d.index === 1 ? `${t('dashboard.scheduleToday')} · ${label}` : label
  })
)

function entryTitle(e: DayEntry): string {
  return [e.bar.orderNo, e.bar.clientName, e.bar.stageName].filter(Boolean).join(' · ')
}

/** 运单叠位：0=前张、1=中张、2=后张（z-index 递减，前张可点） */
function stackPos(idx: number): string {
  if (idx === 0) return 'way-front'
  return idx === 1 ? 'way-mid' : 'way-back'
}

async function load() {
  if (state.value === 'loading') return
  state.value = 'loading'
  try {
    const res = await artistApi.getDashboardSchedule()
    bars.value = res.bars || []
    now.value = new Date()
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

/** bars 款内嵌 ScheduleScroll 自带取数；其余三款由本组件取数（按需、只取一次） */
function ensureLoad() {
  if (kind.value !== 'bars' && state.value === 'idle') void load()
}

function goQueue() {
  router.push('/queue')
}

// ─── 订单摘要浮层（照搬 ScheduleScroll E1：只用接口已返回字段） ───
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
  ensureLoad()
  window.addEventListener('keydown', onWindowKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
watch(kind, ensureLoad)
</script>

<style scoped>
/* ─── 排期块新三款（原型 proto-dashboard-drag-820.html 移植，纸墨 token；间距 4px 倍数；hover 只动阴影不位移） ─── */
.sp-card {
  background: var(--card); box-shadow: var(--sh-1); padding: 16px; position: relative;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  margin: 0 0 24px;
}
.sp-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.sp-title { font-size: calc(var(--font-scale, 1) * 16px); letter-spacing: .3em; color: var(--ink); }
.sp-more {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); color: var(--hq);
  background: none; border: none; cursor: pointer;
}
.sp-more:hover { text-decoration: underline; }
/* 三态（同 ScheduleScroll 口径） */
.sp-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
.sp-skeleton-row { height: 28px; border-radius: 6px; background: var(--paper2); animation: sp-pulse 1.2s ease-in-out infinite; }
@keyframes sp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.sp-error {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 20px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
.sp-retry {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--hq); background: none; border: 1px solid color-mix(in srgb, var(--hq) 40%, transparent);
  padding: 4px 12px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.sp-retry:hover { background: var(--hq-t); }
.sp-empty { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); padding: 8px 0; margin: 0; }

/* 状态色语义（拍板口径）：进行中花青 / 未开工浅花青 / 逾期朱砂 / 临期藤黄 / 完成石绿 */
.tone-wip { --tone: var(--hq); }
.tone-unstarted { --tone: color-mix(in srgb, var(--hq) 45%, var(--paper2)); }
.tone-overdue { --tone: var(--zs); }
.tone-soon { --tone: var(--th); }
.tone-done { --tone: var(--sl); }

/* +N 折叠胶囊：点它跳排期看板（不做就地展开） */
.sp-chip {
  display: inline-block; font: inherit; font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3); background: var(--paper2); border: 1px dashed var(--line2);
  border-radius: 999px; padding: 0 8px; margin-top: 4px; cursor: pointer;
  line-height: 1.6;
}
.sp-chip:hover { color: var(--hq); border-color: var(--hq); }

/* ─── 款式 B · 台账（一天一栏一事一行小纸条） ─── */
.led-cols {
  display: grid; grid-template-columns: repeat(7, 1fr);
  border: 1px solid var(--line2); background: var(--paper2);
  border-radius: 4px 9px 5px 8px / 8px 5px 9px 4px; overflow: hidden;
}
.led-col { border-right: 1px dashed var(--line2); padding: 8px; min-height: 104px; }
.led-col:last-child { border-right: none; }
.led-d { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-bottom: 8px; text-align: center; font-variant-numeric: tabular-nums; }
.led-today .led-d { color: var(--zs); font-weight: 700; }
.led-row {
  display: block; width: 100%; text-align: left; font: inherit; cursor: pointer;
  font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2);
  background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--tone, var(--hq));
  border-radius: 4px; padding: 4px 8px; margin-bottom: 4px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  transition: box-shadow var(--dur-fast) var(--ease-out);
}
.led-row:hover { box-shadow: var(--sh-1); }
.led-st { display: block; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 10px); }
.led-row.tone-done { opacity: .72; }

/* ─── 款式 C · 纸签（线上卷轴同款：米色纸签+状态左边线，不铺色块） ─── */
.pt-strip {
  background: var(--paper2); border: 1px solid var(--line);
  border-radius: 4px 9px 5px 8px / 8px 5px 9px 4px; padding: 12px;
}
.pt-tags { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ptag {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink); cursor: pointer;
  background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--tone, var(--hq));
  padding: 4px 12px; border-radius: 3px 6px 4px 7px / 6px 4px 7px 3px; box-shadow: var(--sh-1);
  transition: box-shadow var(--dur-fast) var(--ease-out);
}
.ptag:hover { box-shadow: var(--sh-2); }
.ptag.tone-done { opacity: .75; }

/* ─── 款式 D · 运单（一天一叠小单据带圆戳） ─── */
.way-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.way-day { text-align: center; }
.way-d { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-bottom: 8px; font-variant-numeric: tabular-nums; }
.way-today .way-d { color: var(--zs); font-weight: 700; }
.way-stack { position: relative; height: 80px; }
.way-slip {
  position: absolute; left: 8%; right: 8%; font: inherit; cursor: pointer;
  background: var(--card); border: 1px solid var(--line); border-radius: 4px;
  box-shadow: var(--sh-1); padding: 8px; font-size: calc(var(--font-scale, 1) * 11px);
  text-align: left; color: var(--ink2);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  transition: box-shadow var(--dur-fast) var(--ease-out);
}
.way-slip:hover { box-shadow: var(--sh-2); }
.way-front { top: 12px; transform: rotate(1.6deg); z-index: 3; }
.way-mid { top: 8px; transform: rotate(-1.2deg); z-index: 2; opacity: .88; }
.way-back { top: 0; transform: rotate(-2.4deg); z-index: 1; opacity: .72; }
.way-stamp {
  position: absolute; right: 4px; top: 4px; width: 16px; height: 16px;
  border: 1.5px solid var(--tone, var(--hq)); border-radius: 50%; opacity: .8;
}
.way-st { display: block; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 10px); margin-top: 4px; }
.way-slip.tone-done { opacity: .72; }

/* ─── 订单摘要浮层（照搬 ScheduleScroll tl-pop 视觉） ─── */
.sp-pop-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: color-mix(in srgb, var(--ink) 16%, transparent);
}
.sp-pop {
  position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(320px, calc(100vw - 32px));
  background: var(--paper2); color: var(--ink);
  border: 1px solid var(--line); box-shadow: var(--sh-2);
  border-radius: 6px 13px 7px 12px / 11px 7px 13px 6px;
  padding: 12px 16px 16px; outline: none;
  animation: sp-pop-in var(--dur-mid, .18s) var(--ease-out, ease-out) both;
}
@keyframes sp-pop-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
  to { opacity: 1; transform: translate(-50%, -50%); }
}
.sp-pop-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.sp-pop-title { font-size: calc(var(--font-scale, 1) * 14px); letter-spacing: .12em; color: var(--ink); }
.sp-pop-close {
  font: inherit; line-height: 1; flex: none; cursor: pointer;
  color: var(--ink3); background: none; border: 1px solid var(--line);
  width: 24px; height: 24px; border-radius: 4px 7px 5px 6px / 6px 5px 7px 4px;
}
.sp-pop-close:hover { color: var(--ink); background: var(--card); }
.sp-pop-body { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.sp-pop-row { display: flex; gap: 12px; font-size: calc(var(--font-scale, 1) * 13px); }
.sp-pop-row dt { flex: none; width: 64px; color: var(--ink4); }
.sp-pop-row dd { margin: 0; min-width: 0; color: var(--ink2); overflow-wrap: anywhere; }
.sp-pop-detail {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--hq); background: none; border: 1px solid color-mix(in srgb, var(--hq) 40%, transparent);
  margin-top: 12px; padding: 4px 12px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.sp-pop-detail:hover { background: var(--hq-t); }

/* 响应式：窄屏台账/运单改两天一屏滚动，纸签自动换行天然兼容 */
@media (max-width: 600px) {
  .led-cols, .way-days { grid-template-columns: repeat(7, minmax(84px, 1fr)); overflow-x: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .sp-skeleton-row { animation: none; }
  .sp-pop { animation: none; }
}
</style>
