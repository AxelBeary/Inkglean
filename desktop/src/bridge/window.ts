// 壳层窗口桥（方向 A 落码批契约件，主代理钉死，子代理只读消费）
// 窗口所有权：系统标题栏退役（decorations:false），最小化/最大化/关闭走自定义命令；
// 撕悬浮三件 = 板块实例的独立窗口投影（框架行为），由壳层按 kind 创建/销毁。
// 逃生门纪律与既有 bridge 同款：纯浏览器环境抛 BridgeUnavailableError。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'
import type { TearableId } from '../panels/contract'

function requireDesktop(capability: string): void {
  if (!isDesktop()) throw new BridgeUnavailableError(capability)
}

/** 主窗口最小化（自绘标题栏按钮） */
export async function minimizeWindow(): Promise<void> {
  requireDesktop('minimizeWindow')
  await invoke('desktop_window_minimize')
}

/** 主窗口最大化/还原切换，返回切换后是否处于最大化（供按钮图标换态） */
export async function toggleMaximizeWindow(): Promise<boolean> {
  requireDesktop('toggleMaximizeWindow')
  return await invoke<boolean>('desktop_window_toggle_maximize')
}

/** 关闭主窗口（关闭行为偏好由前端壳层判断后决定调本函数与否） */
export async function closeWindow(): Promise<void> {
  requireDesktop('closeWindow')
  await invoke('desktop_window_close')
}

/** 撕出悬浮窗（计时器/今日待办/截稿倒计时三件之一）；已存在则聚焦不重建 */
export async function openFloatingWindow(kind: TearableId): Promise<void> {
  requireDesktop('openFloatingWindow')
  await invoke('desktop_floating_open', { kind })
}

/** 贴回：关闭对应悬浮窗 */
export async function closeFloatingWindow(kind: TearableId): Promise<void> {
  requireDesktop('closeFloatingWindow')
  await invoke('desktop_floating_close', { kind })
}

/** 开机自启开关（静默到托盘为二期；本批只保证自启生效） */
export async function setAutostart(enabled: boolean): Promise<void> {
  requireDesktop('setAutostart')
  await invoke('desktop_autostart_set', { enabled })
}

/** 读开机自启当前状态（菜单回显用） */
export async function getAutostart(): Promise<boolean> {
  requireDesktop('getAutostart')
  return await invoke<boolean>('desktop_autostart_get')
}

// ─── 关闭行为偏好（壳层商业化批：托盘常驻后「最小化到托盘」激活） ───
// 偏好存 localStorage（布局偏好只存本地同款口径）；壳层拦截在 Rust 侧做，
// 前端负责启动同步与菜单变更后同步（App.vue / InkPenMenu 两处共用）。

export const CLOSE_PREF_KEY = 'shihui-desktop-close-behavior-v1'
export type CloseBehavior = 'quit' | 'tray'

/** 读关闭行为偏好；坏值/读失败归一为 quit（退出为安全默认） */
export function readCloseBehaviorPref(): CloseBehavior {
  try {
    return localStorage.getItem(CLOSE_PREF_KEY) === 'tray' ? 'tray' : 'quit'
  } catch {
    return 'quit'
  }
}

/** 落盘关闭行为偏好（菜单点选时调） */
export function writeCloseBehaviorPref(behavior: CloseBehavior): void {
  try {
    localStorage.setItem(CLOSE_PREF_KEY, behavior)
  } catch {
    /* 偏好非关键路径 */
  }
}

/** 同步关闭行为偏好到壳层（Rust 侧 on_window_event 拦截 Alt+F4 等全部关窗路径） */
export async function setCloseBehavior(behavior: CloseBehavior): Promise<void> {
  requireDesktop('setCloseBehavior')
  await invoke('desktop_close_behavior_set', { behavior })
}
