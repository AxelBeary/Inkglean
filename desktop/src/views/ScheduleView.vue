<script setup lang="ts">
// 独立排期页三视图（9/4 主页重设计落码波1 · 路A）：列表 / 月历 / 时间条，波1 只读。
// 视觉真值＝proto-desktop-home-redesign.html #view-schedule（像素级照搬）。
// 取数一律走 useScheduleStore（不自己写 fetch、不直接调 api/artist.ts）。
// 窗高吃 var(--app-h) 不写 100vh（827 报障根治）。
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useScheduleStore } from '../stores/schedule'
import type { ScheduleUndoSnapshot } from '../stores/schedule'
import { buildCalCells, monthCursor, shiftMonth } from '../schedule/cal'
import type { DragEdge } from '../schedule/drag'
import TitleBar from '../components/shell/TitleBar.vue'
import SegTabs from '../components/schedule/SegTabs.vue'
import CalGrid from '../components/schedule/CalGrid.vue'
import ScheduleList from '../components/schedule/ScheduleList.vue'
import ScheduleTimeline from '../components/schedule/ScheduleTimeline.vue'
import UndoToast from '../components/schedule/UndoToast.vue'
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

// ─── 波2 拖拽接线（写与回滚全在 store，本层只发意图 + 说人话）───
// 口径：组件只递「拖到哪」，不碰接口；store 只回语义（ok/conflict/sessionExpired/clamped），
// 文案全在本层拼（与「板块只呈现」同款纪律）。失败时 store 已重拉到服务端真相，
// 本层绝不自己拆本地数据（那是“两套真相”的老坑）。

/** 可撤销目标：一次性——新写、重拉、点了撤销都立即作废它，不给“撤到远古”的假按钮 */
type UndoTarget =
  | { kind: 'move'; snap: ScheduleUndoSnapshot }
  | { kind: 'reorder'; ids: number[] }

const undoTarget = ref<UndoTarget | null>(null)
const toastText = ref('')
const toastKind = ref<'ok' | 'err'>('ok')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function say(text: string, kind: 'ok' | 'err' = 'ok', ms = 2600): void {
  toastText.value = text
  toastKind.value = kind
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false; toastTimer = null }, ms)
}
function onToastTimeout(): void { toastVisible.value = false }

/** 把 store 的语义结果翻成一句人话（失败均已经重拉，措词里带“已刷新”以免误信屏上旧值） */
function reportFailure(res: {
  conflict?: boolean
  sessionExpired?: boolean
  skipped?: boolean
  clamped?: boolean
  refreshed?: boolean
  serverMessage?: string
}): void {
  if (res.sessionExpired) { say('登录已失效，排期没改动——请在桌面端重新登录后再试。', 'err'); return }
  if (res.conflict) { say('这几单的排期刚在别处改过，已刷新成最新的。', 'err'); return }
  if (res.refreshed) { say('改动结果没确认，已刷新成最新的排期——请看一眼再定。', 'err'); return }
  if (res.skipped) {
    // 拖不动本身不是错，但“为什么不动”得说清；被更新的操作取代则静默不打扰
    if (res.clamped) say('开工日不能早于今天，已经拖到最早的一天了。', 'err')
    return
  }
  const detail = res.serverMessage ? `：${res.serverMessage}` : ''
  say(`没改动${detail}。已刷新成最新的排期。`, 'err')
}

/** 整条平移还是一端改期，分两种说法（画师拖的是“什么时候画”，不是字段名） */
function moveText(snap: ScheduleUndoSnapshot): string {
  if (snap.edge === 'start') return `开工日改到 ${snap.newStartDate}`
  if (snap.edge === 'end') return `截稿日改到 ${snap.newDeadline}`
  return `已整体挪到 ${snap.newStartDate} → ${snap.newDeadline}`
}

async function onMove(payload: { orderId: number; edge: DragEdge; deltaDays: number }): Promise<void> {
  const res = await sched.moveScheduleRange(payload.orderId, payload.edge, payload.deltaDays)
  if (res.ok && res.undo) {
    undoTarget.value = { kind: 'move', snap: res.undo }
    const extra = res.clamped ? '（开工日不能早于今天，已停在最早一天）' : ''
    say(`${moveText(res.undo)}${extra}`)
    return
  }
  reportFailure(res)
}

async function onReorder(payload: { orderedIds: number[] }): Promise<void> {
  const previous = [...sched.formalIds] // 写前取快照；写成功后 store 已重拉，本地旧序只剩这一个用处
  const res = await sched.reorderFormal(payload.orderedIds)
  if (res.ok) {
    undoTarget.value = { kind: 'reorder', ids: previous }
    say('顺序已保存。')
    return
  }
  reportFailure(res)
}

async function onUndo(): Promise<void> {
  const target = undoTarget.value
  if (!target) return
  undoTarget.value = null // 先取走再发请求：防连点两下撤两次
  if (target.kind === 'move') {
    const res = await sched.undoScheduleRange(target.snap)
    if (res.ok) say('已撤销，排期回到拖之前。')
    else reportFailure(res)
    return
  }
  const res = await sched.reorderFormal(target.ids)
  if (res.ok) say('已撤销，顺序回到拖之前。')
  else reportFailure(res)
}

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
              <ScheduleList
                :orders="sched.orders"
                :slot-text="sched.slotText"
                :reorderable="sched.canWriteList"
                @reorder="onReorder"
              />
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
              <ScheduleTimeline
                :orders="sched.orders"
                :movable="sched.canWriteTimeline"
                @move="onMove"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
    <!-- 波2 写反馈：一句人话，成功时另给一次性的撤销条。两层互斥，同屏只留一条 -->
    <transition name="toast">
      <div
        v-if="toastVisible && !undoTarget"
        class="sched-toast"
        :class="`sched-toast--${toastKind}`"
        role="status"
      >
        {{ toastText }}
      </div>
    </transition>
    <UndoToast
      :visible="undoTarget !== null"
      :message="toastText"
      label="撤销"
      @undo="onUndo"
      @timeout="onToastTimeout"
    />
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

/* ===== 写反馈（一句人话 + 撤销条同位互斥） ===== */
/* 几何对齐工具箱既有 .toast（ExportTool 等），但取值落在 4px 栅上（bottom 32 / padding 8 16），
   不新增离栅值；z-index 同 60，两层靠 v-if 互斥所以上下序不重要 */
.sched-toast {
  position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
  z-index: 60;
  font-size: 12.5px; color: var(--ink2); background: var(--card);
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  padding: 8px 16px; white-space: nowrap;
  box-shadow: 0 10px 24px -16px rgba(var(--ink-rgb), .45);
}
.sched-toast--err { color: var(--zs); border-color: var(--zs);
  background: color-mix(in srgb, var(--zs) 8%, var(--card)); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 6px); }

/* ===== 矮窗自适应 ===== */
@media (max-height: 700px) {
  .stage { --gap: 12px; --row: 46px; }
  .scroll { padding: 6px 24px 10px; }
  .sched-head h2 { font-size: 18px; }
}
</style>
