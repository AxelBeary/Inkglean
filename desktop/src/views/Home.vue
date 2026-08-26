<script setup lang="ts">
// 首页「案头长卷」（方向 A，视觉真值＝原型 proto-desktop-home-r2-A.html，逐段移植）。
// 页面即摊开的手卷：题签（拾绘/日期/画师名/概览句/墨笔菜单/显隐/挂牌）→ 卷心（今日要办 + 题跋 aside）
// → 卷尾（订单速览 + 状态带）；天地杆为唯一结构件。
// 框架纪律（§4.3）统一在此施加：双模式过滤 / 显隐 / 专注收合 / 装裱 / 撕悬浮启动恢复；板块自己一概不管。
// 数据编排：云端数据由本页统一取数下发板块，失败按节静默降级为一行提示；本地模式不调任何云端接口。
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { onErrorCaptured } from 'vue'
import { useAuthStore } from '../stores/auth'
import { usePrefsStore } from '../stores/prefs'
import { PANEL_REGISTRY } from '../panels/contract'
import type { PanelId } from '../panels/contract'
import type {
  ArtistOrderItem,
  ArtistStatus,
  DeadlineSoonItem,
  GuestbookMessage,
  IncomeOverview,
  ScheduleBar,
  TodoItem
} from '../api/types'
import type { RevenueResult } from '../api/types'
import {
  fetchDeadlineSoon,
  fetchIncomeOverview,
  fetchMessages,
  fetchOrders,
  fetchProfile,
  fetchRevenue,
  fetchSchedule,
  fetchTodos
} from '../api/artist'
import { checkAndDownloadUpdate, installPendingUpdate, isDesktop, notify } from '../bridge'
import { openFloatingWindow } from '../bridge/window'
import { useLocalLedgerStore } from '../stores/localLedger'
import { useAutoTimeStore } from '../stores/autoTime'
import { buildLocalGlance, localDaysLeft } from '../components/home/localGlance'
import {
  buildDeadlineAlerts, loadAlertedIds, saveAlertedIds
} from '../tools/deadlineAlert'
import type { DeadlineAlertItem } from '../tools/deadlineAlert'
import { setTrayTooltip } from '../bridge/tray'
import { buildTraySnapshot } from '../tools/traySnapshot'
import TodayPanel from '../panels/TodayPanel.vue'
import LedgerPanel from '../panels/LedgerPanel.vue'
import OpsPanel from '../panels/OpsPanel.vue'
import MsgsPanel from '../panels/MsgsPanel.vue'
import OrdersPanel from '../panels/OrdersPanel.vue'
import InkPenMenu from '../components/home/InkPenMenu.vue'
import StatusPlaque from '../components/home/StatusPlaque.vue'
import TailStatusBar from '../components/home/TailStatusBar.vue'
import AboutPopover from '../components/home/AboutPopover.vue'
import TitleBar from '../components/shell/TitleBar.vue'

const auth = useAuthStore()
const prefs = usePrefsStore()
const ledger = useLocalLedgerStore()
const autoTime = useAutoTimeStore()

// ─── 运行模式与在线状态 ───
const mode = computed<'cloud' | 'local'>(() => auth.mode)
const cloud = computed(() => mode.value === 'cloud')
const online = ref(navigator.onLine)
function onOnline() {
  online.value = true
  void loadAll() // 断网恢复自动重拉一次（失败照旧按节静默）
}
function onOffline() { online.value = false }

// ─── 题签：日期 / 概览句 ───
const dateText = computed(() => {
  const n = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][n.getDay()]
  return `${n.getMonth() + 1}月${n.getDate()}日 · 周${wd}`
})

