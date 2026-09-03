<script setup lang="ts">
// 独立排期页三视图（9/4 主页重设计落码波1 · 路A）：列表 / 月历 / 时间条，波1 只读。
// 视觉真值＝proto-desktop-home-redesign.html #view-schedule（像素级照搬）。
// 取数一律走 useScheduleStore（不自己写 fetch、不直接调 api/artist.ts）。
// 窗高吃 var(--app-h) 不写 100vh（827 报障根治）。
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useScheduleStore } from '../stores/schedule'
import { buildCalCells, monthCursor, shiftMonth } from '../schedule/cal'
import TitleBar from '../components/shell/TitleBar.vue'
import SegTabs from '../components/schedule/SegTabs.vue'
import CalGrid from '../components/schedule/CalGrid.vue'
import ScheduleList from '../components/schedule/ScheduleList.vue'
import ScheduleTimeline from '../components/schedule/ScheduleTimeline.vue'
import type { TabItem } from '../components/schedule/tabs'

const router = useRouter()
const sched = useScheduleStore()

// ─── 页签 ───
const activeTab = ref('cal') // 默认月历

/** 页签条目：本地模式（timelineAvailable=false）时时间条整项不渲染 */
const tabItems = computed<TabItem[]>(() => {
  const items: TabItem[] = [
    { value: 'list', label: '列表' },
    { value: 'cal', label: '月历' }
  ]
  if (sched.timelineAvailable) {
    items.push({ value: 'tl', label: '时间条' })
  }
  return items
})

// 时间条页签消失时回落月历（纪律4：不留死页签）
watch(tabItems, items => {
  if (!items.some(t => t.value === activeTab.value)) {
    activeTab.value = 'cal'
  }
})

// ─── 月历游标（本页自持，与首页各自独立翻月） ───
const cursor = ref(monthCursor(new Date()))
const calCells = computed(() =>
  buildCalCells({ cursor: cursor.value, orders: sched.orders, canAccept: sched.canAccept })
)
const calTitle = computed(() =>
  `${cursor.value.getFullYear()}年${cursor.value.getMonth() + 1}月`
)
function prevMonth(): void { cursor.value = shiftMonth(cursor.value, -1) }
function nextMonth(): void { cursor.value = shiftMonth(cursor.value, 1) }

// ─── 取数 ───
onMounted(() => { void sched.load() })
function reload(): void { void sched.load(true) }

// ─── 导航 ───
function goHome(): void { void router.push({ name: 'home' }) }

// ─── 失败态/空态文案（三件事分开说：云端拉不到 / 本机账本读不到 / 真没数据）───
// 口径纪律：「账本打不开」绝不能讲成「你还没记一笔」（画师会重复记账）
const failText = computed(() =>
  sched.localUnavailable
    ? '本机账本读不到（数据库没打开），排期显示不出来——不是你没记账。'
    : '排期数据拉取失败，显示的可能不是最新。'
)
const emptyText = computed(() => {
  if (sched.mode === 'cloud') return '排期空空，去网页端接一单再来。'
  return '排期空空，去首页记一笔。'
})
</script>

