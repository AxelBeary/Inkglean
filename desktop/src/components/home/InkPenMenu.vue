<script setup lang="ts">
// 墨笔菜单（方向 A 落码批）：题签右上唯一系统入口，唤出一册纸签——视觉照原型逐段移植。
// §4.3 脱机审计整包：检查更新/网页版完整设置仅「云端模式且在线」渲染（死按钮红线）；
// 开机自启纯浏览器环境降级为隐藏该条；关闭行为本批只渲染「直接退出」单选项并记住偏好（托盘未建）。
// F8 承诺：关于区明示「画画时间数据永不上传」。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { usePrefsStore } from '../../stores/prefs'
import { PANEL_REGISTRY } from '../../panels/contract'
import type { MountStyle, TearableId } from '../../panels/contract'
import {
  closeFloatingWindow,
  getAutostart,
  openFloatingWindow,
  setAutostart
} from '../../bridge/window'
import { checkAndDownloadUpdate, installPendingUpdate, isDesktop } from '../../bridge'
import { WEB_BASE } from '../../config'

const emit = defineEmits<{ (_e: 'open-about'): void }>()

const VERSION = '0.1.0'
const CLOSE_PREF_KEY = 'shihui-desktop-close-behavior-v1'

const router = useRouter()
const auth = useAuthStore()
const prefs = usePrefsStore()

const open = ref(false)
const wrapRef = ref<HTMLElement | null>(null)
const penRef = ref<HTMLButtonElement | null>(null)
const online = ref(navigator.onLine)
const autostart = ref<boolean | null>(null)
const updateHint = ref('已是最新')
const updateBusy = ref(false)

const cloud = computed(() => auth.loggedIn)
const hideablePanels = computed(() => PANEL_REGISTRY.filter(p => p.hideable))

const TEARS: Array<{ kind: TearableId; tt: string }> = [
  { kind: 'timer', tt: '计时器' },
  { kind: 'today-todo', tt: '今日待办' },
  { kind: 'deadline', tt: '截稿倒计时' }
]
const MOUNTS: Array<{ v: MountStyle; label: string }> = [
  { v: 'plain', label: '素纸' },
  { v: 'grid', label: '界格' },
  { v: 'indigo', label: '花青笺' }
]

function setOpen(v: boolean) {
  open.value = v
}

function onDocClick(e: MouseEvent) {
  if (open.value && wrapRef.value && !wrapRef.value.contains(e.target as Node)) setOpen(false)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    setOpen(false)
    penRef.value?.focus()
  }
}
function onOnline() { online.value = true }
function onOffline() { online.value = false }

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  // 开机自启回显：纯浏览器环境抛 BridgeUnavailableError → 保持 null，菜单隐藏该条
  if (isDesktop()) {
    getAutostart().then(v => { autostart.value = v }).catch(() => { autostart.value = null })
  }
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})

// ─── 账号行 ───
async function logout() {
  setOpen(false)
  await auth.logout()
  await router.push({ name: 'login' })
}
async function goLogin() {
  setOpen(false)
  await router.push({ name: 'login' })
}

// ─── 撕悬浮三件（框架行为）───
async function toggleTear(kind: TearableId) {
  if (prefs.isTorn(kind)) {
    prefs.setTorn(kind, false)
    try { await closeFloatingWindow(kind) } catch { /* 壳层窗口已不在：静默 */ }
  } else {
    prefs.setTorn(kind, true)
    // 撕出失败回滚状态：防卡在「已撕下」但窗口没出来的死态（826 终验报障同源整改）
    try { await openFloatingWindow(kind) } catch { prefs.setTorn(kind, false) }
  }
}

// ─── 桌面：开机自启 / 关闭行为 ───
async function toggleAutostart() {
  if (autostart.value === null) return
  const target = !autostart.value
  try {
    await setAutostart(target)
    autostart.value = target
  } catch { /* 设置失败：回显不变，不打扰 */ }
}
function readClosePref(): string {
  try { return localStorage.getItem(CLOSE_PREF_KEY) ?? 'quit' } catch { return 'quit' }
}
const closeBehavior = ref(readClosePref())
function chooseQuit() {
  // 本批单选项：托盘未建，「最小化到托盘」不渲染；点按即记住偏好（幂等）
  closeBehavior.value = 'quit'
  try { localStorage.setItem(CLOSE_PREF_KEY, 'quit') } catch { /* 偏好非关键路径 */ }
}

