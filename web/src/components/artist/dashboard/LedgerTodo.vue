<template>
  <!-- 账本待办（视觉批 P1，提案 §5.1 + 「一行一个动词」交互规范）：
       每行只显示下一步动词按钮，原地完成 + 5s 墨线冷却；完成=笔点沉底；
       交付动词进详情页交付流；沉底区「清账·撕页」。节点推进入口在详情/排期看板。 -->
  <section class="ledger-card" :aria-label="t('dashboard.todoTitle')">
    <div class="ledger-head">
      <span class="ledger-title">{{ t('dashboard.todoTitle') }}</span>
      <button
        v-if="sunkRows.length > 0"
        class="settle-btn"
        type="button"
        :disabled="tearing"
        @click="settle"
      >
        {{ t('dashboard.ledgerSettle') }}
      </button>
    </div>

    <!-- 加载态：骨架条 -->
    <div v-if="state === 'loading'" class="todo-skeleton">
      <div v-for="i in 4" :key="i" class="todo-skeleton-row"></div>
    </div>

    <!-- 错误态：明示 + 重试 -->
    <div v-else-if="state === 'error'" class="ledger-error">
      <span>{{ t('common.networkError') }}</span>
      <button class="retry-btn" type="button" @click="load">{{ t('dashboard.retry') }}</button>
    </div>

    <template v-else>
      <!-- 空态 -->
      <p v-if="!items.length && !sunkRows.length" class="ledger-empty">{{ t('dashboard.ledgerEmpty') }}</p>

      <!-- 在办行 -->
      <div class="ledger-rows">
        <div
          v-for="item in items"
          :key="item.id"
          class="row"
          :class="{ 'row--overdue': item.tag === 'overdue' || item.tag === 'dueToday' }"
          role="button"
          tabindex="0"
          @click="goDetail(item)"
          @keydown.enter="goDetail(item)"
        >
          <span class="dot" :class="dotClass(item)" aria-hidden="true"></span>
          <span class="r-no">#{{ item.orderNo }}</span>
          <span v-if="item.tag" class="r-tag" :class="`tag-${item.tag}`">{{ t(`dashboard.tag_${item.tag}`) }}</span>
          <span class="r-name">{{ item.clientName || item.orderNo }}</span>
          <span class="r-chip">{{ t(`common.orderStatus.${item.status}`) }}</span>
          <span v-if="item.deadline" class="r-meta">{{ formatDate(item.deadline) }}</span>
          <button
            class="r-btn"
            :class="{ 'r-btn--deliver': verbOf(item).key === 'deliver' }"
            type="button"
            :disabled="busy || cooldowns[item.id] > 0"
            @click.stop="act(item)"
          >
            <template v-if="cooldowns[item.id] > 0">{{ t('dashboard.ledgerCooldown', { n: cooldowns[item.id] }) }}</template>
            <template v-else>{{ verbOf(item).label }}</template>
            <span v-if="cooldowns[item.id] > 0" class="inkline" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <!-- 沉底区（完成行变淡归档） -->
      <template v-if="sunkRows.length > 0">
        <div class="sec-label">{{ t('dashboard.ledgerSunk') }}</div>
        <div class="ledger-rows" :class="{ tearing }">
          <div v-for="item in sunkRows" :key="item.id" class="row sunk">
            <span class="dot dot-done" aria-hidden="true"></span>
            <span class="r-no">#{{ item.orderNo }}</span>
            <span class="r-name">{{ item.clientName || item.orderNo }}</span>
            <span class="r-meta">{{ t('common.orderStatus.done') }}</span>
          </div>
        </div>
        <p v-if="settledNote" class="settled-note">{{ t('dashboard.ledgerSettled') }}</p>
      </template>

      <!-- 月度小结（§6.1：一行极安静，走势在工具箱） -->
      <div v-if="monthCents != null" class="month-line">
        <span>{{ t('dashboard.ledgerMonth') }}</span>
        <b>¥{{ formatCents(monthCents) }}</b>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../../api/index.js'
