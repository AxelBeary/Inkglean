<template>
  <!-- 问候贴纸（视觉批 P1，提案 §3）：固定容器零跳动；每天首次=入场仪式+逐字洇墨，
       当日再现=正常态直出；点文字换一句（R7 防连击）。容器静、文字动。 -->
  <div class="greeting-note" :class="{ entrance: performing }">
    <div
      class="g-text-area"
      role="button"
      tabindex="0"
      :title="t('dashboard.anotherOne')"
      @click="swapGreeting"
      @keydown.enter="swapGreeting"
      @keydown.space.prevent="swapGreeting"
    >
      <div :key="greetKey" class="g-text f-kai" :class="{ settled, 'swap-in': greetKey > 0 && settled }">
        <span
          v-for="(ch, i) in chars"
          :key="i"
          class="ch"
          :class="{ on: playing }"
          :style="{ animationDelay: `${i * 55}ms` }"
        >{{ ch }}</span>
      </div>
      <div class="g-date" :class="{ on: metaOn }">{{ dateLine }}</div>
      <div class="g-stats" :class="{ on: metaOn && hasStats }">
        <span>{{ t('dashboard.todayNewOrders') }} <strong>¥{{ formatCents(newOrderDisplay) }}</strong></span>
        <span class="sep">·</span>
        <span>{{ t('dashboard.todayRevenue') }} <strong>¥{{ formatCents(revenueDisplay) }}</strong></span>
      </div>
    </div>
    <div class="g-sign f-kai" :class="{ on: metaOn }">{{ t('dashboard.greetSign') }}</div>

    <!-- P2 公告行（REQ-043 I4 入口）：问候便签下一行淡墨，点开看全文，看过即消（零打扰） -->
    <div v-if="annVisible" class="g-ann">
      <button class="g-ann-line" type="button" :aria-expanded="annExpanded" @click="toggleAnn">
        <span class="g-ann-prefix">{{ t('dashboard.annPrefix') }}</span>
        <span class="g-ann-title">{{ announcement?.title }}</span>
        <span class="g-ann-caret" aria-hidden="true">{{ annExpanded ? '▾' : '▸' }}</span>
      </button>
      <p v-if="annExpanded" class="g-ann-content">{{ announcement?.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index.js'
import { formatCents } from '../../../utils/money.js'
import { useCountUp } from '../../../utils/useCountUp.js'
import { safeGetItem, safeSetItem } from '../../../utils/storage.js'
import type { ArtistStats, PlatformAnnouncement } from '../../../api/types.js'

const props = defineProps<{
  /** getStats 返回（含 todayNewOrderCents / todayRevenueCents），可空 */
  stats?: ArtistStats | null
}>()

const { t, locale } = useI18n()

// ─── 问候数据（同 GreetingHero：拉 /artist/greeting） ───
const greeting = ref<{ text: string; slot: string }>({ text: '', slot: 'any' })
const greetKey = ref(0)            // 换句时自增，触发整体淡入重渲染
const playing = ref(false)         // 演绎态：逐字洇墨进行中
const settled = ref(false)         // 正常态：静态直出
const metaOn = ref(false)          // 日期行/统计行/落款可见
const performing = ref(false)      // 入场仪式进行中（贴纸飘落）
let swapping = false               // R7 防连击
let timers: ReturnType<typeof setTimeout>[] = []

const PLAYED_KEY = 'inkglean-greet-played'
const ANN_READ_KEY = 'inkglean-ann-read'
const chars = computed(() => [...greeting.value.text])
const hasStats = computed(() => props.stats != null)

// 今日统计金额滚动（分→元在外层；display 是 Ref，模板经 proxyRefs 运行时解包，
// TS 类型不解，故经 computed 桥接一层保类型安全）
const todayNewOrder = useCountUp(computed(() => Number(props.stats?.todayNewOrderCents ?? 0)))
const todayRevenue = useCountUp(computed(() => Number(props.stats?.todayRevenueCents ?? 0)))
const newOrderDisplay = computed(() => todayNewOrder.display.value)
const revenueDisplay = computed(() => todayRevenue.display.value)

const dateLine = computed(() => {
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'long', day: 'numeric', weekday: 'long'
  })
  const slotNames: Record<string, string> = {
    morning: t('dashboard.slotMorning'),
    afternoon: t('dashboard.slotAfternoon'),
    evening: t('dashboard.slotEvening'),
    night: t('dashboard.slotNight'),
    any: ''
  }
  const slotName = slotNames[greeting.value.slot] || ''
  return slotName ? `${dateStr} · ${slotName}` : dateStr
})

