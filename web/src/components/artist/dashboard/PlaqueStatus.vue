<template>
  <!-- 挂牌+名额（视觉批 P1，提案 §5.3）：可约稿⇄休息中 Y 轴翻牌（绳不离钉），
       牌下名额条（满额藤黄）。整块名额点击进开稿管理。
       E2：名额满时开稿面直接显「满」（藤黄点缀）——满态是开稿面的显示变体，
       不新增第三面牌，翻面开关逻辑不变。 -->
  <div class="plaque-card">
    <div class="plaque-nail" aria-hidden="true"></div>
    <div class="plaque-hang" :class="{ swinging: swingOn }">
      <span class="rope rope-l" ref="ropeL" aria-hidden="true"></span>
      <span class="rope rope-r" ref="ropeR" aria-hidden="true"></span>
      <button
        class="plaque"
        :class="{ flipped: isBreak, sheen: sheenOn }"
        type="button"
        :aria-pressed="isBreak"
        :title="isBreak ? t('dashboard.plaqueHintBreak') : t('dashboard.plaqueHintOpen')"
        :disabled="busy"
        @click="toggleStatus"
      >
        <span class="plaque-3d" ref="plaque3d">
          <span class="plaque-face face-open" :class="{ 'face-full': isFull }">
            <span class="p-dot" aria-hidden="true"></span>
            <span class="p-main f-kai">{{ isFull ? t('dashboard.plaqueFullChar') : t('dashboard.statusOpen') }}</span>
            <span class="p-sub">{{ t('dashboard.plaqueHintOpen') }}</span>
          </span>
          <span class="plaque-face face-closed">
            <span class="p-dot" aria-hidden="true"></span>
            <span class="p-main f-kai">{{ t('dashboard.statusBreak') }}</span>
            <span class="p-sub">{{ t('dashboard.plaqueHintBreak') }}</span>
          </span>
        </span>
      </button>
    </div>

    <!-- 名额：整块可点进 /slots（对齐 SlotOverview 数据口径） -->
    <button class="slot-block" :class="{ 'is-full': isFull }" type="button" @click="goSlots">
      <span class="slot-top">
        <span>
          {{ slotDisplay || t('dashboard.slotCombined', { used: usedCount, total: totalCapacity }) }}
          <span v-if="isFull" class="slot-full-tag">{{ t('dashboard.statusFull') }}</span>
        </span>
        <span class="slot-arrow" aria-hidden="true">→</span>
      </span>
      <span v-if="limitEnabled" class="slot-row">
        <span v-if="quotaOnly">{{ quotaUsed }} / {{ quotaTotal }}</span>
        <span v-else>{{ usedCount }} / {{ totalCapacity }}</span>
        <span class="slot-bar"><span class="slot-fill" :class="{ 'slot-fill--full': isFull }" :style="{ width: (quotaOnly ? quotaPct : usedPct) + '%' }"></span></span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useArtistStore } from '../../../stores/artist'
import { artistApi } from '../../../api/index'

const { t } = useI18n()
const router = useRouter()

// artist store 尚为 JS（增量迁移中），此处以轻量接口桥接，不引入 any
interface QuotaInfoLite {
  used: number
  quota: number | null
  remaining: number | null
}
interface ArtistProfileLite {
  status?: string
  batch_limit?: number | null
  buffer_limit?: number | null
  monthly_quota?: number | null
  slotDisplay?: string | null
  quotaInfo?: QuotaInfoLite | null
}
const store = useArtistStore() as { profile: ArtistProfileLite | null }

// ─── 状态（open/break，与 QuickActions 开关同款数据源 store.profile.status） ───
const isBreak = computed(() => store.profile?.status === 'break')
const busy = ref(false)
const swingOn = ref(false)
const sheenOn = ref(false)
const plaque3d = ref<HTMLElement | null>(null)
const ropeL = ref<HTMLElement | null>(null)
const ropeR = ref<HTMLElement | null>(null)
let syncRaf = 0

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ─── 名额（口径同 SlotOverview：正式+候补 / batch_limit+buffer_limit） ───
const formalCount = ref(0)
const bufferCount = ref(0)
const batchLimit = computed(() => Number(store.profile?.batch_limit ?? 0))
const bufferLimit = computed(() => Number(store.profile?.buffer_limit ?? 0))
const slotDisplay = computed(() => store.profile?.slotDisplay ?? null)
const limitEnabled = computed(() =>
  store.profile?.batch_limit != null || store.profile?.monthly_quota != null
)
const usedCount = computed(() => formalCount.value + bufferCount.value)
const totalCapacity = computed(() => batchLimit.value + bufferLimit.value)
// E2 补全（清扫批）：满态双轴——席位满（旧口径）或月度额度耗尽（quotaInfo 为 profile 端点清扫批补发，
// 与公开主页 getMonthlyUsage 同口径）；仅启用额度未启用席位时名额条改显额度用量
const quotaInfo = computed(() => store.profile?.quotaInfo ?? null)
const quotaOnly = computed(() => store.profile?.batch_limit == null && quotaInfo.value != null)
const quotaUsed = computed(() => quotaInfo.value?.used ?? 0)
const quotaTotal = computed(() => quotaInfo.value?.quota ?? 0)
const quotaPct = computed(() => {
  if (!quotaTotal.value) return 0
  return Math.min(100, Math.round((quotaUsed.value / quotaTotal.value) * 100))
})
const seatFull = computed(() => totalCapacity.value > 0 && usedCount.value >= totalCapacity.value)
const quotaFull = computed(() => {
  const q = quotaInfo.value
  return q != null && q.remaining != null && q.remaining <= 0
})
const isFull = computed(() => seatFull.value || quotaFull.value)
const usedPct = computed(() => {
  if (!totalCapacity.value) return 0
  return Math.min(100, Math.round((usedCount.value / totalCapacity.value) * 100))
})