// ─── 云端数据（本页统一取数，失败按节静默） ───
const schedule = ref<ScheduleBar[] | null>(null)
const todos = ref<TodoItem[] | null>(null)
const income = ref<IncomeOverview | null>(null)
const revenue = ref<RevenueResult | null>(null)
const messages = ref<GuestbookMessage[] | null>(null)
const orders = ref<ArtistOrderItem[] | null>(null)
const deadlines = ref<DeadlineSoonItem[] | null>(null)
const plaqueStatus = ref<ArtistStatus | null>(null)
const slotDisplay = ref<string | null>(null)
const todayFailed = ref(false)
const opsFailed = ref(false)
const msgsFailed = ref(false)
const ordersFailed = ref(false)
const lastRefresh = ref<Date | null>(null)
// 留言待审计数基线（壳层商业化批）：首次取数只记基线不通知（防开机打扰），
// 其后任何一次取数（重载/断网恢复）待审变多即发系统通知。
const prevPending = ref<number | null>(null)

function isArtistStatus(v: string | undefined | null): v is ArtistStatus {
  return v === 'open' || v === 'full' || v === 'break' || v === 'hidden'
}

async function loadAll() {
  if (!cloud.value) return // 本地模式：不调云端接口（双模式纪律）
  const [sch, td, inc, rev, msg, ord, dl, pf] = await Promise.allSettled([
    fetchSchedule(),
    fetchTodos(),
    fetchIncomeOverview(),
    fetchRevenue('month'),
    fetchMessages(),
    fetchOrders(),
    fetchDeadlineSoon(14, 6),
    fetchProfile()
  ])
  todayFailed.value = sch.status === 'rejected' || td.status === 'rejected'
  if (sch.status === 'fulfilled') schedule.value = sch.value.bars
  if (td.status === 'fulfilled') todos.value = td.value.items
  opsFailed.value = inc.status === 'rejected' && rev.status === 'rejected'
  if (inc.status === 'fulfilled') income.value = inc.value
  if (rev.status === 'fulfilled') revenue.value = rev.value
  msgsFailed.value = msg.status === 'rejected'
  if (msg.status === 'fulfilled') {
    messages.value = msg.value.items
    const pending = msg.value.items.filter(m => m.status === 'pending').length
    if (prevPending.value !== null && pending > prevPending.value && pending > 0) {
      void notify('拾绘', `${pending} 条留言待审`)
    }
    prevPending.value = pending
  }
  ordersFailed.value = ord.status === 'rejected' || dl.status === 'rejected'
  if (ord.status === 'fulfilled') orders.value = ord.value.items
  if (dl.status === 'fulfilled') deadlines.value = dl.value.items
  if (pf.status === 'fulfilled') {
    if (isArtistStatus(pf.value.status)) plaqueStatus.value = pf.value.status
    slotDisplay.value = pf.value.slotDisplay ?? null
  }
  const anyOk = [sch, td, inc, rev, msg, ord, dl, pf].some(r => r.status === 'fulfilled')
  if (anyOk) lastRefresh.value = new Date()
  // 截稿提醒（波14）：云端截稿倒计时里挑逾期/今天/明天，每日去重一条通知（不打扰纪律）
  if (dl.status === 'fulfilled') {
    void checkDeadlineAlerts(dl.value.items.map(d => ({
      id: `cloud-${d.id}`,
      who: d.clientName ?? d.orderNo,
      daysLeft: d.daysLeft
    })))
  }
}

/** 截稿提醒链（波14，云端/本地共用）：组句→去重→通知→落标记；失败静默不阻塞首页 */
async function checkDeadlineAlerts(items: DeadlineAlertItem[]): Promise<void> {
  if (!isDesktop() || items.length === 0) return
  const alerted = loadAlertedIds()
  const alert = buildDeadlineAlerts(items, alerted)
  if (!alert) return
  await notify('拾绘', alert.text)
  saveAlertedIds([...alerted, ...alert.newIds])
}

// ─── 托盘快照（波15，首发拍板件补齐）：今日状态概要随数据响应式刷新到托盘 tooltip ───
watchEffect(() => {
  let overdue = 0
  let dueToday = 0
  let openCount: number
  if (cloud.value) {
    openCount = orders.value?.length ?? 0
    for (const d of deadlines.value ?? []) {
      if (d.daysLeft < 0) overdue++
      else if (d.daysLeft === 0) dueToday++
    }
  } else {
    openCount = ledger.orders.length
    for (const o of ledger.orders) {
      if (o.status !== 'draft' && o.status !== 'in_progress') continue
      const dl = localDaysLeft(o.deadline)
      if (dl === null) continue
      if (dl < 0) overdue++
      else if (dl === 0) dueToday++
    }
  }
  void setTrayTooltip(buildTraySnapshot({
    modeLabel: cloud.value ? (auth.artist?.name ?? '画师') : '本地',
    openCount,
    overdue,
    dueToday,
    paintedSecs: autoTime.today.paint
  }))
})

