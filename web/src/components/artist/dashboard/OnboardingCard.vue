<template>
  <!-- REQ-043 I2: 开张任务卡——三步开张（传作品/设档位/分享主页）
       隐藏判定以后端标记为准（dismissed=「不再提示」；必做两项全完成=自然达成，后端写 onboarded_at） -->
  <el-card v-if="visible" class="onboarding-card">
    <template #header>
      <CardHead :title="$t('onboarding.title')">
        <template #extra>
          <el-button text size="small" class="ob-dismiss" @click="dismiss">{{ $t('onboarding.dismiss') }}</el-button>
        </template>
      </CardHead>
    </template>
    <p class="ob-subtitle">{{ $t('onboarding.subtitle') }}</p>
    <p class="ob-progress" aria-live="polite">{{ $t('onboarding.progress', { done: doneCount, total: 3 }) }}</p>
    <div class="ob-progress-bar" aria-hidden="true">
      <span class="ob-progress-fill" :style="{ width: progressPct + '%' }"></span>
    </div>
    <div class="ob-tasks">
      <button type="button" class="ob-task" :class="{ 'ob-task--done': done('artwork') }" @click="goTask('artwork')">
        <span class="ob-check" aria-hidden="true">{{ done('artwork') ? '✓' : '' }}</span>
        <el-icon class="ob-icon"><Picture /></el-icon>
        <span class="ob-label">{{ $t('onboarding.artwork') }}</span>
        <span v-if="!done('artwork')" class="ob-action">{{ $t('onboarding.gotoArtworks') }}</span>
      </button>
      <button type="button" class="ob-task" :class="{ 'ob-task--done': done('tier') }" @click="goTask('tier')">
        <span class="ob-check" aria-hidden="true">{{ done('tier') ? '✓' : '' }}</span>
        <el-icon class="ob-icon"><Money /></el-icon>
        <span class="ob-label">{{ $t('onboarding.tier') }}</span>
        <span v-if="!done('tier')" class="ob-action">{{ $t('onboarding.gotoTiers') }}</span>
      </button>
      <!-- share=建议项：复制主页链接（后端无信号，恒未勾选；点复制不要求重载） -->
      <button type="button" class="ob-task" :class="{ 'ob-task--copied': copied }" @click="sharePage">
        <span class="ob-check" aria-hidden="true"></span>
        <el-icon class="ob-icon"><Share /></el-icon>
        <span class="ob-label">{{ $t('onboarding.share') }}</span>
        <span class="ob-action">{{ copied ? $t('onboarding.copied') : $t('onboarding.shareBtn') }}</span>
      </button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Picture, Money, Share } from '@element-plus/icons-vue'
import CardHead from '../visual/CardHead.vue'
import { artistApi } from '../../../api/index.js'
import type { OnboardingState } from '../../../api/types.js'
import { useArtistStore } from '../../../stores/artist.js'
import { trackEvent } from '../../../utils/track.js'
// 波3-2: 剪贴板抽公共（clipboard 优先 + execCommand 回退，失败返回 false 不抛）
import { copyText } from '../../../utils/clipboard.js'

const router = useRouter()
const store = useArtistStore()

const state = ref<OnboardingState | null>(null)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 隐藏判定：
 *  - dismissed（「不再提示」后端标记，换设备也不显示）
 *  - 必做项 artwork + tier 全完成（share 为建议项，不参与完成判定；后端已写 onboarded_at）
 */
const visible = computed(() => {
  if (!state.value) return false
  if (state.value.dismissed) return false
  const artwork = state.value.tasks.find(task => task.key === 'artwork')?.done ?? false
  const tier = state.value.tasks.find(task => task.key === 'tier')?.done ?? false
  return !(artwork && tier)
})

const doneCount = computed(() => state.value?.tasks.filter(task => task.done).length ?? 0)
/** 进度条宽度（纯展示，不改判定逻辑） */
const progressPct = computed(() => Math.round((doneCount.value / 3) * 100))

function done(key: OnboardingState['tasks'][number]['key']): boolean {
  return state.value?.tasks.find(task => task.key === key)?.done ?? false
}

async function load() {
  try {
    state.value = await artistApi.getOnboarding()
    // REQ-033 埋点：展示（事件名 onboarding_view 待后端 EVENT_WHITELIST 扩容，当前会被 400 丢弃，不阻塞）
    if (visible.value) trackEvent('onboarding_view', { page: '/dashboard' })
  } catch {
    /* 失败静默：任务卡非关键路径 */
  }
}

function goTask(key: 'artwork' | 'tier') {
  // REQ-033 埋点：任务点击（事件名 onboarding_task_click 待白名单扩容，同上）
  trackEvent('onboarding_task_click', { task: key })
  router.push(key === 'artwork' ? '/artworks' : '/tiers')
}

async function sharePage() {
  // REQ-033 埋点：任务点击（share 复用同一事件名，带 task=share）
  trackEvent('onboarding_task_click', { task: 'share' })
  const url = `${window.location.origin}/artist/${store.subdomain}`
  const ok = await copyText(url)
  if (!ok) return
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

async function dismiss() {
  // REQ-033 埋点：关闭（事件名 onboarding_dismiss 待白名单扩容，同上）
  trackEvent('onboarding_dismiss')
  try {
    await artistApi.dismissOnboarding()
  } catch {
    /* 后端标记失败不阻塞：下次进入仍会展示 */
  }
  state.value = state.value ? { ...state.value, dismissed: true } : { dismissed: true, tasks: [] }
}

onMounted(load)
onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<style scoped>
.onboarding-card {
  background: var(--card);
  border: none;
  border-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  box-shadow: var(--sh-2);
}
.ob-subtitle {
  margin: 0 0 8px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  line-height: 1.6;
}
.ob-progress {
  margin: 0 0 10px;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
}
/* 墨线进度条：--line 底 + --sl 填充，宽度随任务数过渡 */
.ob-progress-bar {
  height: 7px; margin: 0 0 12px;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
}
.ob-progress-fill {
  display: block; height: 100%;
  background: var(--sl);
  border-radius: inherit;
  transition: width var(--dur-slow) var(--ease-out);
}
.ob-tasks {
  display: flex;
  flex-direction: column;
}
.ob-task {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 10px;
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-family: var(--f-b);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast) var(--ease-out);
}
.ob-task:last-child { border-bottom: none; }
.ob-task:hover { background: var(--paper2); }
.ob-task--done { opacity: .45; cursor: default; }
.ob-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  border: 1px solid var(--line2);
  border-radius: 50%;
  color: #fff;
  font-size: calc(var(--font-scale, 1) * 11px);
}
.ob-task--done .ob-check {
  background: var(--sl);
  border-color: var(--sl);
}
.ob-icon { font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink2); flex: none; }
.ob-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-action {
  flex: none;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--hq);
}
.ob-task--copied .ob-action { color: var(--sl); }
.ob-dismiss {
  color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 11.5px);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--ink3) 45%, transparent);
  text-underline-offset: 3px;
  transition: color var(--dur-fast);
}
.ob-dismiss:hover { color: var(--ink); }
</style>