function clearTimers() { timers.forEach(clearTimeout); timers = [] }

async function fetchGreeting(): Promise<void> {
  try {
    greeting.value = await artistApi.getGreeting()
  } catch { /* 静默失败：保留空文案，不破坏页面 */ }
}

/** 演绎态：入场仪式 → 逐字洇墨 → 日期/统计/落款 → 记当日已演 */
function playSequence() {
  clearTimers()
  performing.value = true
  settled.value = false
  playing.value = false
  metaOn.value = false
  timers.push(setTimeout(() => {
    playing.value = true
    const total = chars.value.length * 55 + 750
    timers.push(setTimeout(() => {
      settled.value = true
      playing.value = false
      metaOn.value = true
      performing.value = false
      safeSetItem(PLAYED_KEY, new Date().toDateString())
    }, total))
  }, 950))
}

/** 正常态：静态直出 */
function settleNow() {
  clearTimers()
  performing.value = false
  playing.value = false
  settled.value = true
  metaOn.value = true
}

/** 点文字换一句（仅正常态可触发；淡入呈现，不重演逐字） */
async function swapGreeting() {
  if (swapping || !settled.value || performing.value) return
  swapping = true
  try {
    await fetchGreeting()
    if (greeting.value.text) greetKey.value += 1
  } finally {
    swapping = false
  }
}

// ─── P2 公告行：看过即消（按 updatedAt 记已读） ───
const announcement = ref<PlatformAnnouncement | null>(null)
const annExpanded = ref(false)
const annVisible = computed(() =>
  announcement.value != null
  && !!announcement.value.title
  && safeGetItem(ANN_READ_KEY) !== announcement.value.updatedAt
)

async function loadAnnouncement(): Promise<void> {
  try {
    announcement.value = await artistApi.getAnnouncement()
  } catch { /* 公告非关键路径，静默降级 */ }
}

function toggleAnn() {
  annExpanded.value = !annExpanded.value
  // 点开即视为看过；合上后该行消失（零打扰）
  if (annExpanded.value && announcement.value) {
    safeSetItem(ANN_READ_KEY, announcement.value.updatedAt ?? '')
  }
}

onMounted(async () => {
  loadAnnouncement()
  await fetchGreeting()
  if (!greeting.value.text) return
  const today = new Date().toDateString()
  if (safeGetItem(PLAYED_KEY) === today) settleNow()   // 当日已演过 → 正常态
  else playSequence()                                  // 每天第一次 → 演绎态
})

// a1 猎杀修复：离页清理演绎序列定时器，防卸载后仍写 ref/localStorage
onUnmounted(() => clearTimers())
</script>