async function loadSlots() {
  try {
    const [formal, buffer] = await Promise.all([
      artistApi.getQueue(),
      artistApi.getQueue('buffer')
    ])
    formalCount.value = (formal || []).length
    bufferCount.value = (buffer || []).length
  } catch { /* 静默降级：名额条不显数字，不阻塞挂牌 */ }
}

// ─── 翻牌物理：绳角 = atan(挂点半宽·cosθ / 绳长)，rAF 与 CSS 过渡同帧同步 ───
const ATTACH_HALF = 44
const ROPE_LEN = 58
function syncRopes() {
  const el = plaque3d.value
  if (!el || !ropeL.value || !ropeR.value) return
  const tr = getComputedStyle(el).transform
  if (!tr || tr === 'none') return
  const m = new DOMMatrixReadOnly(tr)
  const cos = Math.max(-1, Math.min(1, m.m11))
  const ang = Math.atan2(ATTACH_HALF * cos, ROPE_LEN) * 180 / Math.PI
  ropeL.value.style.transform = `translateX(-50%) rotate(${ang}deg)`
  ropeR.value.style.transform = `translateX(-50%) rotate(${-ang}deg)`
}
function animateRopes() {
  if (reducedMotion) { syncRopes(); return }
  cancelAnimationFrame(syncRaf)
  const t0 = performance.now()
  const frame = () => {
    syncRopes()
    if (performance.now() - t0 < 780) syncRaf = requestAnimationFrame(frame)
    else syncRopes()
  }
  syncRaf = requestAnimationFrame(frame)
}

// ─── 开关稿：updateProfile({ status })，成功后翻牌 ───
async function toggleStatus() {
  if (busy.value) return
  busy.value = true
  const next = isBreak.value ? 'open' : 'break'
  try {
    await artistApi.updateProfile({ status: next })
    if (store.profile) store.profile.status = next
    sheenOn.value = false
    void document.body.offsetWidth
    sheenOn.value = true
    swingOn.value = false
    void document.body.offsetWidth
    swingOn.value = true
    animateRopes()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = false
  }
}

function goSlots() { router.push('/slots') }

onUnmounted(() => cancelAnimationFrame(syncRaf)) // a1: 卸载后 rAF 循环不得继续写已脱离 DOM 的 ref 样式

onMounted(() => {
  loadSlots()
  syncRopes()
})
</script>

