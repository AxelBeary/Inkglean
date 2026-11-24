// 认证状态（825 波0 地基批）：会话恢复走凭证保险箱（v73 记账式会话，过期权威在服务器设备账本，
// 桌面端不自己算过期）；登录成功把 token/画师信息/设备标识全存 DPAPI 保险箱，禁止明文存储。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { desktopLogin, desktopLogout, type DesktopArtist } from '../api/desktop'
import { saveSecret, loadSecret, deleteSecret } from '../bridge/secureStore'
import { isDesktop } from '../bridge/env'

const KEY_TOKEN = 'session-token'
const KEY_ARTIST = 'session-artist'
const KEY_DEVICE = 'device-uuid'
// 827 用户终验整改：本地模式标记落盘（原纯内存，撕出的悬浮小窗是独立页认不出本地态被拦回登录页；
// 重开会话也按上次选择直接进本地，不再逼回登录页重选）。归一同款纪律：读失败当非本地。
const LOCAL_MODE_KEY = 'shihui-desktop-local-mode-v1'
function readLocalModePref(): boolean {
  try {
    return localStorage.getItem(LOCAL_MODE_KEY) === '1'
  } catch {
    return false
  }
}
function writeLocalModePref(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOCAL_MODE_KEY, '1')
    else localStorage.removeItem(LOCAL_MODE_KEY)
  } catch {
    /* 非关键路径 */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const artist = ref<DesktopArtist | null>(null)
  const loggedIn = computed(() => !!token.value)

  // 双模式（§4.3 审计整包）：loggedIn 即 cloud；未登录时由登录页「暂不登录」进入 local。
  // 827 起标记落盘：撕出的悬浮窗与重开会话都能恢复本地态（路由守卫放行凭据）。
  const localMode = ref(readLocalModePref())
  /** 运行模式：云端（已登录）/ 本地（未登录脱网） */
  const mode = computed<'cloud' | 'local'>(() => loggedIn.value ? 'cloud' : 'local')

  /** 登录页「暂不登录 · 本地模式」入口：放行路由守卫进首页 */
  function enterLocalMode() {
    localMode.value = true
    writeLocalModePref(true)
  }

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
        // F0031（B6）: 档案先解析成功再落 token+artist——若先写 token 再 parse，
        // 密文损坏抛错被外层 catch 吞掉后会留下「loggedIn 但 artist 为空」半态。
        const restored = JSON.parse(a) as DesktopArtist
        token.value = t
        artist.value = restored
      }
    } catch {
      // 保险箱不可用或密文损坏：按未登录处理，重新登录即可
    }
  }

  /** 桌面登录（首发仅 TOTP）；401 错误由调用方按 api.error 文案展示 */
  async function login(qqNumber: string, code: string): Promise<void> {
    const deviceUuid = await ensureDeviceUuid()
    const result = await desktopLogin({ qqNumber, code, deviceUuid })
    // DTK-01（debug-swarm 11-24）：先完成全部落盘，再原子写内存态。
    // 原实现先置 token/loggedIn 再存 DPAPI：落盘失败会留下「界面报失败但 loggedIn=true、
    // 凭证未落盘」半态（重启丢失且无法回本地模式）。现把内存提交放到两次 saveSecret 之后。
    await saveSecret(KEY_TOKEN, result.token)
    try {
      await saveSecret(KEY_ARTIST, JSON.stringify(result.artist))
    } catch (err) {
      // 第二把失败：回滚第一把，避免残留孤立 token 密文 / 半套凭证；原错误照常抛出由调用方展示
      try { await deleteSecret(KEY_TOKEN) } catch { /* 回滚尽力而为，不吞原始落盘错误 */ }
      throw err
    }
    // 全部落盘成功后一次性提交内存态（loggedIn 由 token 派生，天然原子）
    token.value = result.token
    artist.value = result.artist
    localMode.value = false // 登录成功即切云端，本地模式会话语义终止（标记同步清）
    writeLocalModePref(false)
  }

  /** 登出（切出）：先撕服务端账本再清本地；827 用户终验口径：切出默认回本地模式（用户报障：切出能回本地但需重新选） */
  async function logout(): Promise<void> {
    // 260830 审计 H-2：切出必须先注销服务端会话（bumpTokenVersion → 撕光桌面设备账本），
    // 否则旧 token 在 90 天账本有效期内仍可通过门禁。口径同网页登出＝全端踢人；
    // 网络失败降级为纯本地清理（本地凭证已删，服务端会话由设备账本过期兑底）。
    if (token.value) {
      try {
        await desktopLogout(token.value)
      } catch {
        /* 离线/断网：继续本地清理 */
      }
    }
    token.value = null
    artist.value = null
    localMode.value = true
    writeLocalModePref(true)
    try {
      await deleteSecret(KEY_TOKEN)
      await deleteSecret(KEY_ARTIST)
    } catch {
      // 保险箱删除失败不阻塞登出（内存态已清）
    }
  }

  return { token, artist, loggedIn, localMode, mode, enterLocalMode, restore, login, logout }
})