import { formatCents } from '../../../utils/money.js'
import { formatDateTime } from '../../../utils/datetime.js'
import { tagKey } from '../../../utils/dashboard-normalize.js'
import type { TodoItem } from '../../../api/types.js'

// monthCents 经 defineProps 直接在模板使用（不做 const 绑定，避免 TS 未用警告）
defineProps<{
  /** getStats 的 monthRevenueCents，可空则不显月度小结 */
  monthCents?: number | null
}>()

const { t } = useI18n()
const router = useRouter()

const state = ref<'loading' | 'ok' | 'error'>('loading')
const items = ref<TodoItem[]>([])
const sunkRows = ref<TodoItem[]>([])
const busy = ref(false)
const tearing = ref(false)
const settledNote = ref(false)
const cooldowns = reactive<Record<number, number>>({})
const timers: ReturnType<typeof setInterval>[] = []

/** 一行一个动词：status → 下一步动词（文案走 i18n，动作走现有 updateStatus） */
const VERBS = {
  pending: 'confirm',
  confirmed: 'start',
  wip: 'done',
  revision: 'done',
  done: 'deliver'
} as const
type VerbKey = (typeof VERBS)[keyof typeof VERBS] | 'none'

function verbOf(item: TodoItem): { key: VerbKey; label: string } {
  const key = (VERBS as Record<string, VerbKey>)[item.status] ?? 'none'
  // E3: wip 订单若有当前工作流节点（后端 stageName），动词换成真实节点名；
  // 点击语义不变（仍推进到 done）；字段缺失/为空时降级为既有“完成”措辞
  if (key === 'done' && item.status === 'wip' && item.stageName) {
    return { key, label: t('dashboard.ledgerVerbAdvance', { stage: item.stageName }) }
  }
  const labelMap: Record<string, string> = {
    confirm: t('dashboard.ledgerVerbConfirm'),
    start: t('dashboard.ledgerVerbStart'),
    done: t('dashboard.ledgerVerbDone'),
    deliver: t('dashboard.ledgerVerbDeliver')
  }
  return { key, label: labelMap[key] ?? '' }
}

function dotClass(item: TodoItem) {
  if (item.tag === 'overdue' || item.tag === 'dueToday') return 'dot-late'
  if (item.status === 'done') return 'dot-done'
  return 'dot-wip'
}

function formatDate(iso: string) { return formatDateTime(iso) }