<template>
  <div class="app-frame">
    <TitleBar @refresh="reload" />
    <div class="stage">
      <div class="scroll">
        <!-- 页头 -->
        <div class="sched-head">
          <button type="button" class="back-btn" @click="goHome">← 回长卷</button>
          <h2>排期</h2>
          <SegTabs
            :items="tabItems"
            :model-value="activeTab"
            variant="tray"
            @update:model-value="(v: string) => activeTab = v"
          />
        </div>

        <!-- 内容区 -->
        <div class="sched-body">
          <!-- 失败态 -->
          <div v-if="sched.failed" class="sched-fail">
            <span class="fail-text">{{ failText }}</span>
            <button type="button" class="retry-btn" @click="reload">重试</button>
          </div>

          <!-- 加载态 -->
          <div v-else-if="sched.loading && sched.orders.length === 0" class="sched-loading">
            加载中…
          </div>

          <!-- 空态 -->
          <div v-else-if="sched.orders.length === 0" class="sched-empty">
            {{ emptyText }}
          </div>

          <!-- 三视图 -->
          <template v-else>
            <!-- 列表 -->
            <div v-if="activeTab === 'list'" class="sched-pane active">
              <ScheduleList :orders="sched.orders" :slot-text="sched.slotText" />
            </div>

            <!-- 月历 -->
            <div v-if="activeTab === 'cal'" class="sched-pane active">
              <div class="cal-head">
                <button type="button" class="cal-nav" aria-label="上月" @click="prevMonth">←</button>
                <span class="ct num">{{ calTitle }}</span>
                <button type="button" class="cal-nav" aria-label="下月" @click="nextMonth">→</button>
              </div>
              <CalGrid :cells="calCells" />
              <div class="cal-legend">
                <span><i class="lg-formal" />正式在画</span>
                <span><i class="lg-buffer" />缓冲区</span>
                <span><i class="lg-soon" />临期≤3天</span>
                <span><i class="lg-over" />逾期</span>
                <span><i class="lg-done" />已完成</span>
                <span v-if="sched.canAccept"><i class="lg-free" />可接单</span>
              </div>
            </div>

            <!-- 时间条（本地模式不渲染，页签已不显） -->
            <div v-if="activeTab === 'tl' && sched.timelineAvailable" class="sched-pane active">
              <ScheduleTimeline :orders="sched.orders" />
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 骨架：顶条 + 卷面吃剩余高（禁 100vh，吃 --app-h） ===== */
.app-frame {
  display: flex; flex-direction: column;
  height: var(--app-h); overflow: hidden;
}
.stage {
  position: relative;
  display: grid; grid-template-columns: minmax(0, 1fr);
  flex: 1; min-height: 0; overflow: hidden;
}
.scroll {
  position: relative; z-index: 1;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  gap: var(--gap, 16px);
  padding: 8px 40px 14px; min-width: 0; overflow-y: auto;
}

/* 滚动条纸墨化 */
.scroll::-webkit-scrollbar { width: 8px; }
.scroll::-webkit-scrollbar-track { background: transparent; }
.scroll::-webkit-scrollbar-thumb { background: rgba(var(--ink-rgb), .22); border-radius: var(--r-s); }
.scroll::-webkit-scrollbar-thumb:hover { background: rgba(var(--ink-rgb), .4); }

/* ===== 页头（照原型 .sched-head） ===== */
.sched-head { display: flex; align-items: center; gap: 12px; padding: 4px 0 10px; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--ink2); padding: 5px 10px;
  border-radius: var(--r-s-hand);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.back-btn:hover { background: rgba(var(--ink-rgb), .05); color: var(--ink); }
.sched-head h2 {
  font-family: var(--f-d); font-size: 20px; font-weight: 700;
  letter-spacing: .06em; margin: 0;
}
/* SegTabs 推到右侧（原型 .seg-tabs margin-left:auto） */
.sched-head :deep(.seg-tabs) { margin-left: auto; }

/* ===== 内容区 ===== */
.sched-body { min-height: 0; overflow-y: auto; }
.sched-pane { min-height: 0; }

/* ===== 失败/空/加载态 ===== */
.sched-fail {
  display: flex; align-items: center; gap: 12px; padding: 14px 0;
}
.fail-text { font-size: 13px; color: var(--ink3); }
.retry-btn {
  font-size: 12px; padding: 4px 14px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  color: var(--ink2); background: var(--card);
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.retry-btn:hover { color: var(--ink); border-color: var(--hq); }
.sched-loading, .sched-empty {
  padding: 48px 0; text-align: center;
  font-size: 14px; color: var(--ink4);
}

/* ===== 月历 pane ===== */
.cal-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.cal-head .ct { font-family: var(--f-d); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.cal-nav {
  width: 28px; height: 28px; border-radius: var(--r-s-hand);
  color: var(--ink3); display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.cal-nav:hover { background: rgba(var(--ink-rgb), .05); color: var(--ink); }

.cal-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; font-size: 11.5px; color: var(--ink4); }
.cal-legend i {
  display: inline-block; width: 9px; height: 9px;
  border-radius: var(--r-s-hand); margin-right: 5px; vertical-align: middle;
}
.lg-formal { background: var(--hq); }
.lg-buffer { background: var(--buf); }
.lg-soon { background: var(--th); }
.lg-over { background: var(--zs); }
.lg-done { background: var(--sl); }
.lg-free { background: var(--sl); border-radius: 50%; }

/* ===== 矮窗自适应 ===== */
@media (max-height: 700px) {
  .stage { --gap: 12px; --row: 46px; }
  .scroll { padding: 6px 24px 10px; }
  .sched-head h2 { font-size: 18px; }
}
</style>
