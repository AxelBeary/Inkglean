// 首页长卷改造（9/4 波1 · 路B）自检测试。
// 覆盖三块（施工图 §四）：
//   ① moreDrawer.ts 纯函数：三段条目齐全 / 无模块降级 / 断言无「统计」「客户快查」死条目 / 模块四态文案 / 本地模式差异。
//   ② 卷心页签与 prefs.mainView 联动口径（点「排期月历」→ prefs 落 cal + localStorage 持久化 + 页签 aria-selected 翻转）。
//   ③ 摘要签显隐（云端 / 本地 / 失败态）：SchedStrip 组件 v-if 守卫 + 柱条 tone→class + store.stripDays 恒非空（照显不留死签）。
// 挂载兜底：测试栈未装 @vue/test-utils，用 createApp + nextTick 直挂 happy-dom 节点（与 home-mode.test.ts 同款）。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Router } from 'vue-router'
import Home from '../views/Home.vue'
import SchedStrip from '../components/home/SchedStrip.vue'
import { useAuthStore } from '../stores/auth'
import { usePrefsStore } from '../stores/prefs'
import { useScheduleStore } from '../stores/schedule'
import { buildMoreDrawer, moduleStateLabel } from '../components/home/moreDrawer'
import type { DrawerItem } from '../components/home/moreDrawer'
import type { StripDay } from '../schedule/strip'
import type { ModuleState } from '../modules/types'

// ─── 挂载工具 ───
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/login', name: 'login', component: { render: () => null } },
      { path: '/schedule', name: 'schedule', component: { render: () => null } }
    ]
  })
}

/** 云端取数一律 stub 为 500：验证失败静默降级，不打真实网络 */
function stubDeadNetwork(): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'down' })
  })))
}

let app: App | null = null
let root: HTMLElement | null = null

