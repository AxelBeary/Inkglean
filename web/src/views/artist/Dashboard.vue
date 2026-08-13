<template>
  <!-- Dashboard 纸墨重排（视觉批 P1，原型 v0.9 落地）：
       顶排 = 问候贴纸+统计三卡（左）｜挂牌+名额（右）；卷轴全宽；
       主栅格 = 账本待办/留言审核/订单动态（左）｜开张任务/快捷（右）。
       收入走势移出本页（提案 §6.1：钱不进日报，月度小结一行在账本底）。 -->
  <div class="dashboard">
    <div class="top-grid">
      <div class="top-left enter-stagger" :style="{ '--stagger': 0 }">
        <GreetingNote :stats="stats" />
        <StatCards :stats="stats" />
      </div>
      <div class="top-right enter-stagger" :style="{ '--stagger': 1 }">
        <PlaqueStatus />
      </div>
    </div>

    <div class="enter-stagger" :style="{ '--stagger': 2 }">
      <ScheduleScroll />
    </div>

    <div class="dash-grid">
      <div class="area-left">
        <div class="area enter-stagger" :style="{ '--stagger': 3 }">
          <LedgerTodo :month-cents="stats?.monthRevenueCents ?? null" />
        </div>
        <div class="area enter-stagger" :style="{ '--stagger': 4 }">
          <el-card>
            <template #header>
              <CardHead :title="t('dashboard.guestbookTitle')">
                <template #extra>
                  <StatusChip v-if="guestbookCardRef?.pendingCount && guestbookCardRef.pendingCount > 0" type="pend">{{ guestbookCardRef.pendingCount }}</StatusChip>
                </template>
              </CardHead>
            </template>
            <GuestbookReviewCard ref="guestbookCardRef" />
          </el-card>
        </div>
        <div class="area enter-stagger" :style="{ '--stagger': 5 }">
          <ActivityFeed />
        </div>
      </div>

      <div class="area-right">
        <!-- REQ-043 I2: 开张任务卡（后端标记隐藏） -->
        <div class="area enter-stagger" :style="{ '--stagger': 6 }">
          <OnboardingCard />
        </div>
        <div class="area enter-stagger" :style="{ '--stagger': 7 }">
          <QuickActions />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { subscribeReconnect } from '../../utils/reconnect.js'
import type { ArtistStats } from '../../api/types.js'
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
// 视觉批新组件（问候贴纸/挂牌+名额/排期卷轴/账本待办）
import GreetingNote from '../../components/artist/dashboard/GreetingNote.vue'
import PlaqueStatus from '../../components/artist/dashboard/PlaqueStatus.vue'
import ScheduleScroll from '../../components/artist/dashboard/ScheduleScroll.vue'
import LedgerTodo from '../../components/artist/dashboard/LedgerTodo.vue'
// 既有模块保留（P2 纸墨化）
import StatCards from '../../components/artist/dashboard/StatCards.vue'
import QuickActions from '../../components/artist/dashboard/QuickActions.vue'
import ActivityFeed from '../../components/artist/dashboard/ActivityFeed.vue'
import GuestbookReviewCard from '../../components/artist/dashboard/GuestbookReviewCard.vue'
// REQ-043 I2: 开张任务卡
import OnboardingCard from '../../components/artist/dashboard/OnboardingCard.vue'

const { t } = useI18n()
const store = useArtistStore()
// getStats 返回 ArtistStats（含 monthRevenueCents 等）
const stats = ref<ArtistStats | null>(null)

// F4: 留言审核
const guestbookCardRef = ref<{ pendingCount?: number; load: () => void } | null>(null)

/** 仪表盘关键数据重拉 */
async function refreshAll() {
  try {
    await store.fetchProfile()
  } catch (err) {
    // eslint-disable-next-line no-console -- 重连刷新失败仅留痕，不阻塞模块
    console.warn('[Dashboard] fetchProfile failed:', err)
  }
  try { stats.value = await artistApi.getStats() } catch { /* 各模块自带错误态，此处静默 */ }
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
/* ─── 顶排：问候+统计（左）｜挂牌（右） ─── */
.top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}
.top-left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

/* ─── 主栅格（沿用既有断点体系） ─── */
.dash-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* 812 追修（用户二次报障"全部挤在一起"）：竖屏模块间节奏加大，给呼吸感 */
@media (max-width: 600px) {
  .dash-grid { gap: 20px; }
}

@media (min-width: 769px) {
  .dash-grid {
    display: grid;
    grid-template-columns: 3fr 2fr;
    column-gap: 16px;
    row-gap: 16px;
    align-items: start;
  }
  .area-left {
    grid-column: 1;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .area-right {
    grid-column: 2;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

/* ≤960：顶排收单列，挂牌居中收窄（响应式规则：问候→挂牌→统计→卷轴→账本） */
@media (max-width: 960px) {
  .top-grid { grid-template-columns: 1fr; }
  .top-left .stat-cards-wrap { order: 2; }
}

@keyframes dash-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.enter-stagger {
  animation: dash-enter 0.3s var(--ease-out) both;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}
@media (prefers-reduced-motion: reduce) {
  .enter-stagger { animation: none; }
}
</style>
