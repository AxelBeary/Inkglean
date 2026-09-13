// 排期数据 store（9/4 主页重设计落码波1 · 契约层）：首页卷心月历、卷尾摘要签、独立排期页三处共用一份数据，
// 页面来回切不重复取数（load 去重），重载按钮走 load(true)。
// 波2（9/13 批）加写路径：列表拖排 + 时间条拖拽改期（**只给云端**；本地记账无开工日、无队列序，写不了）。
// 写路径只回**语义结果**（ok / conflict / sessionExpired / clamped），对画师说的话全在页面层拼
// （与「板块只呈现」同款纪律：store 不装文案，哨兵测试才钉得住口径）。
// 双模式纪律：本地模式一个云端接口都不调；**模式一切换旧数据立即作废**（登录/切出走 SPA 路由跳转、
// 首页不重挂载，靠 onMounted 兜不住——实测过：切出后卷心月历与摘要签会继续显示云端客户名，一页两套真相）。
// 降级纪律（与既有 store 同款）：坏数据/桥不可用/请求失败一律静默落态，永不抛错拖垮页面。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { fetchBufferQueue, fetchProfile, fetchQueue, reorderQueue, updateDeadline, updateStartDate } from '../api/artist'
import { apiErrorMessage, isOrderConflict, isSessionExpired } from '../api/errors'
import type { ArtistProfile, OrderWriteResult } from '../api/types'
import { computeCanAccept } from '../schedule/accept'
import { canDragBar, planDragRange, planWrites } from '../schedule/drag'
import type { DragEdge, WriteStep } from '../schedule/drag'
import { buildSchedStrip } from '../schedule/strip'
import type { StripDay } from '../schedule/strip'
import { fromLocalOrders, fromQueueRows } from '../schedule/types'
import type { SchedOrder } from '../schedule/types'
import { useAuthStore } from './auth'
import { useLocalLedgerStore } from './localLedger'

/** 一次拖拽改期的前像（软撤销用）。一次性：新写或重拉一律作废它，不给“撤销到远古”的假按钮。 */
export interface ScheduleUndoSnapshot {
  orderId: number
  edge: DragEdge
  oldStartDate: string
  oldDeadline: string
  newStartDate: string
  newDeadline: string
  /** 写成功后服务端返回的新 version：撤销写得以它为起点，否则必吃 409 */
  newVersion: number
}

/** 写结果（只含语义，不含文案） */
export interface ScheduleWriteResult {
  ok: boolean
  /** 根本没发请求：非云端态 / 终态单 / 缺日期 / 入参不是整段正式区 / 已被更新的操作取代 */
  skipped?: boolean
  /** 409 乐观锁冲突：已按服务端真相重拉，本地不留假象 */
  conflict?: boolean
  /** 401/403 会话失效：只报告，不自动跳登录页 */
  sessionExpired?: boolean
  /** 写请求已发出但**结果不确定**（响应没带回新版本号，不猜）：store 已重拉刷新，页面必须说真话 */
  refreshed?: boolean
  /** 被「开工日不得拖进过去」钳住过（页面据此说真话，不让画师以为真拖到了） */
  clamped?: boolean
  /** 服务端原话（后端 error 字段）：非冲突类失败才带，页面拼成自己的一句人话 */
  serverMessage?: string
  undo?: ScheduleUndoSnapshot
}

