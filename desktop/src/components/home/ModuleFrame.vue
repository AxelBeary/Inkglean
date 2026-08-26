<script setup lang="ts">
// 模块沙箱帧（档②波17 四件）：规范 §六硬契约的运行时载体。
// 帧形态：data: URL 的 opaque origin iframe + sandbox="allow-scripts"（无 allow-same-origin
// → 帧内无 localStorage/cookie、与壳零同源身份）；帧级 CSP 物理断网（frame.ts MODULE_CSP）。
// 保险丝（§六-5 + 拍板二/三数字）：加载 5 秒未 ready → 灰牌；心跳 5 秒一拍失联 3 次 → 杀帧置灰，
// 灰牌可重试一次，再崩转停用态展示。坏模块永不拖垮首页。
// 桥（§六-4）：握手口令 + 信封 {id, type, payload, token}，origin/source 双重校验，
// 白名单外类型丢弃并记违规（10 次/24h 达阈单独停用）。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ModuleEntry } from '../../modules/registry'
import { buildFrameSrc, collectThemeCss, verifyEnvelope, isBridgeType, newToken } from '../../modules/frame'
import { LOAD_TIMEOUT_MS, HEARTBEAT_INTERVAL_MS, HEARTBEAT_MISS_LIMIT, MODULE_STORAGE_QUOTA_BYTES } from '../../modules/manifest'
import { buildViewData } from '../../modules/viewData'
import type { ViewSources } from '../../modules/viewData'
import { useModulesStore } from '../../modules/store'
import { useLocalLedgerStore } from '../../stores/localLedger'
import { useAutoTimeStore } from '../../stores/autoTime'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{
  entry: ModuleEntry
  code: string
}>()

const modulesStore = useModulesStore()
const ledger = useLocalLedgerStore()
const autoTime = useAutoTimeStore()
const auth = useAuthStore()

const moduleId = computed(() => props.entry.manifest?.id ?? props.entry.dirName)

// ─── 帧装载：每帧一次性握手口令 + 主题 token 注入 ───
const token = ref(newToken())
const frameSrc = computed(() => buildFrameSrc(props.code, collectThemeCss()))
const iframeRef = ref<HTMLIFrameElement | null>(null)

// ─── 保险丝状态机 ───
const phase = ref<'loading' | 'ok' | 'grey'>('loading')
const missCount = ref(0)
const retried = ref(false)
let readyTimer: ReturnType<typeof setTimeout> | null = null
let beatTimer: ReturnType<typeof setInterval> | null = null
let beatSeen = false

function clearTimers() {
  if (readyTimer) { clearTimeout(readyTimer); readyTimer = null }
  if (beatTimer) { clearInterval(beatTimer); beatTimer = null }
}

function killToGrey() {
  clearTimers()
  phase.value = 'grey'
}

function retryOnce() {
  if (retried.value) return
  retried.value = true
  token.value = newToken() // 重试换新口令（旧帧令牌作废）
  missCount.value = 0
  phase.value = 'loading'
  armReadyTimeout()
}

function armReadyTimeout() {
  if (readyTimer) clearTimeout(readyTimer)
  readyTimer = setTimeout(() => {
    if (phase.value === 'loading') killToGrey() // 加载超时 → 灰牌（拍板三采纳）
  }, LOAD_TIMEOUT_MS)
}

function startHeartbeatWatch() {
  if (beatTimer) clearInterval(beatTimer)
  beatSeen = true // ready 视为第一拍
  beatTimer = setInterval(() => {
    if (phase.value !== 'ok') return
    if (!beatSeen) {
      missCount.value++
      if (missCount.value >= HEARTBEAT_MISS_LIMIT) killToGrey()
    } else {
      missCount.value = 0
    }
    beatSeen = false
  }, HEARTBEAT_INTERVAL_MS)
}

// ─── 帧回复 ───
function reply(reqId: string, type: string, payload: unknown) {
  iframeRef.value?.contentWindow?.postMessage({ id: reqId, type, payload, token: token.value }, '*')
}

// ─── 私有存储（write.own）：壳侧命名空间代管，配额 5MB（拍板二） ───
const STORAGE_NS = computed(() => `shihui-module-storage:${moduleId.value}`)

function storageRead(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_NS.value)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storageWrite(payload: unknown): boolean {
  try {
    const text = JSON.stringify(payload ?? null)
    if (new Blob([text]).size > MODULE_STORAGE_QUOTA_BYTES) {
      modulesStore.reportViolation(moduleId.value) // 超配额拒写记违规（不停用）
      return false
    }
    localStorage.setItem(STORAGE_NS.value, text)
    return true
  } catch {
    return false
  }
}

