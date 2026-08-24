import db from '../../db/connection.js'

// ============================================
// 桌面端记账式会话——设备账本（REQ-014 安全口径一 / 方案 A，v73）
// 一张账本记全部：登录=记账 / 踢人=撕账 / 顺延=改账 / 设备清单=同账。
// 账本是桌面会话存活与否的唯一权威：桌面 token 自身不做 t 基 TTL
// （签名只防伪造，过期/撕账全看本表；见 auth.service verifySession 桌面分支）。
// ============================================

/** 桌面会话基础有效期（天）——登录一次管三个月（REQ-014 拍板） */
export const DESKTOP_SESSION_DAYS = 90
/** 顺延阈值：距过期不足 7 天仍有活跃 → 顺延至 now+90 天（即「每周活跃即自动顺延」） */
const RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000
/** 活跃记账节流：last_active_at 至多每小时写一次（防每请求一写）；顺延不受节流约束 */
const TOUCH_THROTTLE_MS = 60 * 60 * 1000

/** 设备账本行（与 desktop_devices 表列一一对应） */
export interface DesktopDeviceRow {
  id: number
  artist_id: number
  device_uuid: string
  device_name: string | null
  created_at: string
  expires_at: string
  last_active_at: string
  last_login_ip: string | null
}

/** 解析 ISO 时间戳为毫秒（非法值返回 0 = 视为最旧，走过期/需记账分支） */
function parseIsoMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/** 90 天后的过期时刻（ISO 字符串） */
function freshExpiresAt(): string {
  return new Date(Date.now() + DESKTOP_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * 记账：桌面登录成功时调用。
 * (artist_id, device_uuid) 唯一——首次登录插新账；同设备重登录（被踢后重登/过期重登）
 * 走 ON CONFLICT 改账：刷新过期时间/名称/来源，不产生重复账目。
 */
export function registerDesktopDevice(
  artistId: number,
  deviceUuid: string,
  deviceName: string | null,
  loginIp: string | null
): DesktopDeviceRow {
  db.prepare(`
    INSERT INTO desktop_devices (artist_id, device_uuid, device_name, expires_at, last_active_at, last_login_ip)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(artist_id, device_uuid) DO UPDATE SET
      device_name = excluded.device_name,
      expires_at = excluded.expires_at,
      last_active_at = excluded.last_active_at,
      last_login_ip = excluded.last_login_ip
  `).run(artistId, deviceUuid, deviceName, freshExpiresAt(), new Date().toISOString(), loginIp)
  return db.prepare('SELECT * FROM desktop_devices WHERE artist_id = ? AND device_uuid = ?')
    .get(artistId, deviceUuid) as DesktopDeviceRow
}

/** 查单条账目（按账本 id + 画师双重限定，防越权读） */
export function getDesktopDevice(artistId: number, deviceId: number): DesktopDeviceRow | undefined {
  return db.prepare('SELECT * FROM desktop_devices WHERE id = ? AND artist_id = ?')
    .get(deviceId, artistId) as DesktopDeviceRow | undefined
}

/** 设备清单（管理后台用）：按最近活跃倒序 */
export function listDesktopDevices(artistId: number): DesktopDeviceRow[] {
  return db.prepare('SELECT * FROM desktop_devices WHERE artist_id = ? ORDER BY last_active_at DESC, id ASC')
    .all(artistId) as DesktopDeviceRow[]
}

/**
 * 撕账：单台踢出（换机/被盗场景）。
 * 返回是否真的撕掉了一条——账已不存在（重复踢/已过期清理）视为未命中。
 */
export function revokeDesktopDevice(artistId: number, deviceId: number): boolean {
  const result = db.prepare('DELETE FROM desktop_devices WHERE id = ? AND artist_id = ?').run(deviceId, artistId)
  return result.changes > 0
}

/** 撕光该画师全部桌面账目（bumpTokenVersion 全端踢人联动） */
export function revokeAllDesktopDevices(artistId: number): void {
  db.prepare('DELETE FROM desktop_devices WHERE artist_id = ?').run(artistId)
}

/**
 * 活跃记账 + 自动顺延（桌面 token 每次通过门禁后调用）。
 * - 距上次活跃 <1 小时且无需顺延 → 跳过（节流，防每请求一写）
 * - 距过期 <7 天且有活跃 → expires_at 改账至 now+90 天（「每周活跃即自动顺延」）
 * 调用方须先自行确认账目存在且未过期（门禁已查过账，此处只改账）。
 */
export function touchDesktopDevice(artistId: number, deviceId: number): void {
  const row = db.prepare('SELECT last_active_at, expires_at FROM desktop_devices WHERE id = ? AND artist_id = ?')
    .get(deviceId, artistId) as Pick<DesktopDeviceRow, 'last_active_at' | 'expires_at'> | undefined
  if (!row) return

  const now = Date.now()
  const needRenew = parseIsoMs(row.expires_at) - now < RENEW_THRESHOLD_MS
  const needTouch = now - parseIsoMs(row.last_active_at) >= TOUCH_THROTTLE_MS
  if (!needRenew && !needTouch) return

  if (needRenew) {
    db.prepare('UPDATE desktop_devices SET expires_at = ?, last_active_at = ? WHERE id = ? AND artist_id = ?')
      .run(freshExpiresAt(), new Date(now).toISOString(), deviceId, artistId)
    return
  }
  db.prepare('UPDATE desktop_devices SET last_active_at = ? WHERE id = ? AND artist_id = ?')
    .run(new Date(now).toISOString(), deviceId, artistId)
}