/** 概览句段落（od=逾期加重 / ok=在案加深；本地模式读本地记账，波6） */
interface GlancePart { text: string; tone: 'od' | 'ok' | '' }
const glanceParts = computed<GlancePart[]>(() => {
  if (!cloud.value) return buildLocalGlance(ledger.orders, ledger.paidThisMonth)
  const parts: GlancePart[] = []
  const overdue = (todos.value ?? []).filter(t => {
    if (t.status === 'done' || t.status === 'delivered' || !t.deadline) return false
    const d = new Date(t.deadline)
    if (Number.isNaN(d.getTime())) return false
    const n = new Date()
    const a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return b < a
  }).length
  const total = todos.value?.length ?? 0
  if (overdue > 0) parts.push({ text: `${overdue} 笔逾期`, tone: 'od' })
  if (total > 0) parts.push({ text: `${total} 件事在案`, tone: 'ok' })
  const nearest = (deadlines.value ?? [])[0]
  if (nearest) {
    const who = nearest.clientName ?? nearest.orderNo
    const due = nearest.daysLeft <= 0 ? '今日截稿' : nearest.daysLeft === 1 ? '明天截稿' : `剩 ${nearest.daysLeft} 天`
    parts.push({ text: `${who}${due}`, tone: '' })
  }
  const pendingMsgs = (messages.value ?? []).filter(m => m.status === 'pending').length
  if (pendingMsgs > 0 && online.value) parts.push({ text: `${pendingMsgs} 条留言待审`, tone: '' })
  return parts.length > 0 ? parts : [{ text: '今日无事，不如去画画', tone: '' }]
})

// ─── 板块显隐 / 专注收合（框架统一施加） ───
function panelShown(id: PanelId): boolean {
  if (prefs.prefs.hidden.includes(id)) return false
  const contract = PANEL_REGISTRY.find(p => p.id === id)
  if (prefs.prefs.focus && contract?.focusPolicy === 'fold') return false
  if (id === 'msgs' && (!cloud.value || !online.value)) return false // 留言：本地/断网整块隐藏
  return true
}
const hideablePanels = computed(() => PANEL_REGISTRY.filter(p => p.hideable))
const showOps = computed(() => panelShown('ops'))
const showMsgs = computed(() => panelShown('msgs'))
const showOrders = computed(() => panelShown('orders'))
const showAside = computed(() => showOps.value || showMsgs.value)

// ─── 撕悬浮启动恢复：重开应用仍按偏好撕出态拉起悬浮窗；拉起失败即清掉该件撕出态，
// 防「已撕出」占位骗人（826 终验报障同源整改） ───
function restoreTorn() {
  if (!isDesktop()) return
  for (const kind of [...prefs.prefs.torn]) {
    openFloatingWindow(kind).catch(() => { prefs.setTorn(kind, false) })
  }
}

// ─── 启动静默检查更新（保留既有口径：云端登录态，失败全静默） ───
async function silentUpdateCheck() {
  if (!isDesktop() || !auth.loggedIn) return
  try {
    const result = await checkAndDownloadUpdate()
    if (result === 'downloaded' && window.confirm('新版本已下载，现在重启完成更新？')) {
      await installPendingUpdate()
    }
  } catch {
    // 端点未配置/无网络/验签拒装：静默降级
  }
}

// ─── 关于弹层（墨笔菜单与卷尾两入口共用开关） ───
const aboutOpen = ref(false)
function openAbout() { aboutOpen.value = true }

// ─── 重载数据：标题栏常驻入口（826：取数只在进首页一刻，数据后灌/切模式后需要随手重拉） ───
function onRefresh(): void {
  void loadAll()
}

