<script setup lang="ts">
// 状态挂牌（题签壳控件，不是板块；§4.2 拍板：本地模式整体不渲染，由 Home 渲染前过滤）
// 三态翻牌：可约稿（open）/ 已约满（full）/ 休息中（break）；slotDisplay=「本月已约满」时 open 以 full 口径显示。
// 断网纪律：翻牌本地记住最新状态（localStorage），恢复在线后静默重试同步一次，失败不提示。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { updatePlaqueStatus } from '../../api/artist'
import type { ArtistStatus } from '../../api/types'

const props = defineProps<{
  /** 云端档案当前状态（fetchProfile 结果；未取到为 null → 用本地记忆/默认） */
  initialStatus?: ArtistStatus | null
  /** 名额口径：「本月已约满」时 open 以 full 口径显示 */
  slotDisplay?: string | null
}>()

type PlaqueState = 'open' | 'full' | 'break'
const CYCLE: PlaqueState[] = ['open', 'full', 'break']
const STORAGE_KEY = 'shihui-desktop-plaque-v1'
const LABEL: Record<PlaqueState, string> = { open: '开稿中', full: '已约满', break: '休息中' }

function isPlaqueState(v: unknown): v is PlaqueState {
  return v === 'open' || v === 'full' || v === 'break'
}

function loadLocal(): PlaqueState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw && isPlaqueState(raw) ? raw : null
  } catch {
    return null
  }
}

const current = ref<PlaqueState>(loadLocal() ?? 'open')
const userFlipped = ref(false) // 本会话翻过牌 → 档案回包不再覆盖画师最新意图
const pressed = ref(false)    // 翻牌动画进行中
const noAnim = ref(false)     // 动画收尾时瞬时复位，防止回翻
const liveMsg = ref('')
let pendingSync: PlaqueState | null = null

// 档案数据异步到位：未翻过牌时采纳云端口径
watch(() => props.initialStatus, v => {
  if (!userFlipped.value && isPlaqueState(v)) current.value = v
})

const slotFull = computed(() => props.slotDisplay === '本月已约满')
/** 显示口径：名额满时 open 以 full 显示（状态本体不变） */
const displayed = computed<PlaqueState>(() =>
  current.value === 'open' && slotFull.value ? 'full' : current.value
)
const next = computed<PlaqueState>(() => CYCLE[(CYCLE.indexOf(current.value) + 1) % CYCLE.length])

function persist(s: PlaqueState) {
  try { localStorage.setItem(STORAGE_KEY, s) } catch { /* 本地记忆非关键路径 */ }
}

function sync(s: PlaqueState) {
  pendingSync = s
  if (!navigator.onLine) return // 断网：只记本地，恢复在线静默重试
  updatePlaqueStatus(s)
    .then(() => { pendingSync = null })
    .catch(() => { /* 同步失败不提示，等恢复在线重试 */ })
}

function onOnline() {
  if (pendingSync !== null) {
    const s = pendingSync
    pendingSync = null
    updatePlaqueStatus(s).catch(() => { /* 重试失败不提示（拍板纪律） */ })
  }
}

function flip() {
  if (pressed.value) return
  const target = next.value
  userFlipped.value = true
  pressed.value = true
  // 翻面动画（350ms）到位后换面瞬时复位，视觉上是连续翻牌
  window.setTimeout(() => {
    noAnim.value = true
    current.value = target
    pressed.value = false
    requestAnimationFrame(() => { noAnim.value = false })
  }, 360)
  persist(target)
  sync(target)
  liveMsg.value = `已切换为${LABEL[target]}`
}

onMounted(() => window.addEventListener('online', onOnline))
onUnmounted(() => window.removeEventListener('online', onOnline))
</script>

<template>
  <button
    type="button"
    class="sign"
    :class="{ 'sign--noanim': noAnim }"
    :aria-pressed="pressed"
    :aria-label="`状态挂牌：当前${LABEL[displayed]}，点击翻牌切换`"
    @click="flip"
  >
    <span class="sign-inner">
      <span class="face front"><i class="pt" :class="displayed" aria-hidden="true"></i>{{ LABEL[displayed] }}</span>
      <span class="face back"><i class="pt" :class="next" aria-hidden="true"></i>{{ LABEL[next] }}</span>
    </span>
  </button>
  <span class="vh" aria-live="polite">{{ liveMsg }}</span>
</template>

<style scoped>
/* 照原型移植：全页唯一仪式感，翻牌 3D 折面 + 上端绳孔 */
.sign { perspective: 600px; display: inline-block; }
.sign-inner {
  position: relative; display: flex; align-items: center; justify-content: center;
  min-width: 88px; height: 42px; padding: 0 14px;
  background: var(--card); border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  box-shadow: 0 2px 5px -2px rgba(var(--ink-rgb), .35);
  transform-style: preserve-3d; transition: transform var(--dur-slow) var(--ease-out);
}
.sign--noanim .sign-inner { transition: none; }
.sign-inner::before {
  content: ""; position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
  width: 7px; height: 7px; border-radius: 50%; background: var(--line2); box-shadow: 0 0 0 2px var(--paper);
}
.face {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 7px;
  font-family: var(--f-d); font-size: 15px; font-weight: 600; letter-spacing: .14em;
  backface-visibility: hidden;
}
.face .pt { width: 7px; height: 7px; border-radius: 50%; }
.front { color: var(--ink); }
.front .pt.open { background: var(--hq); }
.front .pt.full { background: var(--th); }
.front .pt.break { background: var(--buf); }
.back { color: var(--ink2); transform: rotateY(180deg); }
.back .pt.open { background: var(--hq); }
.back .pt.full { background: var(--th); }
.back .pt.break { background: var(--buf); }
.sign[aria-pressed="true"] .sign-inner { transform: rotateY(180deg); }
.sign:hover .sign-inner { border-color: var(--ink4); }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: reduce) {
  .sign-inner { transition: none; }
}
</style>
