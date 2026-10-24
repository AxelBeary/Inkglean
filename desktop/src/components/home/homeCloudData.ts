// 首页云端数据编排（方向 A 首页「案头长卷」；自 views/Home.vue 拆出，行为与拆分前一致）。
// 拆分动因：Home.vue 顶到巨型文件防阀 800 行硬上限（#34 逐页累积 + 在账数读 total 又把它推回去），
// 把内聚度最高的「云端统一取数 + 按节静默降级 + 截稿提醒链」一块独立成模块。
// 纪律照旧、一字未改：本地模式一律不调云端接口（§4.3 双模式纪律）；单节失败只红那一节，
// 不整页拖垮；留言待审首次只记基线不通知（防开机打扰）；截稿提醒每日按条目去重。
// 依赖方向：components/home → api / bridge / tools，不回指 views（视图反过来引它）。
import { ref } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  ArtistOrderItem,
  ArtistStatus,
  DeadlineSoonItem,
  GuestbookMessage,
  IncomeOverview,
  ScheduleBar,
  TodoItem
} from '../../api/types'
import type { RevenueResult } from '../../api/types'
import {
  fetchDeadlineSoon,
  fetchIncomeOverview,
  fetchMessages,
  fetchOrders,
  fetchProfile,
  fetchRevenue,
  fetchSchedule,
  fetchTodos
} from '../../api/artist'
import { isDesktop, notify } from '../../bridge'
import {
  buildDeadlineAlerts, loadAlertedIds, saveAlertedIds
} from '../../tools/deadlineAlert'
import type { DeadlineAlertItem } from '../../tools/deadlineAlert'

export function useHomeCloudData(cloud: ComputedRef<boolean>) {
  // ─── 云端数据（本页统一取数，失败按节静默） ───
  const schedule = ref<ScheduleBar[] | null>(null)
  const todos = ref<TodoItem[] | null>(null)
  const income = ref<IncomeOverview | null>(null)
  const revenue = ref<RevenueResult | null>(null)
  const messages = ref<GuestbookMessage[] | null>(null)
  const orders = ref<ArtistOrderItem[] | null>(null)
  // #22-4：托盘「在账数」读服务端口径 total，不再读已截断的首页长度
  const ordersTotal = ref(0)
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
    if (ord.status === 'fulfilled') {
      orders.value = ord.value.items
      ordersTotal.value = ord.value.total
    }
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

  return {
    schedule, todos, income, revenue, messages, orders, ordersTotal, deadlines,
    plaqueStatus, slotDisplay, todayFailed, opsFailed, msgsFailed, ordersFailed, lastRefresh,
    loadAll, checkDeadlineAlerts
  }
}