// ─── 字号（14~20 步进，同网页端滑块口径；全局经 zoom 施加） ───
function fontDec() { prefs.setFontSize(prefs.prefs.fontSize - 1) }
function fontInc() { prefs.setFontSize(prefs.prefs.fontSize + 1) }

// ─── 检查更新（仅云端且在线渲染）───
async function checkUpdate() {
  if (updateBusy.value) return
  updateBusy.value = true
  updateHint.value = '检查中…'
  try {
    const result = await checkAndDownloadUpdate()
    if (result === 'downloaded' && window.confirm('新版本已下载，现在重启完成更新？')) {
      await installPendingUpdate()
      return
    }
    updateHint.value = '已是最新'
  } catch {
    updateHint.value = '检查失败'
  } finally {
    updateBusy.value = false
  }
}

// ─── 网页版完整设置（仅云端且在线渲染）───
async function openWebSettings() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(WEB_BASE)
  } catch {
    // 纯浏览器/打开失败：退化为新标签页（不留死按钮）
    window.open(WEB_BASE, '_blank', 'noopener')
  }
}

function openAbout() {
  setOpen(false)
  emit('open-about')
}
</script>

<template>
  <div ref="wrapRef" class="pen-wrap" :class="{ open }">
    <button
      ref="penRef"
      type="button"
      class="pen"
      :aria-expanded="open"
      aria-haspopup="true"
      aria-label="菜单与设置"
      @click="setOpen(!open)"
    >
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 3.6 16.4 6.8 7.4 15.8 3.4 16.6 4.2 12.6Z" /><path d="M11.8 5 15 8.2" /></svg>
    </button>
    <div class="paper-menu" role="menu" aria-label="菜单与设置">
      <!-- 账号行：云端＝画师名+切出；本地＝「本地模式」+「登录同步」入口（§4.3 拍板变体） -->
      <div v-if="cloud" class="pm-acct">
        <span class="avatar" aria-hidden="true">{{ (auth.artist?.name ?? '画').charAt(0) }}</span>
        <span class="info">
          <span class="nm">{{ auth.artist?.name ?? '画师' }}</span>
          <span class="st"><i aria-hidden="true"></i>云端模式 · 已同步</span>
        </span>
        <button type="button" class="out" @click="logout">切出</button>
      </div>
      <div v-else class="pm-acct">
        <span class="avatar avatar--local" aria-hidden="true">本</span>
        <span class="info">
          <span class="nm">本地模式</span>
          <span class="st">数据仅存本机 · 不联网</span>
        </span>
        <button type="button" class="out" @click="goLogin">登录同步</button>
      </div>
      <div class="pm-div"></div>

      <!-- 板块显隐（today 不可隐，天然不出现在列表） -->
      <p class="pm-sec">板块显隐</p>
      <button
        v-for="p in hideablePanels"
        :key="p.id"
        type="button"
        class="pm-item"
        :aria-pressed="!prefs.prefs.hidden.includes(p.id)"
        @click="prefs.toggleHidden(p.id)"
      >
        <i class="mini-dot" aria-hidden="true"></i>
        <span class="mid">{{ p.label }}板块</span>
        <span class="hint">{{ prefs.prefs.hidden.includes(p.id) ? '已隐藏' : '显示中' }}</span>
      </button>
      <div class="pm-div"></div>

      <!-- 撕成悬浮小组（首发三件） -->
      <p class="pm-sec">撕成悬浮小组</p>
      <div class="tears">
        <button
          v-for="t in TEARS"
          :key="t.kind"
          type="button"
          class="tear"
          :aria-pressed="prefs.isTorn(t.kind)"
          @click="toggleTear(t.kind)"
        >
          <span class="tt">{{ t.tt }}</span>
          <span class="ts">{{ prefs.isTorn(t.kind) ? '已撕下' : '撕下' }}</span>
        </button>
      </div>
      <div class="pm-div"></div>

      <!-- 桌面 -->
      <p class="pm-sec">桌面</p>
      <button type="button" class="pm-item" :aria-pressed="prefs.prefs.focus" @click="prefs.setFocus(!prefs.prefs.focus)">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></svg>
        <span class="mid">专注画画模式</span>
        <span class="hint">{{ prefs.prefs.focus ? '已进入' : '仅留当前单' }}</span>
      </button>
      <button v-if="autostart !== null" type="button" class="pm-item" :aria-pressed="autostart" @click="toggleAutostart">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 2v5" /><path d="M5.3 4.6a4 4 0 1 0 5.4 0" /></svg>
        <span class="mid">开机自动启动</span>
        <span class="inksw" aria-hidden="true"></span>
      </button>
      <button type="button" class="pm-item" :aria-pressed="closeBehavior === 'quit'" @click="chooseQuit">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 10v2.5h11V10" /><path d="M2.5 10h3.2l1 1.6h2.6l1-1.6h3.2" /><path d="M8 2.5V7" /><path d="M5.8 5 8 7.2 10.2 5" /></svg>
        <span class="mid">关闭时</span>
        <span class="hint tag">直接退出</span>
      </button>
      <div class="pm-item pm-item--static">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12.5 8 3.5l4.5 9" /><path d="M5.3 9.5h5.4" /></svg>
        <span class="mid">字号</span>
        <span class="stepper">
          <button type="button" class="step" aria-label="字号调小" :disabled="prefs.prefs.fontSize <= 14" @click="fontDec">−</button>
          <span class="step-val num">{{ prefs.prefs.fontSize }}px</span>
          <button type="button" class="step" aria-label="字号调大" :disabled="prefs.prefs.fontSize >= 20" @click="fontInc">＋</button>
        </span>
      </div>
      <div class="pm-div"></div>

      <!-- 装裱 · 纸式（全局单选防混搭） -->
      <p class="pm-sec">装裱 · 纸式</p>
      <div class="mounts">
        <button
          v-for="m in MOUNTS"
          :key="m.v"
          type="button"
          class="mount"
          :aria-pressed="prefs.prefs.mount === m.v"
          @click="prefs.setMount(m.v)"
        >
          <svg viewBox="0 0 24 20" width="26" height="22" aria-hidden="true">
            <rect x="1.25" y="1.25" width="21.5" height="17.5" rx="2" :fill="m.v === 'indigo' ? 'color-mix(in srgb, var(--card) 94%, var(--hq))' : 'var(--card)'" stroke="var(--line2)" stroke-width="1.5" />
            <path v-if="m.v === 'grid'" d="M8.7 2.5v15M15.3 2.5v15M2.5 7h19M2.5 13h19" stroke="rgba(38,37,32,.28)" stroke-width="1" />
          </svg>
          <span>{{ m.label }}</span>
        </button>
      </div>
      <div class="pm-div"></div>

      <!-- 其他（检查更新/网页设置：仅云端且在线渲染——§4.3 死按钮红线） -->
      <p class="pm-sec">其他</p>
      <button v-if="cloud && online" type="button" class="pm-item" :disabled="updateBusy" @click="checkUpdate">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 2.5V5h-2.5" /></svg>
        <span class="mid">检查更新</span>
        <span class="hint tag">{{ updateHint }}</span>
      </button>
      <button v-if="cloud && online && WEB_BASE" type="button" class="pm-item" @click="openWebSettings">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.8 1.6 1.8 9.4 0 11-1.8-1.6-1.8-9.4 0-11Z" /></svg>
        <span class="mid">网页版完整设置</span>
        <span class="hint tag">打开 ↗</span>
      </button>
      <button type="button" class="pm-item" @click="openAbout">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 7.5V11" /><circle cx="8" cy="5.2" r="0.6" fill="currentColor" stroke="none" /></svg>
        <span class="mid">关于拾绘</span>
        <span class="hint tag">v{{ VERSION }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 照原型 CSS 逐段移植 */
.pen-wrap { position: relative; display: inline-block; }
.pen {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border-radius: var(--r-s-hand); color: var(--ink3);
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.pen:hover { color: var(--ink); background: rgba(38, 37, 32, .05); }
.pen[aria-expanded="true"] { color: var(--ink); background: rgba(38, 37, 32, .07); }
.paper-menu {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: 256px;
  background: var(--card); border-radius: var(--r-paper);
  box-shadow: 0 0 0 1px rgba(38, 37, 32, .06), 0 2px 4px rgba(38, 37, 32, .08), 0 18px 36px -18px rgba(38, 37, 32, .5);
  padding: 12px 12px 8px;
  opacity: 0; transform: translateY(-4px); pointer-events: none;
  transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out);
}
.pen-wrap.open .paper-menu { opacity: 1; transform: none; pointer-events: auto; }
.pm-sec { font-size: 11px; letter-spacing: .12em; color: var(--ink4); margin: 9px 4px 3px; }
.pm-sec:first-child { margin-top: 0; }
.pm-item {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  padding: 7px 8px; border-radius: var(--r-s-hand); font-size: 13px; color: var(--ink2);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast);
}
.pm-item:hover { background: rgba(38, 37, 32, .05); color: var(--ink); }
.pm-item svg { flex: none; color: var(--ink3); transition: color var(--dur-fast); }
.pm-item:hover svg { color: var(--ink2); }
.pm-item .mid { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pm-item .hint { flex: none; font-size: 11.5px; color: var(--ink4); white-space: nowrap; }
/* 字号步进行：静态行（整行不可点，步进器自带按钮），去 hover 加深 */
.pm-item--static { cursor: default; }
.pm-item--static:hover { background: none; color: var(--ink2); }
.stepper {
  flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
}
.step {
  width: 22px; height: 20px; font-size: 13px; line-height: 1; color: var(--ink3);
  border-radius: var(--r-s-hand);
  transition: color var(--dur-fast), background var(--dur-fast);
}
.step:hover:not(:disabled) { color: var(--ink); background: rgba(38, 37, 32, .06); }
.step:disabled { opacity: .35; cursor: not-allowed; }
.step-val { min-width: 38px; text-align: center; font-size: 11.5px; color: var(--ink3); }
/* 纸签态值：把「直接退出/打开↗/已是最新」之类裸文字值收进小纸签，去毛坯感（826 终验整改） */
.pm-item .hint.tag {
  font-size: 11px; color: var(--ink3); padding: 2px 8px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-s-hand);
}
.pm-div { height: 1px; background: rgba(38, 37, 32, .08); margin: 7px 4px; }
/* 账号行 */
.pm-acct { display: flex; align-items: center; gap: 10px; padding: 4px 8px 6px; }
.pm-acct .avatar {
  flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--hq-t); color: var(--hq-d);
  font-family: var(--f-d); font-size: 15px; display: flex; align-items: center; justify-content: center;
}
.pm-acct .avatar--local { background: var(--th-t); color: var(--th); }
.pm-acct .info { flex: 1; min-width: 0; }
.pm-acct .nm { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.pm-acct .st { font-size: 11.5px; color: var(--ink4); display: flex; align-items: center; gap: 5px; }
.pm-acct .st i { width: 6px; height: 6px; border-radius: 50%; background: var(--sl); flex: none; }
.pm-acct .out {
  flex: none; font-size: 12px; color: var(--ink2); padding: 4px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--paper2);
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.pm-acct .out:hover { color: var(--zs-d); background: var(--zs-t); border-color: var(--zs); }
/* 墨开关 */
.inksw {
  flex: none; position: relative; width: 32px; height: 18px; border-radius: var(--r-pill);
  background: var(--line2); transition: background var(--dur-mid) var(--ease-out);
}
.inksw::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--card); box-shadow: 0 1px 2px rgba(38, 37, 32, .35);
  transition: left var(--dur-mid) var(--ease-out);
}
.pm-item[aria-pressed="true"] .inksw { background: var(--hq); }
.pm-item[aria-pressed="true"] .inksw::after { left: 16px; }
/* 撕悬浮三枚纸签 */
.tears { display: flex; gap: 8px; padding: 2px 8px 4px; }
.tear {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 7px 4px 6px; border: 1px dashed var(--line2); border-radius: var(--r-s-hand);
  background: var(--card);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}
