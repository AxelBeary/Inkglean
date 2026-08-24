// 认证状态（825 波0 地基批）：会话恢复走凭证保险箱（v73 记账式会话，过期权威在服务器设备账本，
// 桌面端不自己算过期）；登录成功把 token/画师信息/设备标识全存 DPAPI 保险箱，禁止明文存储。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { desktopLogin, type DesktopArtist } from '../api/desktop'
import { saveSecret, loadSecret, deleteSecret } from '../bridge/secureStore'
import { isDesktop } from '../bridge/env'

const KEY_TOKEN = 'session-token'
const KEY_ARTIST = 'session-artist'
const KEY_DEVICE = 'device-uuid'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const artist = ref<DesktopArtist | null>(null)
  const loggedIn = computed(() => !!token.value)

  /** 设备标识：首次启动生成后入保险箱，账本键（同设备重登改账不重复记账） */
  async function ensureDeviceUuid(): Promise<string> {
    let uuid = await loadSecret(KEY_DEVICE)
    if (!uuid) {
      uuid = crypto.randomUUID()
      await saveSecret(KEY_DEVICE, uuid)
    }
    return uuid
  }

  /** 启动会话恢复（路由守卫调一次）；纯浏览器环境/保险箱读取失败一律按未登录处理 */
  async function restore(): Promise<void> {
    if (!isDesktop() || loggedIn.value) return
    try {
      const t = await loadSecret(KEY_TOKEN)
      const a = await loadSecret(KEY_ARTIST)
      if (t && a) {
        token.value = t
        artist.value = JSON.parse(a) as DesktopArtist
      }
    } catch {
      // 保险箱不可用或密文损坏：按未登录处理，重新登录即可
    }
  }

  /** 桌面登录（首发仅 TOTP）；401 错误由调用方按 api.error 文案展示 */
  async function login(qqNumber: string, code: string): Promise<void> {
    const deviceUuid = await ensureDeviceUuid()
    const result = await desktopLogin({ qqNumber, code, deviceUuid })
    token.value = result.token
    artist.value = result.artist
    await saveSecret(KEY_TOKEN, result.token)
    await saveSecret(KEY_ARTIST, JSON.stringify(result.artist))
  }

  /** 登出：清内存态 + 撕保险箱里的会话（设备账本行的到期权威仍在服务器，同设备下次登录改账） */
  async function logout(): Promise<void> {
    token.value = null
    artist.value = null
    try {
      await deleteSecret(KEY_TOKEN)
      await deleteSecret(KEY_ARTIST)
    } catch {
      // 保险箱删除失败不阻塞登出（内存态已清）
    }
  }

  return { token, artist, loggedIn, restore, login, logout }
})
