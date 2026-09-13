// v76 W3 主页内容级下架/恢复：两步确认链（T-08 巨型文件防线自 views/admin/ArtistManage.vue 抽出）
// 口径与封禁/解封逐字一致：填可选原因 → 调接口 → 成功提示并刷新列表；
// 遇 STEP_UP_REQUIRED 把重试动作交回父页排队（pendingStepUpAction + StepUpDialog），验证通过后自动重提交。
// 行级 loading 与列表加载仍由父页持有，本件只借用其引用，不新增任何状态。
import { type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { complianceApi, type ApiError } from '../api/index'
import { i18n } from '../i18n'
import type { AdminArtistItem } from '../api/types'

// 取键口径与 api/modules/http.ts 一致（全局实例，legacy: false 下与组件内 useI18n 同义）
const tr = (key: string): string => i18n.global.t(key)

/** 可选原因输入（与举报管理页同款 prompt；取消=中止，空值=不带原因直接操作） */
export async function askOptionalReason(title: string, message: string) {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputPlaceholder: tr('compliance.admin.reasonPlaceholder'),
      inputValidator: () => true,
      confirmButtonText: tr('common.confirm'),
      cancelButtonText: tr('common.cancel'),
      inputValue: ''
    })
    return { cancelled: false, reason: (value || '').trim() || null }
  } catch {
    return { cancelled: true, reason: null }
  }
}

interface HomeTakedownDeps {
  /** 行级 loading（与封禁/解封共用同一 ref，互斥语义不变） */
  updatingId: Ref<number | null>
  /** 成功后的列表重新加载 */
  reload: () => unknown
  /** 把被 STEP_UP_REQUIRED 拦下的动作交回父页排队并弹再验证框 */
  requestStepUp: (retry: () => void) => void
}

/** 下架 / 恢复两条链的差异面（文案键 + 接口方法）；流程逻辑共用同一条 run */
const ACTIONS = {
  takedown: {
    label: 'compliance.admin.homeTakedown',
    confirm: 'compliance.admin.homeTakedownConfirm',
    toast: 'compliance.admin.homeTakedownToast',
    call: (id: number, reason: string | null) => complianceApi.homeTakedown(id, reason)
  },
  restore: {
    label: 'compliance.admin.homeRestore',
    confirm: 'compliance.admin.homeRestoreConfirm',
    toast: 'compliance.admin.homeRestoreToast',
    call: (id: number, reason: string | null) => complianceApi.homeRestore(id, reason)
  }
} as const

export function useHomeTakedown(deps: HomeTakedownDeps) {
  const { updatingId, reload, requestStepUp } = deps

  /** 提交（遇 STEP_UP_REQUIRED → 排队重试并保持行级 loading；其余错误提示并解锁） */
  async function submit(kind: keyof typeof ACTIONS, artistId: number, reason: string | null) {
    const action = ACTIONS[kind]
    try {
      await action.call(artistId, reason)
      ElMessage.success(tr(action.toast))
      await reload()
      updatingId.value = null
    } catch (err) {
      if ((err as ApiError)?.code === 'STEP_UP_REQUIRED') {
        requestStepUp(() => { void submit(kind, artistId, reason) })
        return
      }
      ElMessage.error((err as Error).message)
      updatingId.value = null
    }
  }

  /** 两步确认：填原因 → 必要时再验证 → 调接口（下架与恢复共用一条链） */
  async function run(kind: keyof typeof ACTIONS, row: AdminArtistItem) {
    if (updatingId.value != null) return
    updatingId.value = row.id
    const action = ACTIONS[kind]
    const { cancelled, reason } = await askOptionalReason(tr(action.label), tr(action.confirm))
    if (!cancelled) {
      await submit(kind, Number(row.id), reason)
      return
    }
    updatingId.value = null
  }

  return {
    homeTakedown: (row: AdminArtistItem) => run('takedown', row),
    homeRestore: (row: AdminArtistItem) => run('restore', row)
  }
}
