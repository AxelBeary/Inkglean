<template>
  <div class="dashboard">
    <div class="dash-grid">
      <div class="area-left">
        <div class="area area-greeting enter-stagger" :style="{ '--stagger': 0 }">
          <GreetingHero :stats="stats" />
        </div>
        <div class="area area-revenue enter-stagger" :style="{ '--stagger': 1 }">
          <RevenueChart />
        </div>
        <div class="area area-stats enter-stagger" :style="{ '--stagger': 2 }">
          <StatCards :stats="stats" />
        </div>
        <div class="area area-todo enter-stagger" :style="{ '--stagger': 3 }">
          <TodoList />
        </div>
      </div>

      <div class="area-right">
        <div class="area area-slot enter-stagger" :style="{ '--stagger': 4 }">
          <SlotOverview />
        </div>
        <!-- REQ-043 I2: 开张任务卡（右栏 SlotOverview 下方；后端标记隐藏） -->
        <div class="area area-onboarding enter-stagger" :style="{ '--stagger': 5 }">
          <OnboardingCard />
        </div>
        <div class="area area-quick enter-stagger" :style="{ '--stagger': 6 }">
          <QuickActions />
        </div>
        <div class="area area-activity enter-stagger" :style="{ '--stagger': 7 }">
          <ActivityFeed />
        </div>

        <!-- F4: 留言审核（右栏 row 5） -->
        <div class="area area-guestbook enter-stagger" :style="{ '--stagger': 8 }">
          <el-card>
            <template #header>
              <CardHead :title="$t('dashboard.guestbookTitle')">
                <template #extra>
                  <StatusChip v-if="guestbookCardRef?.pendingCount && guestbookCardRef.pendingCount > 0" type="pend">{{ guestbookCardRef.pendingCount }}</StatusChip>
                </template>
              </CardHead>
            </template>
            <GuestbookReviewCard ref="guestbookCardRef" />
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { subscribeReconnect } from '../../utils/reconnect.js'
import CardHead from '../../components/artist/visual/CardHead.vue'
import StatusChip from '../../components/artist/visual/StatusChip.vue'
import GreetingHero from '../../components/artist/dashboard/GreetingHero.vue'
import RevenueChart from '../../components/artist/dashboard/RevenueChart.vue'
import StatCards from '../../components/artist/dashboard/StatCards.vue'
import TodoList from '../../components/artist/dashboard/TodoList.vue'
import QuickActions from '../../components/artist/dashboard/QuickActions.vue'
import ActivityFeed from '../../components/artist/dashboard/ActivityFeed.vue'
import SlotOverview from '../../components/artist/dashboard/SlotOverview.vue'
import GuestbookReviewCard from '../../components/artist/dashboard/GuestbookReviewCard.vue'
// REQ-043 I2: 开张任务卡
import OnboardingCard from '../../components/artist/dashboard/OnboardingCard.vue'

const store = useArtistStore()
const stats = ref(null)

/** 仪表盘关键数据重拉 */
async function refreshAll() {
  try {
    await store.fetchProfile()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Dashboard] fetchProfile failed:', err)
  }
  try { stats.value = await artistApi.getStats() } catch { /* ignore */ }
  // F4: 留言审核（独立失败，不阻塞其他模块）
  guestbookCardRef.value?.load()
}

let unsubscribeReconnect = null
onMounted(() => {
  refreshAll()
  unsubscribeReconnect = subscribeReconnect(refreshAll)
})
onUnmounted(() => {
  unsubscribeReconnect?.()
})

// ─── F4: 留言审核 ───
const guestbookCardRef = ref(null)
</script>

<style scoped>
.dash-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