onMounted(async () => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  restoreTorn()
  // F8 二期自动识别：双模式均启（纯本地采样，不联网，合双模式纪律）
  autoTime.start()
  if (cloud.value) {
    void loadAll()
    void silentUpdateCheck()
  } else {
    // 本地模式：读本地记账（概览句/今日要办/订单速览本地变体的数据源，波6）
    if (!ledger.loaded) await ledger.loadAll()
    // 截稿提醒（波14）：本地记账未完成单里的逾期/今天/明天，同云端一条链（每日去重）
    void checkDeadlineAlerts(
      ledger.orders
        .filter(o => (o.status === 'draft' || o.status === 'in_progress') && o.deadline)
        .map(o => {
          const dl = localDaysLeft(o.deadline)
          return { id: `local-${o.id}`, who: o.client_name || '有一单', daysLeft: dl ?? 99 }
        })
        .filter(i => i.daysLeft <= 1)
    )
  }
})
onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  autoTime.stop()
})

// ─── 渲染兜底：单个板块数据形状异常导致渲染炸时，错误止于该子树，首页整体与状态带照常更新；
// 不许一颗老鼠屎拖垮整页（826「一直同步中」同源教训：渲染炸 → 整页 patch 中止 → 状态条永停） ───
onErrorCaptured((err, _instance, info) => {
  // eslint-disable-next-line no-console -- 渲染兜底诊断日志：板块炸时唯一的现场线索，刻意保留
  console.error('[panel-render]', info, err)
  return false
})
</script>

