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
 * - 参考图列表（issue #82）：只存 name + 服务端存储路径，⛔ 不存签名 url；恢复时重建 el-upload 条目
 */
import { computed, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { PublicArtStyle, PublicStyleAddon } from '../api/types'
import { MAX_IMAGE_COUNT } from '../constants/upload'
import type { RefFileItem } from '../views/client/order-form/types'

/** 参考图存储路径前缀（服务端 references/ 下；落盘与恢复只认这个前缀） */
const REF_STORAGE_PREFIX = 'references/'

/** sessionStorage 草稿里的参考图条目：只留展示名 + 服务端路径 */
interface OrderFormDraftRefFile {
  name: string
  filePath: string
}

/** 能进草稿的参考图条目（filePath 已收窄为非空字符串，提交只认它） */
type DraftRefFile = RefFileItem & { filePath: string }

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
  /** issue #82：参考图列表（旧草稿无此字段 = 空列表；url 一律不落盘） */
  refFiles?: OrderFormDraftRefFile[]
}

/**
 * 草稿单元要读写的表单状态——全部由 useOrderForm 持有并传入（引用语义，勿复制）
 */
export interface OrderFormDraftState {
  /** 表单文本/通知字段（reactive 代理；只取草稿关心的四项） */
  form: { description: string; clientQq: string; clientName: string; notifyEnabled: boolean }
  /** 参考图条目（el-upload v-model:file-list 的同一数组，引用语义——不复制、不另建） */
  refFileList: Ref<RefFileItem[]>
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
    // issue #82：只传了参考图、一个字没写也算内容——否则刷新后草稿被「无内容即删键」清掉，
    // 而图其实还在服务端 references/ 下（重建条目只需路径）。在途/失败条目没有 filePath，不算。
    || state.refFileList.value.some(isDraftableRef)
  )

  /**
   * 参考图条目能不能进草稿：必须有服务端存储路径与非空文件名。
   * 在途（status=uploading，尚无 filePath）、上传失败、被凭证换新清空的条目一律不存——
   * 恢复出来既是裂图也无从提交（提交只认 filePath）。
   */
  function isDraftableRef(item: RefFileItem): item is DraftRefFile {
    return typeof item.filePath === 'string'
      && item.filePath.startsWith(REF_STORAGE_PREFIX)
      && typeof item.name === 'string'
      && item.name.trim().length > 0
  }

  /** 落盘用的参考图快照（name + filePath，顺序即展示/提交顺序） */
  function collectDraftRefFiles(): OrderFormDraftRefFile[] {
    return state.refFileList.value
      .filter(isDraftableRef)
      // 上限与参考图表单上限同源：MAX_IMAGE_COUNT = 5（web/src/constants/upload.ts。
      // 施工书写的 9 是早期估值，以代码为准）。超出部分本就不该存在，这里只做防御性截断。
      .slice(0, MAX_IMAGE_COUNT)
      .map(item => ({ name: item.name, filePath: item.filePath }))
  }

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
        },
        // issue #82: 参考图列表（⛔ 不存 url——签名 URL 只有 5 分钟有效期，恢复出来必是裂图）
        refFiles: collectDraftRefFiles()
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
  // issue #82: 参考图列表变化也要落盘——点选回填 filePath、粘贴 push、EP 整组换数组都会触发
  watch(state.refFileList, scheduleDraftSave, { deep: true })

  /**
   * 草稿里单条参考图是否可信：非空文件名 + references/ 前缀的字符串路径。
   * 其余（缺 name / 路径前缀不符 / 非字符串 / 条目根本不是对象）静默丢弃——
   * 被篡改或旧版本残留的条目宁可少一张图，也不能把垃圾推进上传列表。
   */
  function isDraftRefRecord(entry: unknown): entry is OrderFormDraftRefFile {
    if (!entry || typeof entry !== 'object') return false
    const rec = entry as { name?: unknown; filePath?: unknown }
    return typeof rec.name === 'string'
      && rec.name.trim().length > 0
      && typeof rec.filePath === 'string'
      && rec.filePath.startsWith(REF_STORAGE_PREFIX)
  }

  /**
   * 恢复参考图列表（issue #82）：重建 el-upload 能直接消化的条目形状——
   * name + status:'success' 决定卡片状态，uid 由下标派生（同一批内唯一、重建结果稳定，EP 用 uid 做 key）。
   * ⛔ 不恢复 url：签名 URL 只有 5 分钟有效期（server/src/shared/file-sign.ts:12），
   * 恢复出来必是裂图；上限判定（数组长度）与提交（filePath）都不读 url。
   * 缩略图由调用方拿返回的路径去现签（utils/anonUpload.signReferenceUrlsWithAnonToken）——
   * 本模块保持纯本地、不发请求，便于单测与复用。
   * @returns 本次恢复出来的 filePath（顺序即展示/提交顺序），没有则空数组
   */
  function restoreDraftRefFiles(raw: unknown): string[] {
    const list: unknown[] = Array.isArray(raw) ? raw : []
    const restored: RefFileItem[] = []
    for (const entry of list) {
      if (!isDraftRefRecord(entry)) continue
      restored.push({
        name: entry.name,
        uid: `draft-${restored.length}`,
        status: 'success',
        url: null,
        filePath: entry.filePath
      })
    }
    // 追加入现有列表（恢复弹窗期间用户可能已贴了新图，不能整组替换把新图抹掉）；
    // 草稿内相对顺序即提交 references 的顺序，追加不改变它
    if (!restored.length) return []
    state.refFileList.value.push(...restored)
    return restored.flatMap(item => (item.filePath ? [item.filePath] : []))
  }

  /**
   * 恢复草稿（styles 加载后调用）
   * 画风/尺寸/增项若已被画师删除或尺寸转展示态则逐项丢弃。
   * 旧版本草稿（含 tierId 等字段）静默忽略过时字段。
   * @returns 恢复出来的参考图路径（供调用方现签缩略图），无参考图则空数组
   */
  function restoreDraft(draft: OrderFormDraft): string[] {
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

    // ── 参考图列表（issue #82）：只重建条目，不碰签名 url（url 由调用方现签） ──
    return restoreDraftRefFiles(draft.refFiles)
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

  /** issue #53-2: 卸载前把节流窗口内最后一笔同步落盘。只在确有内容时写——
   * saveDraft 的既有语义是「无内容即删键」，卸载路径拿它去覆盖会把上一轮存着的草稿抹掉 */
  function flushDraft() {
    clearDraftTimers()
    if (hasDraftContent.value) saveDraft()
  }

  return {
    hasDraftContent, restoreDraft, loadStoredDraft, discardDraft, onBeforeUnload, clearDraftTimers, flushDraft
  }
}