export const useScheduleStore = defineStore('desktop-schedule', () => {
  const auth = useAuthStore()
  const ledger = useLocalLedgerStore()

  /** 云端取回的队列行（本地模式恒空，见 orders） */
  const cloudOrders = ref<SchedOrder[]>([])
  const profile = ref<ArtistProfile | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const loaded = ref(false)
  /** 上次取数时的模式：与当前模式不符即视为未加载（防串台） */
  const loadedMode = ref<'cloud' | 'local' | null>(null)

  const mode = computed<'cloud' | 'local'>(() => auth.mode)
  const cloud = computed(() => mode.value === 'cloud')

  /** 排期行：云端＝取回的队列；本地＝**实时**派生自记账 store。
   *  刻意不做快照：快照会造成同页两套新鲜度（画师记一笔后概览句/今日要办立刻变、月历与摘要签纹丝不动）。 */
  const orders = computed<SchedOrder[]>(() =>
    cloud.value ? cloudOrders.value : fromLocalOrders(ledger.orders)
  )

  /** 本机账本读不到（纯浏览器/DB 打开失败）：与「还没记账」是两回事，页面必须分开说，
   *  否则把「账本打不开」讲成「你还没记一笔」，画师可能重复记账 */
  const localUnavailable = computed(() => !cloud.value && ledger.unavailable)

  /** 在途计数（已完成不计入名额占用，与网页端用队列长度同口径） */
  const formalCount = computed(() => orders.value.filter(o => o.zone === 'formal' && !o.done).length)
  const bufferCount = computed(() => orders.value.filter(o => o.zone === 'buffer' && !o.done).length)

  /** 能否接单：本地模式恒 false（记账无名额席位概念 → 不标可接单绿点，拍板②） */
  const canAccept = computed(() => {
    if (!cloud.value) return false
    return computeCanAccept({
      status: profile.value?.status ?? null,
      batchLimit: profile.value?.batch_limit,
      bufferLimit: profile.value?.buffer_limit,
      quotaRemaining: profile.value?.quotaInfo?.remaining,
      formalCount: formalCount.value,
      bufferCount: bufferCount.value
    })
  })

  /** 名额文案（云端 slotDisplay；本地空串——宿主据此决定该行渲不渲染，不留死文案） */
  const slotText = computed(() => (cloud.value ? profile.value?.slotDisplay ?? '' : ''))

  /** 时间条可用性：本地 false（记账无开工日 → 整块缺席，页签都不显示，拍板②） */
  const timelineAvailable = computed(() => cloud.value)

  /** 卷尾「排期 · 近 7 天」摘要签（第三参＝名额语义是否适用，本地空日走素条不涂藤黄） */
  const stripDays = computed<StripDay[]>(() => buildSchedStrip(orders.value, canAccept.value, cloud.value))

  /** 取数。force=false 且同模式已加载过 → 立即返回（页面来回切不重复拉）。
   *  首行必须作废在途写（照网页端 M-8 修复口径：load 也递增写号）——重拉带回来的才是服务端真相，
   *  比它早发的写响应一律不得再回写本地（否则旧响应会把新排序/新日期盖回去）。 */
  async function load(force = false): Promise<void> {
    writeSeq++
    if (loading.value) return
    if (!cloud.value) {
      // 本地模式：orders 由 computed 实时派生，这里只保证账本已读上来；一个云端接口都不调
      // force（标题栏重载 / 失败态重试）时即便账本已读过也再读一次，否则「重试」是死按钮（纪律4）
      if (!ledger.loaded || force) await ledger.loadAll()
      failed.value = ledger.unavailable
      loaded.value = true
      loadedMode.value = 'local'
      return
    }
    if (loaded.value && loadedMode.value === 'cloud' && !force) return
    loading.value = true
    try {
      const [f, b, p] = await Promise.allSettled([fetchQueue(), fetchBufferQueue(), fetchProfile()])
      if (f.status === 'fulfilled' && b.status === 'fulfilled') {
        cloudOrders.value = fromQueueRows(f.value, b.value)
        failed.value = false
        loaded.value = true
        loadedMode.value = 'cloud'
      } else {
        // 队列拉失败：置失败态但**保留旧数据**（断网重拉失败不该把已显示的排期抹成空白）
        failed.value = true
      }
      // profile 失败不牵连排期（canAccept 落保守 true，绿点照显不误伤）
      if (p.status === 'fulfilled') profile.value = p.value
    } finally {
      loading.value = false
    }
  }

  // ─── 波2 写路径（拖拽改期 / 列表拖排）────────────────────────────
  /** 单一在途序号域：任何一次写与任何一次 load 都先取号，响应回来时号不是最新的一律静默丢弃。
   *  为什么两条链路共用一个号：后端 reorder 会把参与行的 version 全部 +1
   *  （server/tests/version-chain.test.ts:38 锁死），于是「刚拖完排、在途的改期请求」必吃 409
   *  （同文件 :88 同义）。两条链路各留一套号防不住这种跨链路互踩。 */
  let writeSeq = 0
  /** 有写在途：页面据此禁拖，不给「拖了没反应」的假手感 */
  const writing = ref(false)

  /** 正式区 id 序列（拖排入参必须就是它按新序排一遍） */
  const formalIds = computed<number[]>(() =>
    cloudOrders.value.filter(o => o.zone === 'formal').map(o => o.id)
  )
  /** 列表拖排可用：云端 + 无在途写 + 至少两行（一行没什么可拖） */
  const canWriteList = computed(() => cloud.value && !writing.value && formalIds.value.length > 1)
  /** 横条改期可用：云端 + 无在途写（单行能不能拖另由 canDragBar 定） */
  const canWriteTimeline = computed(() => cloud.value && !writing.value)

  /** 失败三分类（只出语义不出文案）：除会话失效外一律重拉，本地不许留着改了一半的假象 */
  async function failWrite(err: unknown, mySeq: number): Promise<ScheduleWriteResult> {
    if (mySeq !== writeSeq) return { ok: false, skipped: true } // 已被更新的操作取代：静默
    if (isSessionExpired(err)) return { ok: false, sessionExpired: true } // 不自动跳登录页
    if (isOrderConflict(err)) {
      await load(true)
      return { ok: false, conflict: true }
    }
    const serverMessage = apiErrorMessage(err, '')
    await load(true)
    return { ok: false, serverMessage }
  }

  /** 逐步执行写计划：每步都带上一步返回的新 version 接力（不传＝后端走“读当前版本再写”
   *  兼容路径，会覆盖别人的改动）。拿不到 version 时**不猜**，直接重拉：猜错必吃 409，
   *  且现场更难解释。抛错由调用方接（failWrite）。 */
  async function runSteps(
    orderId: number,
    steps: WriteStep[],
    startVersion: number | undefined
  ): Promise<number | null> {
    let version = startVersion
    for (const s of steps) {
      const res: OrderWriteResult = s.field === 'deadline'
        ? await updateDeadline(orderId, s.value, { version })
        : await updateStartDate(orderId, s.value, { version })
      if (typeof res?.version !== 'number') {
        await load(true)
        return null
      }
      version = res.version
    }
    return version ?? null
  }

  /** 拖时间条改期：edge 决定只改一端还是整条平移。成功后**不重拉**（本地行直接回写新值与新
   *  version，拖拽反馈要即时），失败才重拉——与网页端 useQueueTimeline 同口径。 */
  async function moveScheduleRange(
    orderId: number,
    edge: DragEdge,
    deltaDays: number,
    /** 锚点日（YYYY-MM-DD）：不传＝取本机今天。供测试与“按时间轴视窗算”的调用方固定钳制基准，
     *  否则跳零点/不同时区下同一份入参会写出不同日期（不可复现）。 */
    opts?: { today?: string }
  ): Promise<ScheduleWriteResult> {
    if (!cloud.value) return { ok: false, skipped: true }
    const row = cloudOrders.value.find(o => o.id === orderId)
    if (!row || !canDragBar(row) || !row.startDate || !row.deadline) return { ok: false, skipped: true }
    const before = { startDate: row.startDate, deadline: row.deadline }
    const plan = planDragRange({ ...before, edge, deltaDays, today: opts?.today })
    const steps = planWrites(before, { startDate: plan.startDate, deadline: plan.deadline })
    if (steps.length === 0) return { ok: false, skipped: true, clamped: plan.clampedDays > 0 }
    const mySeq = ++writeSeq
    writing.value = true
    try {
      const version = await runSteps(orderId, steps, row.version)
      // 没拿到新版本号：不猜（猜错必吃 409且现场更难解释），runSteps 已重拉，语义交页面说真话
      if (version === null) return { ok: false, refreshed: true }
      if (mySeq !== writeSeq) return { ok: false, skipped: true } // 已被更新的操作取代：不写本地
      const fresh = cloudOrders.value.find(o => o.id === orderId) ?? row
      fresh.startDate = plan.startDate
      fresh.deadline = plan.deadline
      fresh.version = version
      return {
        ok: true,
        clamped: plan.clampedDays > 0,
        undo: {
          orderId,
          edge,
          oldStartDate: before.startDate,
          oldDeadline: before.deadline,
          newStartDate: plan.startDate,
          newDeadline: plan.deadline,
          newVersion: version
        }
      }
    } catch (err) {
      return await failWrite(err, mySeq)
    } finally {
      writing.value = false
    }
  }

  /** 撤回一次改期：把旧值再两步写回去，带的是拖后拿到的新 version（带旧值必 409）。 */
  async function undoScheduleRange(snap: ScheduleUndoSnapshot): Promise<ScheduleWriteResult> {
    if (!cloud.value) return { ok: false, skipped: true }
    const steps = planWrites(
      { startDate: snap.newStartDate, deadline: snap.newDeadline },
      { startDate: snap.oldStartDate, deadline: snap.oldDeadline }
    )
    if (steps.length === 0) return { ok: false, skipped: true }
    const mySeq = ++writeSeq
    writing.value = true
    try {
      const version = await runSteps(snap.orderId, steps, snap.newVersion)
      if (version === null) return { ok: false, refreshed: true }
      if (mySeq !== writeSeq) return { ok: false, skipped: true }
      await load(true) // 撤销后以服务端真相为准（网页端 onTlUndo 同款）
      return { ok: true }
    } catch (err) {
      return await failWrite(err, mySeq)
    } finally {
      writing.value = false
    }
  }

  /** 列表拖排：整段正式区新顺序。不消费写响应，写完直接 load(true) 重拉——
   *  参与行 version 已全 +1，且要顺便让缓冲区与名额跟上（多一个 GET 换单一真相，值）。 */
  async function reorderFormal(orderedIds: number[]): Promise<ScheduleWriteResult> {
    if (!cloud.value) return { ok: false, skipped: true }
    const current = formalIds.value
    // 后端只认「整段正式区活跃单」：长度/重复/归属任一条不符就 400。宁可不写，不发半成品请求。
    if (orderedIds.length !== current.length) return { ok: false, skipped: true }
    if (new Set(orderedIds).size !== orderedIds.length) return { ok: false, skipped: true }
    const set = new Set(current)
    if (!orderedIds.every(id => set.has(id))) return { ok: false, skipped: true }
    const mySeq = ++writeSeq
    writing.value = true
    try {
      await reorderQueue(orderedIds)
      if (mySeq !== writeSeq) return { ok: false, skipped: true }
      await load(true)
      return { ok: true }
    } catch (err) {
      return await failWrite(err, mySeq)
    } finally {
      writing.value = false
    }
  }

  // 模式切换（登录进云端 / 切出回本地）即作废旧数据并重取：
  // 双模式完全分离是铁律，绝不让上一个模式的客户名留在下一个模式的月历上
  watch(mode, (m) => {
    if (loadedMode.value === m) return
    cloudOrders.value = []
    profile.value = null
    loaded.value = false
    failed.value = false
    loadedMode.value = null
    void load(true)
  })

  return {
    orders,
    profile,
    loading,
    failed,
    loaded,
    mode,
    localUnavailable,
    formalCount,
    bufferCount,
    canAccept,
    slotText,
    timelineAvailable,
    stripDays,
    load,
    // 波2 写路径
    writing,
    canWriteList,
    canWriteTimeline,
    formalIds,
    reorderFormal,
    moveScheduleRange,
    undoScheduleRange
  }
})
