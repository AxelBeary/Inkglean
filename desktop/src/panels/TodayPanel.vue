<script setup lang="ts">
// today 板块「今日要办」（方向 A 长卷·卷心 core 区）：排期条（fetchSchedule）+ 合并待办（fetchTodos）融合。
// 逾期置顶由数据源排序保证（后端 6 级排序）；等高纪律：内容只许截断（长卷区内部可滚）。
// 本地模式（波6）：读本地记账未完成单（逾期置顶），数据由 Home 统一下发；无未了单才走空态。
import { computed } from 'vue'
import type { ScheduleBar, TodoItem } from '../api/types'
import type { LocalOrder } from '../stores/localLedger'
import { deadlineLevel } from '../components/home/deadline'
import TornPlaceholder from '../components/home/TornPlaceholder.vue'

const props = defineProps<{
  mode: 'cloud' | 'local'
  /** null=未取到/不适用；[] = 取到但为空 */
  schedule: ScheduleBar[] | null
  todos: TodoItem[] | null
  /** 取数失败（静默降级为一行轻量提示） */
  failed: boolean
  /** 待办行已撕成悬浮小窗 */
  torn: boolean
  /** 本地模式：本地记账全量（波6，云端模式不传） */
  localOrders?: LocalOrder[] | null
}>()

/** 截稿日与今天零点差几天（负数=已逾期）；无效日期返回 null */
function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

interface TodoRow {
  t: TodoItem
  dot: 'zs' | 'hq' | 'th' | 'sl'
  done: boolean
  dueText: string
  dueCls: string
}

const rows = computed<TodoRow[]>(() => {
  if (!props.todos) return []
  return props.todos.map(t => {
    const dl = daysLeft(t.deadline)
    const done = t.status === 'done' || t.status === 'delivered'
    let dot: TodoRow['dot']
    let dueText: string
    let dueCls: string
    if (done) {
      dot = 'sl'; dueText = '已了'; dueCls = 'sl'
    } else if (dl !== null && dl < 0) {
      const lv = deadlineLevel(dl)
      dot = 'zs'; dueText = lv.text; dueCls = lv.cls
    } else if (dl !== null && dl <= 3) {
      const lv = deadlineLevel(dl)
      dot = dl <= 1 ? 'zs' : 'hq'; dueText = lv.text; dueCls = lv.cls
    } else if (dl !== null) {
      dot = 'th'; dueText = `剩 ${dl} 天`; dueCls = 'buf'
    } else {
      dot = 'th'; dueText = t.tag; dueCls = 'buf'
    }
    return { t, dot, done, dueText, dueCls }
  })
})

const overdueCount = computed(() => rows.value.filter(r => r.dueCls === 'zs-d' || (r.dot === 'zs' && !r.done && (daysLeft(r.t.deadline) ?? 0) < 0)).length)

// ─── 本地模式行（波6）：本地记账未完成单，逾期置顶、无截稿沉底 ───
interface LocalRow {
  id: number
  who: string
  what: string
  dot: 'zs' | 'hq' | 'th'
  dueText: string
  dueCls: string
  dl: number | null
}

const localRows = computed<LocalRow[]>(() => {
  if (props.mode !== 'local') return []
  const out: LocalRow[] = []
  for (const o of props.localOrders ?? []) {
    if (o.status !== 'draft' && o.status !== 'in_progress') continue
    const dl = daysLeft(o.deadline)
    let dot: LocalRow['dot'] = 'th'
    let dueText = '未定截稿'
    let dueCls = 'buf'
    if (dl !== null) {
      const lv = deadlineLevel(dl)
      dueText = lv.text
      dueCls = lv.cls
      dot = dl < 0 || dl <= 1 ? 'zs' : dl <= 3 ? 'hq' : 'th'
    }
    out.push({ id: o.id, who: o.client_name, what: o.title || '约稿', dot, dueText, dueCls, dl })
  }
  // 逾期置顶：按剩余天数升序，无截稿沉底（与云端逾期置顶同口径）
  out.sort((a, b) => (a.dl ?? Number.MAX_SAFE_INTEGER) - (b.dl ?? Number.MAX_SAFE_INTEGER))
  return out.slice(0, 8)
})

const isEmpty = computed(() =>
  props.mode === 'local'
    ? localRows.value.length === 0
    : (props.todos?.length ?? 0) === 0 && (props.schedule?.length ?? 0) === 0 && !props.failed
)
</script>