<template>
  <TitleBar @refresh="onRefresh" />
  <div class="stage" :class="`mount-${prefs.prefs.mount}`">
    <div class="scroll">
      <!-- 题签（顶带） -->
      <header class="masthead">
        <div class="title-block">
          <h1>拾绘</h1>
          <span class="sep" aria-hidden="true"></span>
          <span class="date num">{{ dateText }}</span>
          <span v-if="cloud" class="sep" aria-hidden="true"></span>
          <span v-if="cloud" class="artist">{{ auth.artist?.name ?? '画师' }}</span>
        </div>
        <p class="glance">
          <template v-for="(part, i) in glanceParts" :key="i">
            <b v-if="part.tone === 'od'">{{ part.text }}</b>
            <span v-else-if="part.tone === 'ok'" class="ok">{{ part.text }}</span>
            <template v-else>{{ part.text }}</template>
            <template v-if="i < glanceParts.length - 1"> · </template>
          </template>
        </p>
        <InkPenMenu @open-about="openAbout" />
        <div class="toggles" role="group" aria-label="板块显隐（快捷）">
          <span class="lbl">显隐</span>
          <button
            v-for="p in hideablePanels"
            :key="p.id"
            type="button"
            class="chip"
            :aria-pressed="!prefs.prefs.hidden.includes(p.id)"
            @click="prefs.toggleHidden(p.id)"
          >
            {{ p.label === '订单速览' ? '订单' : p.label }}
          </button>
        </div>
        <!-- 状态挂牌：壳控件，仅云端模式渲染（§4.2 拍板） -->
        <StatusPlaque v-if="cloud" :initial-status="plaqueStatus" :slot-display="slotDisplay" />
        <span class="vh" aria-live="polite"></span>
      </header>

      <!-- 卷心：云端＝今日要办；本地＝本地记账（本地核心环波1，F2） -->
      <main class="body" :class="{ 'body--solo': !showAside }">
        <section v-if="cloud" class="flow" aria-label="今日要办">
          <TodayPanel
            :mode="mode"
            :schedule="schedule"
            :todos="todos"
            :failed="todayFailed"
            :torn="prefs.isTorn('today-todo')"
            :local-orders="ledger.orders"
          />
        </section>
        <section v-else class="flow" aria-label="本地记账">
          <LedgerPanel />
        </section>

        <aside v-if="showAside" class="aside">
          <section v-if="showOps" class="card ops" aria-label="经营与时间">
            <OpsPanel
              :mode="mode"
              :income="income"
              :revenue="revenue"
              :failed="opsFailed"
              :torn="prefs.isTorn('timer')"
            />
          </section>
          <section v-if="showMsgs" class="card msgs" aria-label="留言">
            <MsgsPanel :messages="messages" :failed="msgsFailed" />
          </section>
        </aside>
      </main>

      <!-- 卷尾 -->
      <footer class="tail-bar">
        <OrdersPanel
          v-if="showOrders"
          :mode="mode"
          :orders="orders"
          :deadlines="deadlines"
          :failed="ordersFailed"
          :torn-deadline="prefs.isTorn('deadline')"
          :local-orders="ledger.orders"
        />
        <TailStatusBar :mode="mode" :last-refresh="lastRefresh" @open-about="openAbout" />
      </footer>
    </div>

    <!-- 远山为幕（移植自网页登录页 LoginBackdrop，826 终验整改：替换旧山+亭装饰）：
         低饱和远山天际线 + 水面倒影，山巅渐隐融入纸色，铺页面底部不抓戏 -->
    <div class="backdrop" aria-hidden="true">
      <div class="bk-mountains">
        <div class="bk-up">
          <svg class="bk-range" viewBox="0 0 1440 240" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lgBkFar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-opacity="0.35" />
                <stop offset="1" stop-opacity="1" />
              </linearGradient>
              <linearGradient id="lgBkMid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-opacity="0.5" />
                <stop offset="1" stop-opacity="1" />
              </linearGradient>
              <linearGradient id="lgBkNear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-opacity="0.62" />
                <stop offset="1" stop-opacity="1" />
              </linearGradient>
            </defs>
            <!-- 三层山脊：峰距/峰高不等距，C 曲线左右不对称（照登录页原件） -->
            <path class="bk-layer bk-far" fill="url(#lgBkFar)" d="M0,148 C70,134 130,142 200,120 C268,99 310,128 380,114 C446,101 484,64 556,74 C622,83 660,118 736,108 C812,98 842,56 918,64 C992,72 1030,106 1102,96 C1166,88 1224,118 1296,104 C1348,94 1398,110 1440,100 L1440,240 L0,240 Z" />
            <path class="bk-layer bk-mid" fill="url(#lgBkMid)" d="M0,188 C64,172 104,180 166,154 C228,128 272,160 342,146 C412,132 452,96 522,106 C592,116 630,152 708,140 C786,128 828,94 898,102 C968,110 1008,148 1086,136 C1156,126 1198,146 1268,136 C1326,128 1384,146 1440,138 L1440,240 L0,240 Z" />
            <path class="bk-layer bk-near" fill="url(#lgBkNear)" d="M0,212 C86,198 148,206 228,188 C308,170 366,196 454,184 C542,172 596,148 686,158 C776,168 830,194 926,182 C1022,170 1076,150 1168,162 C1260,174 1330,190 1440,178 L1440,240 L0,240 Z" />
          </svg>
        </div>
        <!-- 水面倒影：同一份山的镜像渐隐，「水」由倒影成立，零新增元素 -->
        <div class="bk-refl">
          <svg class="bk-range" viewBox="0 0 1440 240" preserveAspectRatio="none">
            <path class="bk-layer bk-refl-fill bk-far" fill="url(#lgBkFar)" d="M0,148 C70,134 130,142 200,120 C268,99 310,128 380,114 C446,101 484,64 556,74 C622,83 660,118 736,108 C812,98 842,56 918,64 C992,72 1030,106 1102,96 C1166,88 1224,118 1296,104 C1348,94 1398,110 1440,100 L1440,240 L0,240 Z" />
            <path class="bk-layer bk-refl-fill bk-mid" fill="url(#lgBkMid)" d="M0,188 C64,172 104,180 166,154 C228,128 272,160 342,146 C412,132 452,96 522,106 C592,116 630,152 708,140 C786,128 828,94 898,102 C968,110 1008,148 1086,136 C1156,126 1198,146 1268,136 C1326,128 1384,146 1440,138 L1440,240 L0,240 Z" />
            <path class="bk-layer bk-refl-fill bk-near" fill="url(#lgBkNear)" d="M0,212 C86,198 148,206 228,188 C308,170 366,196 454,184 C542,172 596,148 686,158 C776,168 830,194 926,182 C1022,170 1076,150 1168,162 C1260,174 1330,190 1440,178 L1440,240 L0,240 Z" />
          </svg>
        </div>
      </div>
    </div>

    <AboutPopover :open="aboutOpen" @close="aboutOpen = false" />
  </div>