afterEach(() => {
  if (app) { app.unmount(); app = null }
  if (root) { root.remove(); root = null }
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function mountHome(cloud: boolean) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const pinia = createPinia()
  if (cloud) useAuthStore(pinia).token = 'test-token' // 登录态即云端
  const router = makeRouter()
  await router.push('/')
  app = createApp(Home)
  app.use(pinia).use(router)
  app.mount(root)
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
  return { root: root!, pinia }
}

// ══════════════════════════════════════════════════════════════
// ① moreDrawer.ts 纯函数
// ══════════════════════════════════════════════════════════════
describe('moreDrawer：三段条目组装（纯函数）', () => {
  it('三段齐全：板块 / 插件（模块）/ 工具箱，标题与顺序固定', () => {
    const secs = buildMoreDrawer([], 'cloud')
    expect(secs.map(s => s.sec)).toEqual(['板块', '插件（模块）', '工具箱'])
    // 板块：一条「排期三视图」→ /schedule
    expect(secs[0].items).toHaveLength(1)
    expect(secs[0].items[0].name).toBe('排期三视图')
    expect(secs[0].items[0].to).toBe('/schedule')
    // 工具箱：六条既有工具页，路由逐条对齐 router/index.ts
    expect(secs[2].items.map(i => i.to)).toEqual([
      '/tools/price-card', '/tools/receipt', '/tools/profile',
      '/tools/templates', '/tools/export', '/tools/modules'
    ])
  })

  it('无模块时：插件段只留「装新插件」，不留空段', () => {
    const secs = buildMoreDrawer([], 'cloud')
    const plugins = secs[1].items
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('装新插件')
    expect(plugins[0].to).toBe('/tools/modules')
  })

  it('死条目红线：全抽屉不出现「统计」「客户快查」（桌面端无对应页面）', () => {
    for (const mode of ['cloud', 'local'] as const) {
      const secs = buildMoreDrawer(
        [{ name: '示例插件', state: 'ok' as ModuleState }],
        mode
      )
      const names = secs.flatMap(s => s.items.map(i => i.name))
      expect(names).not.toContain('统计')
      expect(names).not.toContain('客户快查')
    }
  })

  it('模块四态文案逐条（与 ModulesTool.stateLabel 同口径）', () => {
    expect(moduleStateLabel('ok')).toBe('正常')
    expect(moduleStateLabel('disabled')).toBe('已停用')
    expect(moduleStateLabel('invalid')).toBe('已失效')
    expect(moduleStateLabel('grey')).toBe('灰牌')

    const mods: Array<{ name: string; state: ModuleState }> = [
      { name: '甲', state: 'ok' },
      { name: '乙', state: 'disabled' },
      { name: '丙', state: 'invalid' },
      { name: '丁', state: 'grey' }
    ]
    const secs = buildMoreDrawer(mods, 'cloud')
    const descs = secs[1].items.map(i => i.desc)
    expect(descs).toContain('插件 · 正常')
    expect(descs).toContain('插件 · 已停用')
    expect(descs).toContain('插件 · 已失效')
    expect(descs).toContain('插件 · 灰牌')
    // 模块条 + 「装新插件」＝5 条；模块条点击一律跳模块管理页
    expect(secs[1].items).toHaveLength(5)
    for (const it of secs[1].items) expect(it.to).toBe('/tools/modules')
  })

  it('本地模式差异：排期三视图描述诚实说明无时间条；板块仍在（本地也显）', () => {
    const cloud = buildMoreDrawer([], 'cloud')[0].items[0]
    const local = buildMoreDrawer([], 'local')[0].items[0]
    expect(cloud.desc).toBe('列表 / 月历 / 时间条全景')
    expect(local.desc).toBe('列表 / 月历（本地按记账自建）')
    // 本地也有「排期三视图」条目（不留死角），路由同为 /schedule
    expect(local.to).toBe('/schedule')
    expect(local.name).toBe('排期三视图')
  })

  it('每条条目形状完整：ico/name/desc/to 皆为非空字符串', () => {
    const secs = buildMoreDrawer([{ name: '插件A', state: 'ok' }], 'cloud')
    const all: DrawerItem[] = secs.flatMap(s => s.items)
    expect(all.length).toBeGreaterThan(0)
    for (const i of all) {
      expect(typeof i.ico).toBe('string')
      expect(i.name.length).toBeGreaterThan(0)
      expect(i.desc.length).toBeGreaterThan(0)
      expect(i.to.startsWith('/')).toBe(true)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// ② 卷心页签 ⇄ prefs.mainView 联动
// ══════════════════════════════════════════════════════════════
describe('卷心页签与 prefs.mainView 联动', () => {
  it('初始为 todo：今日要办页签选中，cal pane 存在但 v-show 隐藏', async () => {
    const { root, pinia } = await mountHome(false)
    const prefs = usePrefsStore(pinia)
    expect(prefs.prefs.mainView).toBe('todo')

    const tabs = [...root.querySelectorAll('.mv-tab')]
    expect(tabs.map(t => t.textContent?.trim())).toEqual(['今日要办', '排期月历'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    // 两 pane 都挂载（v-show 非 v-if）
    expect(root.querySelector('[data-mv="todo"]')).not.toBeNull()
    expect(root.querySelector('[data-mv="cal"]')).not.toBeNull()
  })

  it('点「排期月历」→ prefs.mainView 落 cal + 页签选中翻转 + localStorage 持久化', async () => {
    const { root, pinia } = await mountHome(false)
    const prefs = usePrefsStore(pinia)

    const calTab = [...root.querySelectorAll('.mv-tab')]
      .find(t => t.textContent?.trim() === '排期月历')
    expect(calTab).toBeTruthy()
    calTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await nextTick() // watch(deep) 落盘为异步

    expect(prefs.prefs.mainView).toBe('cal')
    expect(calTab!.getAttribute('aria-selected')).toBe('true')

    // 记住选择：写入持久化键，下次开应用仍是这一面
    const raw = localStorage.getItem('shihui-desktop-prefs-v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).mainView).toBe('cal')
  })

  it('持久化回放：预置 mainView=cal 再挂载 → 排期月历页签默认选中', async () => {
    localStorage.setItem('shihui-desktop-prefs-v1', JSON.stringify({ mainView: 'cal' }))
    root = document.createElement('div')
    document.body.appendChild(root)
    const pinia = createPinia()
    const router = makeRouter()
    await router.push('/')
    app = createApp(Home)
    app.use(pinia).use(router)
    app.mount(root)
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    const prefs = usePrefsStore(pinia)
    expect(prefs.prefs.mainView).toBe('cal')
    const tabs = [...root.querySelectorAll('.mv-tab')]
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })
})

// ══════════════════════════════════════════════════════════════
// ③ 卷尾摘要签显隐（云端 / 本地 / 失败态）
// ══════════════════════════════════════════════════════════════

/** 造 7 天 StripDay 夹具（tone 逐档覆盖） */
function fixtureDays(): StripDay[] {
  const tones: StripDay['tone'][] = ['over', 'busy', 'full', 'free', 'busy', 'full', 'free']
  const wd = ['一', '二', '三', '四', '五', '六', '日']
  const base = new Date(2026, 8, 1)
  return tones.map((tone, i) => ({
    date: new Date(base.getFullYear(), base.getMonth(), base.getDate() + i),
    weekday: wd[i],
    tone,
    count: tone === 'over' || tone === 'busy' ? 1 : 0
  }))
}

async function mountStrip(days: StripDay[]) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const router = makeRouter()
  await router.push('/')
  app = createApp(SchedStrip, { days })
  app.use(router)
  app.mount(root)
  await nextTick()
  return root!
}

describe('卷尾摘要签 SchedStrip 显隐', () => {
  it('有数据：渲染 7 根柱条，tone→class 逐档对齐（over/busy/full/free）', async () => {
    const r = await mountStrip(fixtureDays())
    const strip = r.querySelector('.sched-strip')
    expect(strip).not.toBeNull()
    // 整条可点 + 键盘等价（无障碍口径）
    expect(strip!.getAttribute('role')).toBe('button')
    expect(strip!.getAttribute('tabindex')).toBe('0')

    const sds = [...r.querySelectorAll('.sd')]
    expect(sds).toHaveLength(7)
    expect(sds[0].classList.contains('over')).toBe(true)
    expect(sds[1].classList.contains('busy')).toBe(true)
    expect(sds[2].classList.contains('full')).toBe(true)
    expect(sds[3].classList.contains('free')).toBe(true)
    // 每根柱条含周几 + 竖条
    expect(sds[0].querySelector('.dw')?.textContent?.trim()).toBe('一')
    expect(sds[0].querySelector('.bar')).not.toBeNull()
  })

  it('空/失败态：days 为空整条不渲染（不留死签）', async () => {
    const r = await mountStrip([])
    expect(r.querySelector('.sched-strip')).toBeNull()
  })

  it('本地模式：store.stripDays 恒 7 天（照显，不留死签），空日走素条不涂藤黄', () => {
    const pinia = createPinia()
    // 无 token ＝本地模式；canAccept 恒 false（拍板②：无名额概念 → 不标可接单）
    const sched = useScheduleStore(pinia)
    expect(sched.mode).toBe('local')
    expect(sched.canAccept).toBe(false)
    expect(sched.stripDays).toHaveLength(7)
    // 9/4 收口修正：本地空日不能落 full（藤黄在月历图例里是「名额已满/临期」，
    // 本地根本没名额，涂藤黄等于对画师说假话）——一律素条 free
    for (const d of sched.stripDays) expect(d.tone).toBe('free')
    expect(sched.slotText).toBe('')
  })

  it('本地模式：时间条整块缺席（拍板②）+ 账本读不到时不给「你还没记账」的假空态', async () => {
    const pinia = createPinia()
    const sched = useScheduleStore(pinia)
    expect(sched.timelineAvailable).toBe(false)
    await sched.load()
    // 纯浏览器/桩环境：SQLite 桥不可用 → localUnavailable，且必须置失败态（页面据此说真话 + 给重试）
    expect(sched.localUnavailable).toBe(true)
    expect(sched.failed).toBe(true)
  })

  it('模式切换即作废旧数据（防云端/本地串台：切出后月历不得继续显云端客户）', async () => {
    stubDeadNetwork()
    const pinia = createPinia()
    const auth = useAuthStore(pinia)
    auth.token = 'test-token'
    const sched = useScheduleStore(pinia)
    await sched.load()
    expect(sched.mode).toBe('cloud')
    expect(sched.timelineAvailable).toBe(true)
    // 切出：token 清空 + 回本地（走的是 SPA 路由跳转，首页不重挂载，onMounted 兜不住）
    auth.token = null
    auth.enterLocalMode()
    await nextTick()
    expect(sched.mode).toBe('local')
    expect(sched.timelineAvailable).toBe(false)
    expect(sched.orders).toEqual([])
  })

  it('云端失败态：队列拉失败保留旧数据，stripDays 仍 7 天（不抹成空白死签）', async () => {
    stubDeadNetwork()
    const pinia = createPinia()
    useAuthStore(pinia).token = 'test-token'
    const sched = useScheduleStore(pinia)
    expect(sched.mode).toBe('cloud')
    await sched.load()
    expect(sched.failed).toBe(true)
    // 失败不牵连摘要签：仍给满 7 天（诚实空态而非死签）
    expect(sched.stripDays).toHaveLength(7)
  })
})