<template>
  <div class="sec-head">
    <h2>今日要办</h2>
    <span class="meta">{{ mode === 'cloud' ? '逾期置顶 · 按截稿先后' : '本地模式 · 数据仅存本机' }}</span>
  </div>

  <!-- 近 7 日排期条（云端）：一排小卷签，内容截断不撑高 -->
  <div v-if="mode === 'cloud' && schedule && schedule.length > 0" class="sched">
    <span
      v-for="bar in schedule"
      :key="bar.id"
      class="sched-bar"
      :title="`${bar.clientName ?? bar.orderNo}${bar.styleName ? ' · ' + bar.styleName : ''}`"
    >
      <i aria-hidden="true"></i>{{ bar.clientName ?? bar.orderNo }} · {{ bar.stageName ?? bar.styleName ?? '在案' }}
    </span>
  </div>

  <!-- 待办流（已撕出则留淡墨占位） -->
  <TornPlaceholder v-if="torn" kind="today-todo" label="今日待办" />
  <p v-else-if="failed" class="flow-empty">暂时取不到今日要办</p>
  <p v-else-if="isEmpty" class="flow-empty">今日无事，不如去画画</p>
  <!-- 本地模式：本地记账未完成单（波6） -->
  <ul v-else-if="mode === 'local'" class="todo-list">
    <li v-for="r in localRows" :key="r.id" class="task">
      <span class="dot" :class="r.dot" aria-hidden="true"></span>
      <span class="what"><strong>{{ r.who }} · {{ r.what }}</strong></span>
      <span class="due" :class="r.dueCls">{{ r.dueText }}</span>
    </li>
  </ul>
  <ul v-else class="todo-list">
    <li
      v-for="r in rows"
      :key="r.t.id"
      class="task"
      :class="{ done: r.done }"
    >
      <span class="dot" :class="r.dot" aria-hidden="true"></span>
      <span class="what">
        <strong>{{ r.t.clientName ?? r.t.orderNo }} · {{ r.t.tag }}</strong>
        <span v-if="r.t.stageName" class="prog">{{ r.t.stageName }}</span>
      </span>
      <span class="due" :class="r.dueCls">{{ r.dueText }}</span>
    </li>
  </ul>

  <div v-if="mode === 'cloud' && todos && todos.length > 0" class="foot">
    <span>共 {{ todos.length }} 件事在案 · {{ overdueCount }} 笔逾期</span>
    <span>逾期按截稿日口径</span>
  </div>
</template>

<style scoped>
.sec-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.sec-head h2 { font-family: var(--f-d); font-size: 17px; font-weight: 700; letter-spacing: .08em; color: var(--ink); line-height: 1.25; }
.sec-head .meta { font-size: 12px; color: var(--ink4); }

/* 排期条：近 7 日一行卷签，超出横向滚动不撑高 */
.sched {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 4px;
  scrollbar-width: thin;
}
.sched-bar {
  flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 220px;
  padding: 5px 10px; border: 1px solid var(--line); border-radius: var(--r-s-hand);
  background: var(--paper2); font-size: 12px; color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sched-bar i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--hq); }

/* 待办流：连续卷面账本行（行间极淡墨线只横不竖，照原型 .task 移植） */
.todo-list { list-style: none; margin: 0; padding: 0; }
.task {
  display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; column-gap: 12px;
  height: var(--row, 56px); padding: 0 10px; border-radius: var(--r-s-hand);
  border-bottom: 1px solid rgba(38, 37, 32, .08);
  transition: background var(--dur-fast) var(--ease-out);
}
.task:last-child { border-bottom: none; }
.task:hover { background: rgba(38, 37, 32, .045); }
.dot { position: relative; width: 9px; height: 9px; border-radius: 50%; justify-self: center; }
.dot.zs { background: var(--zs); }
.dot.zs::after {
  content: ""; position: absolute; inset: -7px; border-radius: 50%;
  background: radial-gradient(circle, rgba(188, 58, 43, .16) 0, rgba(188, 58, 43, 0) 70%);
}
.dot.hq { background: var(--hq); }
.dot.th { background: var(--th); }
.dot.sl { background: var(--sl); }
.what { min-width: 0; font-size: 14px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what strong { font-weight: 600; color: inherit; }
.what .prog { font-size: 12px; color: var(--ink4); margin-left: 6px; }
.due { font-size: 12.5px; font-weight: 600; margin-left: 10px; white-space: nowrap; }
.due.zs-d { color: var(--zs-d); }
.due.zs { color: var(--zs-d); }
.due.hq { color: var(--hq-d); }
.due.sl { color: var(--sl); }
.due.buf { color: var(--ink4); font-weight: 500; }
.task.done { opacity: .55; }
.flow-empty { margin: 18px 10px; font-family: var(--f-d); font-size: 14px; color: var(--ink4); }
.foot { margin-top: auto; padding: 18px 10px 2px; display: flex; justify-content: space-between; font-size: 12px; color: var(--ink4); }
</style>
