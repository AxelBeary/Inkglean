// 方向 A 测试②③：双模式过滤矩阵 + 专注收合（框架施加纪律，§4.3 渲染前统一过滤）
// ② 本地模式不渲染：状态挂牌 / 留言板块 / 检查更新（死按钮红线）；云端模式渲染挂牌。
// ③ 专注画画模式：fold 板块（留言/订单速览）收合隐藏，keep 板块（今日要办/经营）保留。
// 挂载兜底：测试栈未装 @vue/test-utils，用 createApp + nextTick 直挂 happy-dom 节点。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import Home from '../views/Home.vue'
import { useAuthStore } from '../stores/auth'
import { usePrefsStore } from '../stores/prefs'

async function mountHome(cloud: boolean) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const pinia = createPinia()
  if (cloud) useAuthStore(pinia).token = 'test-token' // 登录态即云端
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/login', name: 'login', component: { render: () => null } }
    ]
  })
  await router.push('/')
  const app = createApp(Home)
  app.use(pinia).use(router)
  app.mount(root)
  await nextTick()
  // 云端统一取数是异步的：等它落定（fetch 已 stub 为立即失败，静默降级）
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
  return { root, pinia, app }
}

/** 云端取数一律 stub 为 500：验证失败静默降级口径，不打真实网络 */
function stubDeadNetwork() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'down' })
  })))
}

let app: App | null = null
let root: HTMLElement | null = null
let pinia: Pinia | null = null

afterEach(() => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  pinia = null
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('双模式过滤矩阵（测试②）', () => {
  it('本地模式：不渲染挂牌 / 留言板块 / 检查更新；菜单出本地账号行', async () => {
    ({ root, app } = await mountHome(false))
    const text = root!.textContent ?? ''

    expect(root!.querySelector('.sign')).toBeNull()           // 挂牌：本地整体不渲染
    expect(root!.querySelector('.msgs')).toBeNull()           // 留言：本地整块隐藏
    expect(text).not.toContain('检查更新')                     // 检查更新：仅云端且在线
    expect(text).toContain('本地模式')                         // 账号行本地变体
    expect(text).toContain('登录同步')                         // 本地→云端入口（不留死角）
    expect(root!.querySelector('.artist')).toBeNull()          // 题签画师名：云端才有
  })

  it('本地模式：不发起任何云端请求（双模式纪律）', async () => {
    stubDeadNetwork()
    ;({ root, app } = await mountHome(false))
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('云端模式（断网口径）：渲染挂牌与画师名，失败静默为一行提示', async () => {
    stubDeadNetwork()
    ;({ root, app } = await mountHome(true))
    const text = root!.textContent ?? ''

    expect(root!.querySelector('.sign')).not.toBeNull()        // 挂牌：云端渲染
    expect(root!.querySelector('.artist')).not.toBeNull()      // 题签画师名
    expect(text).toContain('暂时取不到')                        // 失败静默降级，不留白
  })
})

describe('专注收合（测试③）', () => {
  it('专注模式：fold 板块（订单速览/留言）收合，keep 板块（今日要办/经营）保留', async () => {
    ({ root, pinia, app } = await mountHome(false))
    expect(root!.querySelector('.flow')).not.toBeNull()        // 卷心今日要办恒在

    const prefs = usePrefsStore(pinia!)
    expect(root!.querySelector('.card.ops')).not.toBeNull()    // 专注前：经营在
    expect(root!.querySelector('.tail-bar .lbl')).not.toBeNull() // 专注前：订单速览在

    prefs.setFocus(true)
    await nextTick()

    expect(root!.querySelector('.flow')).not.toBeNull()        // keep：今日要办保留
    expect(root!.querySelector('.card.ops')).not.toBeNull()    // keep：经营保留
    expect(root!.querySelector('.tail-bar .lbl')).toBeNull()   // fold：订单速览收合

    prefs.setFocus(false)
    await nextTick()
    expect(root!.querySelector('.tail-bar .lbl')).not.toBeNull() // 退出专注即还原
  })
})