.tear .tt { font-family: var(--f-d); font-size: 13px; color: var(--ink2); transition: color var(--dur-fast); }
.tear .ts { font-size: 10.5px; color: var(--ink4); transition: color var(--dur-fast); }
.tear:hover { border-color: var(--ink4); }
.tear[aria-pressed="true"] { border-style: solid; border-color: var(--hq); background: var(--hq-t); }
.tear[aria-pressed="true"] .tt { color: var(--hq-d); }
.tear[aria-pressed="true"] .ts { color: var(--hq-d); }
/* 装裱三纸 */
.mounts { display: flex; gap: 8px; padding: 2px 8px 4px; }
.mount {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 7px 4px 6px; border: 1px solid transparent; border-radius: var(--r-s-hand);
  background: none; font-size: 12px; color: var(--ink3);
  transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
}
.mount span { font-family: var(--f-d); }
.mount:hover { color: var(--ink2); background: rgba(38, 37, 32, .04); }
.mount[aria-pressed="true"] { border-color: var(--hq); color: var(--hq-d); background: var(--hq-t); }
/* 板块显隐小圆点 */
.mini-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--hq); }
@media (max-width: 1020px) {
  .paper-menu { position: fixed; left: 12px; right: 12px; top: 64px; width: auto; }
}
</style>
