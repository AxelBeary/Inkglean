<template>
  <!-- 818-E: 开张任务卡改造为导览入口卡
       保留简短欢迎 + 「跟我逛一遍后台」主按钮（随时重启 tour = 重置入口）；
       原 3 条静态指引（传作品/设档位/分享）已升级为分步高亮导览，不再逐条陈列。
       隐藏判定仍以后端标记为准（dismissed / 必做两项全完成）。 -->
  <el-card v-if="visible" class="onboarding-card">
    <template #header>
      <CardHead :title="$t('onboarding.title')">
        <template #extra>
          <el-button text size="small" class="ob-dismiss" @click="dismiss">{{ $t('onboarding.dismiss') }}</el-button>
        </template>
      </CardHead>
    </template>
    <p class="ob-subtitle">{{ $t('onboarding.subtitle') }}</p>
    <button type="button" class="ob-tour-btn" @click="startTour">
      <el-icon class="ob-tour-icon"><Guide /></el-icon>
      <span>{{ $t('onboarding.tourBtn') }}</span>
    </button>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Guide } from '@element-plus/icons-vue'
import CardHead from '../visual/CardHead.vue'
import { artistApi } from '../../../api/index.js'
import type { OnboardingState } from '../../../api/types.js'
import { trackEvent } from '../../../utils/track.js'
import { useTour } from '../../../composables/useTour'

const tour = useTour()
const state = ref<OnboardingState | null>(null)

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

async function load() {
  try {
    state.value = await artistApi.getOnboarding()
    // REQ-033 埋点：展示（事件名 onboarding_view 待后端 EVENT_WHITELIST 扩容，当前会被 400 丢弃，不阻塞）
    if (visible.value) {
      trackEvent('onboarding_view', { page: '/dashboard' })
      maybeAutoStartTour()
    }
  } catch {
    /* 失败静默：任务卡非关键路径 */
  }
}

/** 首次进入仪表盘自动启动（localStorage 标记；已看过或正在播放时不重复弹） */
function maybeAutoStartTour() {
  if (!tour.hasSeen() && !tour.active.value) {
    tour.start()
  }
}

/** 主按钮 = 重置入口：已看过也能随时再看一遍 */
function startTour() {
  // REQ-033 埋点：导览手动启动（事件名 tour_start 待白名单扩容，同上不阻塞）
  trackEvent('tour_start')
  tour.start()
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
</script>

<style scoped>
.onboarding-card {
  /* 既有「手剪不规则角」设计收敛为组件级变量：取值与原卡一致，见 818-E 交付报告人工核验项 */
  --ob-card-radius: 6px 14px 7px 15px / 13px 7px 15px 6px;
  background: var(--card);
  border: none;
  border-radius: var(--ob-card-radius);
  box-shadow: var(--sh-2);
}
.ob-subtitle {
  margin: 0 0 12px;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink2);
  line-height: 1.6;
}
.ob-tour-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--hq);
  border-radius: var(--r-m);
  background: var(--hq);
  color: #fff;
  font-family: var(--f-b);
  font-size: calc(var(--font-scale, 1) * 13px);
  cursor: pointer;
  transition: background-color var(--dur-fast), border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.ob-tour-btn:hover {
  background: var(--hq-d);
  border-color: var(--hq-d);
  box-shadow: var(--sh-1);
}
.ob-tour-btn:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}
.ob-tour-icon {
  font-size: calc(var(--font-scale, 1) * 15px);
}
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
