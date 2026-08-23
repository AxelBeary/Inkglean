/**
 * 入驻首绑进度持久化 + 绑定失效提示旗标（824：防刷新与找回入口）
 *
 * 背景：邀请码入驻第 2 步（二维码页）被刷新会丢全部组件状态，画师卡死无找回路。
 * 本模块提供两类标签页会话级（sessionStorage）标记的安全读写：
 *   1. 首绑进行中状态（建号成功 → 绑定完成之间）：刷新后恢复到第 2 步重渲染二维码；
 *   2. TOTP_BIND_REQUIRED 提示旗标：401 拦截器跳登录页前写入，登录页消费一次即清。
 *
 * 存储禁用/隐私模式时静默降级（同 P3-10 纪律）：防刷新与跨跳转带文案功能失效，
 * 但登录/入驻主流程不受影响，任何读写都不向业务抛错。
 */
import { safeSessionGetItem, safeSessionSetItem, safeSessionRemoveItem } from './storage'
import { INVITE_TOTP_PROGRESS_KEY, TOTP_BIND_REQUIRED_NOTICE_KEY } from '../constants/auth'

/** 首绑进行中状态（建号成功即写入；仅存重渲染二维码所需的最小集） */
export interface InviteTotpProgress {
  qqNumber: string
  otpauthUri: string
}

/** 写入进行中状态（建号成功后调用） */
export function saveInviteTotpProgress(progress: InviteTotpProgress): void {
  safeSessionSetItem(INVITE_TOTP_PROGRESS_KEY, JSON.stringify(progress))
}

/** 读取进行中状态；缺失或数据损坏（坏 JSON/字段缺失/空串）一律返回 null，永不抛错 */
export function loadInviteTotpProgress(): InviteTotpProgress | null {
  const raw = safeSessionGetItem(INVITE_TOTP_PROGRESS_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { qqNumber, otpauthUri } = parsed as Partial<InviteTotpProgress>
    if (typeof qqNumber !== 'string' || typeof otpauthUri !== 'string') return null
    if (!qqNumber || !otpauthUri) return null
    return { qqNumber, otpauthUri }
  } catch {
    return null
  }
}

/** 清除进行中状态（找回成功 / 用户主动关闭叠加层 / 绑定流程完成） */
export function clearInviteTotpProgress(): void {
  safeSessionRemoveItem(INVITE_TOTP_PROGRESS_KEY)
}

/** 写入「绑定失效」提示旗标（api 拦截器在 401 TOTP_BIND_REQUIRED 跳登录页前调用） */
export function setTotpBindRequiredNotice(): void {
  safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
}

/** 消费提示旗标：存在则读取并立即清除（登录页展示后清除，防重复展示） */
export function takeTotpBindRequiredNotice(): boolean {
  const hit = safeSessionGetItem(TOTP_BIND_REQUIRED_NOTICE_KEY) === '1'
  if (hit) safeSessionRemoveItem(TOTP_BIND_REQUIRED_NOTICE_KEY)
  return hit
}

/** 仅清除残留旗标（登录页就地展示同一文案时用，避免下次挂载重复展示） */
export function clearTotpBindRequiredNotice(): void {
  safeSessionRemoveItem(TOTP_BIND_REQUIRED_NOTICE_KEY)
}