<style scoped>
/* ─── 问候贴纸：固定容器，入场仪式，逐字洇墨（原型 v0.9 移植） ─── */
.greeting-note {
  width: 100%; height: calc(var(--font-scale, 1) * 214px); position: relative;
  padding: calc(var(--font-scale, 1) * 26px) calc(var(--font-scale, 1) * 34px) calc(var(--font-scale, 1) * 16px);
  background: var(--paper2);
  border-radius: 3px 10px 4px 12px / 10px 4px 12px 3px;   /* 手剪不规则角 */
  box-shadow: var(--sh-1);
  transform: rotate(-.7deg);
}
.greeting-note.entrance { animation: note-in 1.1s var(--ease-out) both; }
@keyframes note-in {
  0%   { opacity: 0; transform: translateY(-26px) rotate(-3.2deg) scale(.97); }
  72%  { opacity: 1; transform: translateY(1.5px) rotate(-.5deg) scale(1.002); }
  100% { opacity: 1; transform: translateY(0) rotate(-.7deg) scale(1); }
}
/* 淡墨胶带 */
.greeting-note::before {
  content: ''; position: absolute; top: -9px; left: 36px; width: 58px; height: 16px;
  background: color-mix(in srgb, var(--ink) 8%, transparent);
  transform: rotate(-2deg); border-radius: 2px;
}
.greeting-note.entrance::before { animation: tape-on .5s ease .55s both; }
@keyframes tape-on {
  from { opacity: 0; transform: rotate(-6deg) translateY(-4px); }
  to   { opacity: 1; transform: rotate(-2deg) translateY(0); }
}
.g-text-area { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
.g-text {
  font-size: calc(var(--font-scale, 1) * 19px); line-height: 1.9; color: var(--ink);
  height: calc(var(--font-scale, 1) * 76px); overflow: hidden;
}
.g-text .ch { display: inline-block; opacity: 0; }
.g-text.settled .ch { opacity: 1; transform: none; filter: none; animation: none; }
.g-text.playing .ch.on { animation: ink-in .7s ease-out forwards; }
@keyframes ink-in {
  0%   { opacity: 0; transform: translateY(4px); filter: blur(4px); }
  60%  { opacity: .75; filter: blur(1px); }
  100% { opacity: 1; transform: none; filter: blur(0); }
}
/* 换句淡入（greetKey 变化触发重渲染） */
.g-text.swap-in { animation: greet-fade-in var(--dur-mid) var(--ease-out) both; }
@keyframes greet-fade-in {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: none; }
}
/* 日期+时段行（对齐 GreetingHero dateLine） */
.g-date {
  margin-top: 2px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3);
  opacity: 0; transition: opacity .6s ease;
}
.g-date.on { opacity: 1; }
/* 今日统计行（金额墨色不上色铁律） */
.g-stats {
  margin-top: 6px; font-size: calc(var(--font-scale, 1) * 13.5px); color: var(--ink2);
  display: flex; gap: 10px; align-items: center; opacity: 0;
}
.g-stats.on { animation: stats-up .4s var(--ease-out) .15s both; }
@keyframes stats-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
.g-stats strong { font-variant-numeric: tabular-nums; color: var(--ink); font-family: var(--f-d); font-weight: 600; }
.g-stats .sep { color: var(--ink4); }
/* 落款 */
.g-sign {
  position: absolute; right: calc(var(--font-scale, 1) * 30px); bottom: calc(var(--font-scale, 1) * 14px);
  font-size: calc(var(--font-scale, 1) * 13.5px); color: var(--ink3);
  opacity: 0; transition: opacity .8s ease;
}
.g-sign.on { opacity: 1; }
/* P2 公告行：底部淡墨一行，避落款位；展开内容向上生长 */
.g-ann {
  position: absolute; left: calc(var(--font-scale, 1) * 34px); right: calc(var(--font-scale, 1) * 120px);
  bottom: calc(var(--font-scale, 1) * 12px);
}
.g-ann-line {
  font: inherit; display: flex; align-items: center; gap: 8px; width: 100%;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3);
  background: none; border: none; padding: 2px 0; cursor: pointer; text-align: left;
}
.g-ann-line:hover { color: var(--ink2); }
.g-ann-prefix { flex: none; color: var(--ink4); letter-spacing: .1em; }
.g-ann-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-ann-caret { flex: none; color: var(--ink4); }
.g-ann-content {
  margin: 4px 0 0; padding: 6px 8px; max-height: 58px; overflow: auto;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); line-height: 1.7;
  background: color-mix(in srgb, var(--paper2) 70%, transparent); border-radius: 4px;
}
/* 窄屏：高度自适应一档，其余保持 */
@media (max-width: 600px) {
  .greeting-note { height: auto; min-height: calc(var(--font-scale, 1) * 190px); transform: rotate(0); }
  .greeting-note.entrance { animation-name: note-in-flat; }
}
@keyframes note-in-flat {
  0%   { opacity: 0; transform: translateY(-20px) scale(.97); }
  72%  { opacity: 1; transform: translateY(1.5px) scale(1.002); }
  100% { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .greeting-note.entrance, .greeting-note.entrance::before,
  .g-text.playing .ch.on, .g-text.swap-in, .g-stats.on { animation: none; }
  .g-text .ch { opacity: 1; }
}
</style>
