// API 边界 DTO · 桌面端登录设备账本（画师端 + 管理端）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── H-3: 桌面端登录设备账本（GET/DELETE /api/artist/devices） ───
/** GET /api/artist/devices 单行（后端已剔除 artist_id/device_uuid 等敏感列） */
export interface DesktopDevice {
  id: number
  device_name: string | null
  last_active_at: string
  expires_at: string
  created_at: string
  /** 最近登录 IP（后端 last_login_ip 映射；无记录为 null） */
  login_ip: string | null
}
/** GET /api/artist/devices 响应（最近活跃倒序） */
export interface DesktopDevicesResult {
  devices: DesktopDevice[]
}

// ─── 桌面设备账本（管理端视角，GET/DELETE /api/admin/artists/:id/devices）───
/** 管理端设备行（全列，含 artist_id/device_uuid/last_login_ip；与画师端 DesktopDevice 剔除敏感列不同）；GET 返回裸数组，按最近活跃倒序 */
export interface AdminDesktopDevice {
  id: number
  artist_id: number
  device_uuid: string
  device_name: string | null
  created_at: string
  expires_at: string
  last_active_at: string
  last_login_ip: string | null
}
