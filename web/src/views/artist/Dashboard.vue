<template>
  <!-- Dashboard prefs 驱动重构（自定义首页批一·骨架批）：
       10 个板块（greet/plaque/stats/schedule/todo/guestbook/activity/announcement/onboarding/quick）
       按 prefs.order 顺序渲染，prefs.hidden 中的不渲染；width=full 横跨整行（grid-column: 1/-1），
       half 按顺序自动流进两列（保留 3fr/2fr 比例）；≤960px 单列堆叠。
       density（0/3/5）经 maxRows 作用于 todo/guestbook/activity 三个列表板块（组件内部截断）。
       批二内容本批不做：prefs.scheduleStyle/greetStyle/pageAlign/pageMax 与可选收入板块一律忽略。
       系统控制优先（拍板纪律）：820-L 留言总闸、announcement 无数据不渲染——用户自定义压不过。 -->
  <div class="dashboard">
    <div class="dash-grid">
      <div
        v-for="(panel, i) in layout"
        :key="panel.id"
        v-show="panel.id !== 'announcement' || annHasContent"
        class="panel enter-stagger"
        :class="{ 'panel--full': panel.width === 'full' }"
        :style="{ '--stagger': i }"
      >
        <GreetingNote v-if="panel.id === 'greet'" :stats="stats" />
        <PlaqueStatus v-else-if="panel.id === 'plaque'" />
        <StatCards v-else-if="panel.id === 'stats'" :stats="stats ?? undefined" />
        <ScheduleScroll v-else-if="panel.id === 'schedule'" />
        <LedgerTodo
          v-else-if="panel.id === 'todo'"
          :month-cents="stats?.monthRevenueCents ?? null"
          :max-rows="panel.maxRows"
        />
        <el-card v-else-if="panel.id === 'guestbook'">
          <template #header>
            <CardHead :title="t('dashboard.guestbookTitle')">
              <template #extra>
                <StatusChip v-if="guestbookCardRef?.pendingCount && guestbookCardRef.pendingCount > 0" type="pend">{{ guestbookCardRef.pendingCount }}</StatusChip>
              </template>
            </CardHead>
          </template>
          <GuestbookReviewCard ref="guestbookCardRef" :max-rows="panel.maxRows" />
        </el-card>
        <ActivityFeed v-else-if="panel.id === 'activity'" :max-rows="panel.maxRows" />
        <!-- 无公告数据时整块不渲染（v-show 按卡内 hasContent，不管用户怎么排） -->
        <DashboardAnnouncementCard v-else-if="panel.id === 'announcement'" ref="annCardRef" />
        <!-- 开张任务系统显隐逻辑在 OnboardingCard 内部（完成/dismiss 后消失），优先于用户自定义 -->
        <OnboardingCard v-else-if="panel.id === 'onboarding'" />
        <QuickActions v-else />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist'
import { artistApi } from '../../api/index'
import { subscribeReconnect } from '../../utils/reconnect'
import { resolveDashboardLayout } from '../../utils/dashboard-layout'
import type { ArtistStats, DashboardPrefs } from '../../api/types'
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
// 视觉批组件（问候贴纸/状态挂牌/排期卷轴/账本待办）
import GreetingNote from '../../components/artist/dashboard/GreetingNote.vue'
import PlaqueStatus from '../../components/artist/dashboard/PlaqueStatus.vue'
import ScheduleScroll from '../../components/artist/dashboard/ScheduleScroll.vue'
import LedgerTodo from '../../components/artist/dashboard/LedgerTodo.vue'
// 既有模块（P2 纸墨化）
import StatCards from '../../components/artist/dashboard/StatCards.vue'
import QuickActions from '../../components/artist/dashboard/QuickActions.vue'
import ActivityFeed from '../../components/artist/dashboard/ActivityFeed.vue'
import GuestbookReviewCard from '../../components/artist/dashboard/GuestbookReviewCard.vue'
// REQ-043 I2: 开张任务卡
import OnboardingCard from '../../components/artist/dashboard/OnboardingCard.vue'
// 自定义首页批一：公告独立板块（自 GreetingNote 公告行拆出）
import DashboardAnnouncementCard from '../../components/artist/dashboard/DashboardAnnouncementCard.vue'

const { t } = useI18n()
const store = useArtistStore()
// getStats 返回 ArtistStats（含 monthRevenueCents 等）
const stats = ref<ArtistStats | null>(null)

// ─── 自定义首页批一：布局偏好（失败静默回落默认布局，不破坏页面） ───
const prefs = ref<DashboardPrefs | null>(null)
async function loadPrefs(): Promise<void> {
  try {
    prefs.value = await artistApi.getDashboardPrefs()
  } catch {
    prefs.value = null // 回落默认布局（resolveDashboardLayout(null) = 默认 9 块）
  }
}

// 820-L 留言总闸：profile guestbookEnabled 关闭时强制隐藏留言板块——用户自定义显示也压不过总闸
const guestbookGated = computed(() =>
  (store.profile as { guestbook_enabled?: number } | null)?.guestbook_enabled === 0
)

/** 最终渲染序列：prefs 解析 → 系统控制优先过滤（旧 dashModules 开关已被 prefs 吞并，不再消费） */
const layout = computed(() =>
  resolveDashboardLayout(prefs.value).filter(p => !(p.id === 'guestbook' && guestbookGated.value))
)

// F4: 留言审核（pendingCount 徽标 + 重连重拉）
const guestbookCardRef = ref<{ pendingCount?: number; load: () => void } | null>(null)
// 公告板块：无公告数据时整个板块不渲染（系统控制优先于用户排序/显隐）
const annCardRef = ref<InstanceType<typeof DashboardAnnouncementCard> | null>(null)
const annHasContent = computed(() => annCardRef.value?.hasContent ?? false)

/** 仪表盘关键数据重拉 */
async function refreshAll() {
  try {
    await store.fetchProfile()
  } catch (err) {
    // eslint-disable-next-line no-console -- 重连刷新失败仅留痕，不阻塞模块
    console.warn('[Dashboard] fetchProfile failed:', err)
  }
  try { stats.value = await artistApi.getStats() } catch { /* 各模块自带错误态，此处静默 */ }
  // 批一：偏好重拉（失败静默回落，与首载同口径）
  await loadPrefs()
  // F4: 留言审核（独立失败，不阻塞其他模块）
  guestbookCardRef.value?.load()
}

let unsubscribeReconnect: (() => void) | null = null
onMounted(() => {
  refreshAll()
  unsubscribeReconnect = subscribeReconnect(refreshAll)
})
onUnmounted(() => {
  unsubscribeReconnect?.()
})
</script>

<style scoped>
/* ─── prefs 驱动主栅格：两列 3fr/2fr（保留既有比例）；full 板块横跨整行 ─── */
.dash-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.panel { min-width: 0; }
/* >960px 两列；≤960px 单列堆叠（窄屏既有断点纪律） */
@media (min-width: 961px) {
  .dash-grid {
    grid-template-columns: 3fr 2fr;
    align-items: start;
  }
  .panel--full { grid-column: 1 / -1; }
}
/* 812 追修（用户二次报障"全部挤在一起"）：竖屏模块间节奏加大，给呼吸感 */
@media (max-width: 600px) {
  .dash-grid { gap: 20px; }
}

@keyframes dash-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.enter-stagger {
  animation: dash-enter var(--dur-slow) var(--ease-out) both;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}
@media (prefers-reduced-motion: reduce) {
  .enter-stagger { animation: none; }
}
</style>