async function load() {
  state.value = 'loading'
  try {
    const res = await artistApi.getDashboardTodo()
    // I3 抓修：后端 tag 为中文（新单/逾期…），需经 tagKey 映射成枚举（pending/overdue…），
    // 否则模板 t('dashboard.tag_'+中文) 命中不了键，标签渲染成原始键名
    items.value = (res.items || []).map(o => ({ ...o, tag: tagKey(o.tag) }))
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
}

/** 5s 墨线冷却：防连点，倒计时走完恢复动词 */
function startCooldown(id: number) {
  cooldowns[id] = 5
  const timer = setInterval(() => {
    cooldowns[id] -= 1
    if (cooldowns[id] <= 0) {
      cooldowns[id] = 0
      clearInterval(timer)
    }
  }, 1000)
  timers.push(timer)
}

/** 完成仪式：笔点盖上 → 变淡 → 沉底 */
function sinkRow(item: TodoItem) {
  items.value = items.value.filter(i => i.id !== item.id)
  sunkRows.value.push(item)
}

async function act(item: TodoItem) {
  const verb = verbOf(item)
  if (verb.key === 'none' || busy.value || cooldowns[item.id] > 0) return
  // 交付动词：交付流在订单详情页，行体直达详情（不是原地动作）
  if (verb.key === 'deliver') {
    router.push(`/orders/${item.id}?from=dashboard`)
    return
  }
  busy.value = true
  try {
    if (verb.key === 'done' && item.nextStageId) {
      // 815 审计 P1-2 修复：工作流单的"完成"=推进到下一节点（后端 R30d 拦直接改 done）；
      // 推到末节点时后端自动置 done → 行沉底；未到底则重载拿新节点名
      const updated = await artistApi.advanceStage(item.id, item.nextStageId)
      if (updated.status === 'done') {
        sinkRow(item)
      } else {
        await load()
        startCooldown(item.id)
      }
      return
    }
    const nextStatus = verb.key === 'confirm' ? 'confirmed' : verb.key === 'start' ? 'wip' : 'done'
    await artistApi.updateStatus(item.id, nextStatus)
    if (nextStatus === 'done') {
      sinkRow(item)
    } else {
      // 原地状态前进：更新行状态，动词随之递进
      items.value = items.value.map(i => i.id === item.id ? { ...i, status: nextStatus } : i)
      startCooldown(item.id)
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = false
  }
}

/** 清账·撕页：整叠沉底区撕走（两段式动画） */
let settleTimer: ReturnType<typeof setTimeout> | null = null
function settle() {
  if (!sunkRows.value.length || tearing.value) return
  tearing.value = true
  settleTimer = setTimeout(() => {
    sunkRows.value = []
    tearing.value = false
    settledNote.value = true
  }, 820)
}

function goDetail(item: TodoItem) {
  router.push(`/orders/${item.id}?from=dashboard`)
}

onMounted(() => load())
onUnmounted(() => {
  timers.forEach(clearInterval)
  if (settleTimer) clearTimeout(settleTimer) // a1: 卸载后 820ms 定时器不得再改 sunkRows/tearing/settledNote
})
</script>

<style scoped>
/* ─── 账本待办（原型 v0.9 移植 + 三态） ─── */
.ledger-card {
  background: var(--card); padding: calc(var(--font-scale, 1) * 26px) calc(var(--font-scale, 1) * 30px) calc(var(--font-scale, 1) * 20px);
  position: relative;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}
.ledger-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
.ledger-title { font-size: calc(var(--font-scale, 1) * 17px); font-weight: 600; letter-spacing: .14em; }
.settle-btn {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--zhe); background: none; border: 1px solid color-mix(in srgb, var(--zhe) 45%, transparent);
  padding: 2px 10px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.settle-btn:hover:not(:disabled) { background: var(--gold-t); }
.settle-btn:disabled { cursor: default; opacity: .6; }
/* 三态：骨架/错误/空 */
.todo-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.todo-skeleton-row { height: 36px; border-radius: 6px; background: var(--paper2); animation: todo-pulse 1.2s ease-in-out infinite; }
@keyframes todo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.ledger-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
.retry-btn {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer;
  color: var(--hq); background: none; border: 1px solid color-mix(in srgb, var(--hq) 40%, transparent);
  padding: 2px 12px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
}
.retry-btn:hover { background: var(--hq-t); }
.ledger-empty { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); padding: 12px 2px; }
/* 行 */
.ledger-rows { min-height: 8px; }
.row {
  display: flex; align-items: center; gap: 11px; padding: 13px 10px;
  border-bottom: 1px solid var(--line); font-size: calc(var(--font-scale, 1) * 14.5px);
  flex-wrap: wrap; cursor: pointer; border-radius: 4px; transition: background var(--dur-fast) var(--ease-out); position: relative;
}
.ledger-rows .row:last-child { border-bottom: none; }
.row:hover { background: var(--paper2); }
.row--overdue { border-left: 3px solid var(--zs); }
.dot { width: 9px; height: 9px; border-radius: 50% 46% 52% 48%; flex: none; }
.dot-wip { background: var(--hq); }
.dot-late { background: var(--zs); box-shadow: 0 0 0 5px var(--zs-t); }
.dot-done { background: var(--sl); }
.r-no { flex: none; font-weight: 600; font-size: calc(var(--font-scale, 1) * 13.5px); color: var(--ink); font-family: var(--f-d); font-variant-numeric: tabular-nums; }
.r-tag { flex: none; font-size: calc(var(--font-scale, 1) * 11px); padding: 2px 8px; border-radius: 3px 6px 4px 5px / 5px 4px 6px 3px; white-space: nowrap; }
.tag-overdue, .tag-dueToday { color: #fff; background: var(--zs); }
.tag-pending { color: var(--hq); background: var(--hq-t); }
.tag-revision { color: var(--th); background: var(--th-t); }
.tag-inProgress { color: var(--ink2); background: var(--paper2); border: 1px solid var(--line); }
.r-name { color: var(--ink2); flex: 1; min-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row:hover .r-name { color: var(--ink); }
.r-chip { flex: none; font-size: calc(var(--font-scale, 1) * 11.5px); padding: 2px 9px; border-radius: 3px 6px 4px 5px / 5px 4px 6px 3px; background: var(--paper2); color: var(--ink3); border: 1px solid var(--line); white-space: nowrap; }
.r-meta { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); flex: none; }
/* 动词按钮 + 墨线冷却 */
.r-btn {
  font: inherit; font-size: calc(var(--font-scale, 1) * 12px); cursor: pointer; flex: none; position: relative; overflow: hidden;
  color: var(--sl); background: none; border: 1px solid color-mix(in srgb, var(--sl) 40%, transparent);
  padding: 3px 11px; border-radius: 3px 6px 4px 6px / 6px 4px 6px 3px;
  transition: background var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out);
}
.r-btn:hover:not(:disabled) { background: var(--sl-t); }
.r-btn--deliver { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 55%, transparent); }
.r-btn--deliver:hover:not(:disabled) { background: var(--gold-t); }
.r-btn:disabled { cursor: default; color: var(--ink4); border-color: var(--line2); background: none; }
.r-btn .inkline {
  position: absolute; left: 0; bottom: 0; height: 2px; width: 100%;
  background: color-mix(in srgb, var(--ink) 45%, transparent);
  transform-origin: left center; animation: ink-dry 5s linear forwards;
}
@keyframes ink-dry { from { transform: scaleX(1); } to { transform: scaleX(0); } }
/* 沉底与撕页 */
.row.sunk { opacity: .45; }
.sec-label {
  font-size: calc(var(--font-scale, 1) * 12.5px); color: var(--ink3); letter-spacing: .22em;
  margin: 20px 0 2px; display: flex; align-items: center; gap: 10px;
}
.sec-label::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.ledger-rows.tearing { animation: tear-away .8s cubic-bezier(.45, 0, .75, .4) forwards; transform-origin: 80% 0%; }
@keyframes tear-away {
  0% { transform: none; opacity: .45; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  35% { transform: rotate(2.2deg) translate(14px, -9px); opacity: .5; clip-path: polygon(0 0, 100% 0, 100% 100%, 80% 95%, 62% 100%, 40% 94%, 22% 100%, 0 96%); }
  100% { transform: rotate(7deg) translate(110px, 150px); opacity: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 80% 95%, 62% 100%, 40% 94%, 22% 100%, 0 96%); }
}
.settled-note { font-size: calc(var(--font-scale, 1) * 12.5px); color: var(--ink4); padding: 10px 2px; animation: note-fade .6s ease both; }
@keyframes note-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
/* 月度小结 */
.month-line {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line);
  font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink3);
  display: flex; justify-content: space-between;
}
.month-line b { font-weight: 400; color: var(--ink2); font-variant-numeric: tabular-nums; }
/* 窄屏：动词按钮换行占整行 */
@media (max-width: 600px) {
  .r-btn { flex-basis: 100%; text-align: center; }
  .ledger-card { padding-left: calc(var(--font-scale, 1) * 18px); padding-right: calc(var(--font-scale, 1) * 18px); }
}
@media (prefers-reduced-motion: reduce) {
  .todo-skeleton-row, .ledger-rows.tearing, .settled-note, .r-btn .inkline { animation: none; }
}
</style>