</template>

<style>
/* 全局工具类（原型全局 .num，非 scoped 供悬浮窗等共用） */
.num { font-family: var(--f-d); font-variant-numeric: tabular-nums; line-height: 1.25; }

/* 装裱纸式三选（根节点 class 施加；原型 body.mount-* 的桌面化口径） */
.mount-grid .card {
  background-image: linear-gradient(rgba(var(--ink-rgb), .033) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--ink-rgb), .033) 1px, transparent 1px);
  background-size: 22px 22px;
}
.mount-indigo .card { background-color: color-mix(in srgb, var(--card) 94%, var(--hq)); }
</style>

<style scoped>
/* ===== 卷面骨架：826 终验整改——天地杆退役（用户：深色长条与左上角割裂太厉害），页面一张纸到底 ===== */
.stage {
  position: relative;
  display: grid; grid-template-columns: minmax(0, 1fr);
  height: 100vh; overflow: hidden; min-width: 0;
}

.scroll {
  position: relative; z-index: 1;
  display: grid; grid-template-rows: auto 1fr auto; gap: var(--gap);
  padding: 16px 32px 12px; min-width: 0; overflow-y: auto;
}

/* 滚动条纸墨化：细身、墨色指、无轨道（去系统默认丑滚动条） */
.scroll::-webkit-scrollbar { width: 8px; }
.scroll::-webkit-scrollbar-track { background: transparent; }
.scroll::-webkit-scrollbar-thumb {
  background: rgba(var(--ink-rgb), .22); border-radius: 4px;
  transition: background var(--dur-fast);
}
.scroll::-webkit-scrollbar-thumb:hover { background: rgba(var(--ink-rgb), .4); }

/* ===== 题签（顶带） ===== */
.masthead { display: flex; align-items: center; gap: var(--gap); flex-wrap: wrap; min-width: 0; }
.title-block { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.title-block h1 { font-family: var(--f-d); font-size: 27px; font-weight: 700; letter-spacing: .06em; color: var(--ink); margin: 0; line-height: 1.25; }
.title-block .date { font-size: 13px; color: var(--ink3); }
.title-block .artist { font-size: 13px; color: var(--ink2); font-weight: 500; }
.title-block .sep { width: 1px; height: 14px; background: var(--line2); align-self: center; }
.glance { flex: 1; min-width: 180px; font-size: 13.5px; color: var(--ink2); margin: 0; }
.glance b { color: var(--zs-d); font-weight: 600; }
.glance .ok { color: var(--ink); }

/* 显隐开关（快捷签） */
.toggles { display: flex; align-items: center; gap: 6px; }
.toggles .lbl { font-size: 12px; color: var(--ink4); margin-right: 2px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  font-size: 12px; color: var(--ink2); background: var(--card);
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--hq); transition: background var(--dur-fast); }
.chip[aria-pressed="false"] { color: var(--ink4); border-style: dashed; background: transparent; }
.chip[aria-pressed="false"]::before { background: transparent; box-shadow: inset 0 0 0 1.5px var(--ink4); }
.chip:hover { color: var(--ink); }

.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* ===== 卷心 ===== */
.body {
  display: grid; grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr);
  gap: calc(var(--gap) * 1.5); min-width: 0; align-items: stretch;
}
.body--solo { grid-template-columns: 1fr; }
.flow { min-width: 0; display: flex; flex-direction: column; }