<style scoped>
/* ─── 挂牌+名额（原型 v0.9 移植，纸墨 token） ─── */
.plaque-card {
  background: var(--card); padding: calc(var(--font-scale, 1) * 18px) calc(var(--font-scale, 1) * 20px) calc(var(--font-scale, 1) * 14px);
  text-align: center; position: relative;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
  /* 822 批：配合 Dashboard panel--stretch 与问候卡同行等高——填满面板，整套挂牌垂直居中 */
  height: 100%; display: flex; flex-direction: column; justify-content: center;
}
.plaque-nail {
  width: 12px; height: 12px; margin: 0 auto; border-radius: 50%; position: relative; z-index: 4;
  background: radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--ink) 40%, var(--paper)), color-mix(in srgb, var(--ink) 78%, var(--paper)));
  box-shadow: 0 1px 3px rgba(0, 0, 0, .35), inset 0 -1px 1px rgba(255, 255, 255, .25);
}
.plaque-hang { position: relative; width: 224px; margin: -4px auto 0; height: 180px; transform-origin: 50% 6px; }
.plaque-hang.swinging { animation: pendulum 1.35s var(--ease-out); }
@keyframes pendulum {
  0% { transform: rotate(0); } 26% { transform: rotate(-2.6deg); }
  55% { transform: rotate(1.7deg); } 80% { transform: rotate(-.7deg); } 100% { transform: rotate(0); }
}
.rope {
  position: absolute; top: 6px; left: 50%; width: 2.5px; height: 58px; z-index: 1;
  transform-origin: 50% 0; border-radius: 2px;
  background: repeating-linear-gradient(105deg,
    color-mix(in srgb, var(--zhe) 72%, var(--ink)) 0 2px,
    color-mix(in srgb, var(--zhe) 48%, var(--ink)) 2px 3.5px);
  box-shadow: .5px .5px 0 color-mix(in srgb, var(--ink) 30%, transparent);
}
.rope-l { transform: translateX(-50%) rotate(37deg); }
.rope-r { transform: translateX(-50%) rotate(-37deg); }
.plaque {
  position: absolute; top: 48px; left: 50%; margin-left: -108px; width: 216px; height: 120px;
  perspective: 760px; background: none; border: none; padding: 0; cursor: pointer; display: block; z-index: 2;
  filter: drop-shadow(0 13px 11px rgba(38, 37, 30, .2));
}
.plaque:disabled { cursor: default; }
[data-theme="ink"] .plaque { filter: drop-shadow(0 13px 13px rgba(0, 0, 0, .5)); }
.plaque-3d {
  width: 100%; height: 100%; position: relative; display: block;
  transform-style: preserve-3d; transition: transform .72s cubic-bezier(.45, .05, .3, 1);
}
.plaque.flipped .plaque-3d { transform: rotateY(180deg); }
.plaque-face {
  position: absolute; inset: 0; backface-visibility: hidden; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: linear-gradient(178deg, color-mix(in srgb, var(--card) 92%, var(--zhe) 8%), var(--card) 34%, color-mix(in srgb, var(--card) 94%, var(--ink) 6%));
  border: 1px solid var(--line2);
  border-radius: 7px 13px 8px 12px / 12px 8px 13px 7px;
}
/* 翻牌光带 */
.plaque-face::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: linear-gradient(105deg, transparent 42%, var(--sheen, rgba(255, 255, 255, .3)) 50%, transparent 58%);
  background-size: 260% 100%; background-position: 130% 0;
}
.plaque.sheen .plaque-face::after { animation: sheen-sweep .72s ease-out forwards; }
@keyframes sheen-sweep { 0% { opacity: 1; background-position: 130% 0; } 100% { opacity: 0; background-position: -40% 0; } }
.plaque-face.face-closed { transform: rotateY(180deg); }
.p-main { font-size: calc(var(--font-scale, 1) * 25px); letter-spacing: .3em; padding-left: .3em; display: block; white-space: nowrap; }
.p-sub { font-size: calc(var(--font-scale, 1) * 12px); letter-spacing: .1em; color: var(--ink3); display: block; white-space: nowrap; }
.face-open { color: var(--sl); }
.face-closed { color: var(--zs); }
/* E2：满态=开稿面显示变体（藤黄点缀，语义对齐名额条 slot-full-tag） */
.face-open.face-full { color: var(--th); }
.face-open.face-full .p-dot { background: var(--th); box-shadow: 0 0 0 4px var(--th-t); }
.p-dot { width: 8px; height: 8px; border-radius: 50%; position: absolute; top: 12px; right: 15px; display: block; }
.face-open .p-dot { background: var(--sl); box-shadow: 0 0 0 4px var(--sl-t); }
.face-closed .p-dot { background: var(--zs); box-shadow: 0 0 0 4px var(--zs-t); }
/* 名额块 */
.slot-block {
  margin-top: 8px; padding: 11px 10px 10px; border-top: 1px solid var(--line);
  display: block; width: 100%; font: inherit; text-align: left; cursor: pointer;
  background: none; border-left: none; border-right: none; border-bottom: none;
  border-radius: 0 0 6px 6px; transition: background var(--dur-mid) var(--ease-out);
}
.slot-block:hover { background: var(--hq-t); }
.slot-block:hover .slot-arrow { transform: translateX(3px); color: var(--hq); }
.slot-top { display: flex; align-items: baseline; justify-content: space-between; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); margin-bottom: 8px; }
.slot-arrow { color: var(--ink4); transition: transform var(--dur-mid) var(--ease-out), color var(--dur-mid); }
.slot-full-tag {
  font-size: 11px; color: var(--th); background: var(--th-t);
  padding: 1px 8px; border-radius: 3px 6px 4px 5px / 5px 4px 6px 3px; margin-left: 8px;
}
.slot-row { display: flex; align-items: center; gap: 10px; font-size: calc(var(--font-scale, 1) * 12.5px); color: var(--ink3); }
.slot-bar { flex: 1; height: 7px; border-radius: 999px; background: var(--paper2); border: 1px solid var(--line); overflow: hidden; display: block; }
.slot-fill {
  display: block; height: 100%;
  background: color-mix(in srgb, var(--hq) 62%, var(--paper));
  border-radius: 999px; transition: width .6s var(--ease-out), background .4s ease;
}
.slot-fill--full { background: var(--th); }
/* 窄屏：挂具收窄 */
@media (max-width: 960px) {
  .plaque-card { max-width: 340px; margin: 0 auto; width: 100%; }
  .plaque-hang { width: 200px; }
  .plaque { margin-left: -100px; width: 200px; }
}
@media (prefers-reduced-motion: reduce) {
  .plaque-3d { transition: none; }
  .plaque-hang.swinging, .plaque.sheen .plaque-face::after { animation: none; }
}
</style>