// ─── 视图数据供给：只给声明过的视图（防借道条款：订阅须自身持有声明） ───
function viewSources(): ViewSources {
  return {
    ledger: ledger.orders,
    time: { today: autoTime.today, week: autoTime.week },
    mode: auth.mode
  }
}

function declaredViews(): string[] {
  return props.entry.manifest?.data.views ?? []
}

// ─── 桥消息分派 ───
function onMessage(e: MessageEvent) {
  if (iframeRef.value && e.source !== iframeRef.value.contentWindow) return
  const env = verifyEnvelope(e.data, token.value)
  if (!env) {
    // 形状非法/口令不符：不是本帧消息则忽略；本帧发来的口令不符记违规
    if (iframeRef.value && e.source === iframeRef.value.contentWindow && e.data && typeof e.data === 'object') {
      modulesStore.reportViolation(moduleId.value)
    }
    return
  }
  if (!isBridgeType(env.type)) {
    modulesStore.reportViolation(moduleId.value) // 白名单外类型：丢弃记违规
    return
  }
  switch (env.type) {
    case 'shihui/ready':
      phase.value = 'ok'
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null }
      startHeartbeatWatch()
      break
    case 'shihui/heartbeat':
      beatSeen = true
      break
    case 'shihui/view-data': {
      const req = env.payload as { view?: string } | null
      const view = req?.view ?? ''
      if (!declaredViews().includes(view)) {
        modulesStore.reportViolation(moduleId.value) // 未声明视图：拒发记违规
        reply(env.id, `shihui/view-data:${env.id}`, null)
        break
      }
      reply(env.id, `shihui/view-data:${env.id}`, buildViewData(view, viewSources()))
      break
    }
    case 'shihui/storage-read':
      if (!props.entry.manifest?.data.write.own) {
        modulesStore.reportViolation(moduleId.value)
        reply(env.id, `shihui/storage-read:${env.id}`, null)
        break
      }
      reply(env.id, `shihui/storage-read:${env.id}`, storageRead())
      break
    case 'shihui/storage-write':
      if (!props.entry.manifest?.data.write.own) {
        modulesStore.reportViolation(moduleId.value)
        reply(env.id, `shihui/storage-write:${env.id}`, false)
        break
      }
      reply(env.id, `shihui/storage-write:${env.id}`, storageWrite(env.payload))
      break
    case 'shihui/error':
      // eslint-disable-next-line no-console -- 模块自报错情诊断日志（diagnostics 口径，仅本机）
      console.warn(`[module:${moduleId.value}]`, env.payload)
      break
  }
}

function onFrameLoad() {
  // 帧装载即发握手（模块脚本先于握手监听就绪，握手消息走 message 队列不会丢）
  iframeRef.value?.contentWindow?.postMessage(
    { type: 'shihui/handshake', payload: { token: token.value } },
    '*'
  )
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  armReadyTimeout()
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  clearTimers()
})
</script>

<template>
  <div
    class="mframe"
    :class="`mframe--${phase} ${entry.manifest?.ui.heightRule === 'stretch' ? 'mframe--stretch' : 'mframe--fixed'}`"
  >
    <iframe
      v-if="phase !== 'grey'"
      ref="iframeRef"
      :src="frameSrc"
      sandbox="allow-scripts"
      class="mframe-iframe"
      :title="entry.manifest?.name ?? moduleId"
      @load="onFrameLoad"
    />
    <div v-if="phase === 'grey'" class="grey-card">
      <span class="g-title">{{ entry.manifest?.name ?? moduleId }} · 无响应</span>
      <span class="g-desc">保险丝已杀帧（心跳失联/加载超时），坏模块不拖垮首页</span>
      <button v-if="!retried" type="button" class="g-retry" @click="retryOnce">重试一次</button>
      <span v-else class="g-desc">再次崩溃已转停用，可到模块管理页处理</span>
    </div>
    <span v-if="phase === 'loading'" class="load-hint">模块装载中…</span>
  </div>
</template>

<style scoped>
.mframe { position: relative; width: 100%; }
.mframe--fixed { height: 150px; }
.mframe--stretch { height: 220px; }
.mframe-iframe { width: 100%; height: 100%; border: 0; display: block; }
.load-hint {
  position: absolute; inset: auto 0 4px; text-align: center;
  font-size: 11px; color: var(--ink4); pointer-events: none;
}
.grey-card {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: var(--paper2); border: 1px dashed var(--line2); border-radius: var(--r-s-hand);
}
.g-title { font-size: 13px; font-weight: 600; color: var(--ink3); }
.g-desc { font-size: 11.5px; color: var(--ink4); }
.g-retry {
  font-size: 12px; color: var(--ink2); padding: 4px 14px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand); background: var(--card);
}
.g-retry:hover { color: var(--ink); border-color: var(--ink4); }
</style>