/* 题跋 aside：侧景（经营 + 留言）；旧山+亭装饰已退役，远山沉入页底幕布（见 .backdrop） */
.aside { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
.card {
  background: var(--card); border-radius: var(--r-paper);
  box-shadow: 0 0 0 1px rgba(var(--ink-rgb), .05), 0 1px 2px rgba(var(--ink-rgb), .06), 0 12px 26px -18px rgba(var(--ink-rgb), .4);
  padding: 14px 16px; position: relative; z-index: 1;
  display: flex; flex-direction: column; min-width: 0;
  transition: box-shadow var(--dur-fast) var(--ease-out);
}
.card:hover { box-shadow: 0 0 0 1px rgba(var(--ink-rgb), .10), 0 1px 2px rgba(var(--ink-rgb), .08), 0 12px 26px -18px rgba(var(--ink-rgb), .45); }
.msgs { flex: 1; }

/* ===== 卷尾 ===== */
.tail-bar {
  display: flex; align-items: center; gap: var(--gap); flex-wrap: wrap; min-width: 0;
  padding-top: 12px; border-top: 1px solid rgba(var(--ink-rgb), .10);
}

/* ===== 远山为幕（移植自网页登录页 LoginBackdrop）：低饱和远山天际线 + 水面倒影 ===== */
/* 826 终验再调：山底（水面线）与卷尾分割线对齐——整组下沉 40px，倒影大半裁出画面 */
.backdrop { position: absolute; left: 0; right: 0; bottom: -40px; z-index: 0; pointer-events: none; }
.bk-mountains {
  /* 山墨阶：远淡近浓三档，倒影略浓一档；不新增颜色，只用 --ink 混透明度 */
  --bk-far-c: color-mix(in srgb, var(--ink) 7%, transparent);
  --bk-mid-c: color-mix(in srgb, var(--ink) 12%, transparent);
  --bk-near-c: color-mix(in srgb, var(--ink) 18%, transparent);
  --bk-refl-far-c: color-mix(in srgb, var(--ink) 9%, transparent);
  --bk-refl-mid-c: color-mix(in srgb, var(--ink) 14%, transparent);
  --bk-refl-near-c: color-mix(in srgb, var(--ink) 20%, transparent);
  height: 22vh; min-height: 110px;
  display: flex; flex-direction: column;
}
.bk-up {
  height: 65%;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 55%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 55%);
}
.bk-up svg { display: block; }
.bk-range { width: 100%; height: 100%; }
/* 倒影：镜像翻转 + 向下渐隐（水感不抓戏） */
.bk-refl {
  position: relative; height: 35%; overflow: hidden; opacity: 0.45;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 85%);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 85%);
}
/* 山:倒影 ≈ 65:35，倒影 svg 高 186% 翻绕水线，让山形轮廓落进可见窗 */
.bk-refl svg {
  position: absolute; left: 0; top: 186%; width: 100%; height: 186%;
  transform: scaleY(-1); transform-origin: top;
}
/* 倒影用实色不走透明度：翻转后渐变方向反了会堆成亮带（登录页实测坑） */
#lgBkFar stop { stop-color: var(--bk-far-c); }
#lgBkMid stop { stop-color: var(--bk-mid-c); }
#lgBkNear stop { stop-color: var(--bk-near-c); }
.bk-refl-fill.bk-far { fill: var(--bk-refl-far-c); }
.bk-refl-fill.bk-mid { fill: var(--bk-refl-mid-c); }
.bk-refl-fill.bk-near { fill: var(--bk-refl-near-c); }
/* 入场水墨洇染：一次性，演完即静；reduced-motion 由页尾全局媒体查询关掉 */
@keyframes bk-ink-in {
  from { opacity: 0; filter: blur(8px); transform: translateY(10px); }
  to { opacity: 1; filter: blur(0); transform: translateY(0); }
}
.bk-far { animation: bk-ink-in 0.9s var(--ease-out) 0.1s backwards; }
.bk-mid { animation: bk-ink-in 0.9s var(--ease-out) 0.22s backwards; }
.bk-near { animation: bk-ink-in 0.9s var(--ease-out) 0.34s backwards; }

/* ===== 视口纪律：1200×600 一屏（长卷区内部滚动）；窄窗塌单列 ===== */
@media (max-width: 1020px) {
  .scroll { padding: 16px 18px 14px; }
  .body { grid-template-columns: 1fr; }
}
@media (max-height: 680px) {
  .stage { --gap: 12px; --row: 48px; }
  .scroll { padding: 10px 22px 8px; }
  .title-block h1 { font-size: 23px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
</style>
