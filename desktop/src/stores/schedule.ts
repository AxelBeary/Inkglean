// 排期数据 store（9/4 主页重设计落码波1 · 契约层）：首页卷心月历、卷尾摘要签、独立排期页三处共用一份数据，
// 页面来回切不重复取数（load 去重），重载按钮走 load(true)。
// 双模式纪律：本地模式一个云端接口都不调；**模式一切换旧数据立即作废**（登录/切出走 SPA 路由跳转、
// 首页不重挂载，靠 onMounted 兜不住——实测过：切出后卷心月历与摘要签会继续显示云端客户名，一页两套真相）。
// 降级纪律（与既有 store 同款）：坏数据/桥不可用/请求失败一律静默落态，永不抛错拖垮页面。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { fetchBufferQueue, fetchProfile, fetchQueue } from '../api/artist'
import type { ArtistProfile } from '../api/types'
import { computeCanAccept } from '../schedule/accept'
import { buildSchedStrip } from '../schedule/strip'
import type { StripDay } from '../schedule/strip'
import { fromLocalOrders, fromQueueRows } from '../schedule/types'
import type { SchedOrder } from '../schedule/types'
import { useAuthStore } from './auth'
import { useLocalLedgerStore } from './localLedger'

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

  /** 取数。force=false 且同模式已加载过 → 立即返回（页面来回切不重复拉） */
  async function load(force = false): Promise<void> {
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
    load
  }
})
