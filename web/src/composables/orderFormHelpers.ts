/**
 * orderFormHelpers — 约稿表单「R57 表单防丢失」单元（自 useOrderForm 拆出，行为与拆分前一致）
 *
 * 拆分动因：useOrderForm 是约稿表单全部业务逻辑的核心，已顶到巨型文件防阀 800 行硬上限，
 * 故把内聚度最高的一块——sessionStorage 草稿（形状/落盘节流/恢复有效性过滤）+ 离开页面拦截——
 * 独立成模块。**纯结构搬移，不改任何判定与文案**。
 *
 * 状态所有权仍在 useOrderForm：本模块只接收它的 ref / reactive 代理（不复制、不新建），
 * 因此草稿读写与页面读写指向同一份数据。
 *
 * 覆盖能力：
 * - 草稿形状（OrderFormDraft）与「算不算有内容」判定（hasDraftContent）
 * - 500ms 节流自动落盘；sessionStorage 不可用（隐私模式等）静默
 * - 恢复时逐项有效性过滤：画风/尺寸/增项/用途/加急被删或尺寸转展示态即丢弃
 * - 损坏草稿静默丢弃；beforeunload 拦截与解除
 */
import { computed, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { PublicArtStyle, PublicStyleAddon } from '../api/types'

/** 普通增项选择状态记录（{ [styleAddonId]: { toggled, quantity } }） */
export interface AddonSelRecord {
  toggled: boolean
  quantity: number
  optionLabel?: string | undefined
}

/** sessionStorage 草稿形状（JSON.parse 产物，字段全部宽松） */
export interface OrderFormDraft {
  form?: { description?: unknown; clientQq?: unknown; clientName?: unknown; notifyEnabled?: unknown }
  styleState?: {
    styleId?: number | null
    sizeId?: number | null
    addonSelections?: Record<string, { toggled?: boolean; quantity?: number }>
    usageId?: number | null
    rushId?: number | null
  }
}

/**
 * 草稿单元要读写的表单状态——全部由 useOrderForm 持有并传入（引用语义，勿复制）
 */
export interface OrderFormDraftState {
  /** 表单文本/通知字段（reactive 代理；只取草稿关心的四项） */
  form: { description: string; clientQq: string; clientName: string; notifyEnabled: boolean }
  styles: Ref<PublicArtStyle[]>
  selectedStyleId: Ref<number | null>
  selectedSizeId: Ref<number | null>
  isMultiStyle: ComputedRef<boolean>
  regularAddons: ComputedRef<PublicStyleAddon[]>
  usageAddons: ComputedRef<PublicStyleAddon[]>
  rushAddons: ComputedRef<PublicStyleAddon[]>
  /** 普通增项勾选状态（reactive 代理） */
  styleAddonSelections: Record<string, AddonSelRecord>
  selectedUsageId: Ref<number | null>
  selectedRushId: Ref<number | null>
  /** v0.34 任务B：URL query 预选命中记录（reactive 代理；已预选项不被草稿覆盖） */
  queryPreselect: { styleId: number | null; sizeId: number | null }
  /** 补齐当前尺寸可用增项的默认值（模板 v-model 不接受 undefined） */
  initStyleAddonDefaults: () => void
  /** 300ms 防抖重算价格预览 */
  scheduleStyleCalc: () => void
}

export function useOrderFormDraft(subdomain: string, state: OrderFormDraftState) {
  const DRAFT_KEY = `orderForm_draft_${subdomain}`

  /** 表单是否有内容（任一字段非空）——决定 beforeunload 拦截与草稿保存 */
  const hasDraftContent = computed(() =>
    // 多画风下"用户主动选了画风"即算；单画风自动选中不算（否则刚进页面就拦截离开+弹恢复框）
    (state.isMultiStyle.value && state.selectedStyleId.value != null)
    || state.selectedSizeId.value != null
    || !!state.form.description.trim()
    || !!state.form.clientQq.trim()
    || !!state.form.clientName.trim()
    || state.selectedUsageId.value != null
    || state.selectedRushId.value != null
    || Object.values(state.styleAddonSelections).some(s => s && (s.toggled || s.quantity > 0))
  )

  function saveDraft() {
    if (!hasDraftContent.value) {
      sessionStorage.removeItem(DRAFT_KEY)
      return
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        form: {
          description: state.form.description,
          clientQq: state.form.clientQq,
          clientName: state.form.clientName,
          notifyEnabled: state.form.notifyEnabled
        },
        // SPEC-PRICE-2: 三步走状态（画风/尺寸/普通增项勾选/用途/加急）
        styleState: {
          styleId: state.selectedStyleId.value,
          sizeId: state.selectedSizeId.value,
          addonSelections: { ...state.styleAddonSelections },
          usageId: state.selectedUsageId.value,
          rushId: state.selectedRushId.value
        }
      }))
    } catch { /* Ignore when sessionStorage is unavailable (private mode, etc.) */ }
  }

  let draftTimer: number | null = null
  function scheduleDraftSave() {
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(saveDraft, 500)
  }

  watch(
    [() => state.form.description, () => state.form.clientQq, () => state.form.clientName, () => state.form.notifyEnabled],
    scheduleDraftSave
  )
  watch(state.selectedStyleId, scheduleDraftSave)
  watch(state.selectedSizeId, scheduleDraftSave)
  watch(state.styleAddonSelections, scheduleDraftSave, { deep: true })
  watch([state.selectedUsageId, state.selectedRushId], scheduleDraftSave)

  /**
   * 恢复草稿（styles 加载后调用）
   * 画风/尺寸/增项若已被画师删除或尺寸转展示态则逐项丢弃。
   * 旧版本草稿（含 tierId 等字段）静默忽略过时字段。
   */
  function restoreDraft(draft: OrderFormDraft) {
    const f = draft.form || {}
    const ss = draft.styleState || {}

    // v0.34 任务B：URL query 预选 > 草稿恢复——query 已预选的项不被草稿覆盖
    if (!state.queryPreselect.styleId && ss.styleId != null) {
      // 与单画风自动选中相同值时幂等（ref 等值赋值不触发 watcher）
      const style = state.styles.value.find(s => s.id === ss.styleId)
      if (style) state.selectedStyleId.value = ss.styleId
    }
    const currentStyle = state.styles.value.find(s => s.id === state.selectedStyleId.value)
    if (!state.queryPreselect.sizeId) {
      const size = currentStyle && ss.sizeId != null
        ? (currentStyle.sizes || []).find(sz => sz.id === ss.sizeId && sz.display_status !== 'showcase')
        : null
      if (size) state.selectedSizeId.value = ss.sizeId!
    }
    // a2 猎杀修复：增项/用途/加急恢复独立于尺寸恢复块——query 只预选画风+尺寸，
    // 增项不在预选范围，不该随尺寸块整体跳过（此前带 query 刷新后已填增项全部丢失）；
    // 按当前选中尺寸的可用增项过滤恢复（validIds/usageIds/rushIds 同原口径）
    if (state.selectedSizeId.value) {
      // 普通增项勾选只恢复当前尺寸可用普通增项中存在的键（其余可能已删/已隐藏）
      const validIds = new Set(state.regularAddons.value.map(a => a.id))
      const saved = ss.addonSelections || {}
      for (const key of Object.keys(saved)) {
        const id = Number(key)
        if (validIds.has(id)) {
          state.styleAddonSelections[id] = { toggled: false, quantity: 0, ...saved[key], optionLabel: undefined }
        }
      }
      // 补齐其余可用增项默认值（模板 v-model 不接受 undefined）
      state.initStyleAddonDefaults()
      // 用途/加急单选只恢复仍在可选项中的 ID
      const usageIds = new Set(state.usageAddons.value.map(a => a.id))
      const rushIds = new Set(state.rushAddons.value.map(a => a.id))
      state.selectedUsageId.value = typeof ss.usageId === 'number' && usageIds.has(ss.usageId) ? ss.usageId : null
      state.selectedRushId.value = typeof ss.rushId === 'number' && rushIds.has(ss.rushId) ? ss.rushId : null
    }
    // 尺寸有效 → 重算价格预览（防抖，多次触发合并为一次）
    if (state.selectedSizeId.value) state.scheduleStyleCalc()

    // ── 文本字段（a2 猎杀修复：形状校验——sessionStorage 被旧版本/篡改写入非字符串时不再致下游 .trim() 崩溃） ──
    state.form.description = typeof f.description === 'string' ? f.description : ''
    state.form.clientQq = typeof f.clientQq === 'string' ? f.clientQq : ''
    state.form.clientName = typeof f.clientName === 'string' ? f.clientName : ''
    // REQ-028 过渡期：本项灰置不可勾，旧草稿里存的 true 一律不再回填（原写法会把缺省当勾选）
    state.form.notifyEnabled = false
  }

  /** 读出并解析草稿（缺失或损坏 → null，调用方静默丢弃） */
  function loadStoredDraft(): OrderFormDraft | null {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return null
      return JSON.parse(raw) as OrderFormDraft
    } catch {
      /* 损坏的草稿直接丢弃 */
      return null
    }
  }

  /** 丢掉已存草稿键（提交成功 / 用户在恢复询问里选「丢弃」） */
  function discardDraft() {
    sessionStorage.removeItem(DRAFT_KEY)
  }

  /** beforeunload：表单有内容时拦截（浏览器原生确认弹窗） */
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!hasDraftContent.value) return
    e.preventDefault()
    e.returnValue = ''
  }

  /** 卸载时清掉待落盘的节流定时器（由 useOrderForm 的 onUnmounted 调用） */
  function clearDraftTimers() {
    if (draftTimer) clearTimeout(draftTimer)
  }

  return {
    hasDraftContent, restoreDraft, loadStoredDraft, discardDraft, onBeforeUnload, clearDraftTimers
  }
}
