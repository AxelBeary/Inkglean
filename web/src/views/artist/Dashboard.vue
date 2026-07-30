<template>
  <div class="dashboard">
    <ArtistLayout>
      <!-- v0.18 双栏布局（C58）：>768px 双栏（左 60% / 右 40%），≤768px 单列
           DOM 顺序 = 窄屏顺序（验收 6.6）；宽屏通过 grid-row/grid-column 显式分栏（验收 6.4/6.5）
           各模块独立加载/独立失败，互不阻塞（验收 §9.1） -->
      <div class="dash-grid">
        <!-- 左栏：问候区（含今日统计行）→ 收入统计 → 统计卡片 ×3 → 合并列表 -->
        <div class="area area-greeting">
          <GreetingHero :stats="stats" />
        </div>
        <div class="area area-revenue">
          <RevenueChart />
        </div>
        <div class="area area-stats">
          <StatCards :stats="stats" />
        </div>
        <div class="area area-todo">
          <TodoList />
        </div>

        <!-- 右栏：名额概览卡（有则显示）→ 快捷操作区 → 状态切换 → 最近活动流 -->
        <div class="area area-slot">
          <SlotOverview />
        </div>
        <div class="area area-quick">
          <QuickActions />
        </div>
        <div class="area area-status">
          <StatusSwitch :model-value="currentStatus" @pick="updateStatus" />
        </div>
        <div class="area area-activity">
          <ActivityFeed />
        </div>
      </div>
    </ArtistLayout>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useArtistStore } from '../../stores/artist.js'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import GreetingHero from '../../components/artist/dashboard/GreetingHero.vue'
import RevenueChart from '../../components/artist/dashboard/RevenueChart.vue'
import StatCards from '../../components/artist/dashboard/StatCards.vue'
import TodoList from '../../components/artist/dashboard/TodoList.vue'
import QuickActions from '../../components/artist/dashboard/QuickActions.vue'
import StatusSwitch from '../../components/artist/dashboard/StatusSwitch.vue'
import ActivityFeed from '../../components/artist/dashboard/ActivityFeed.vue'
import SlotOverview from '../../components/artist/dashboard/SlotOverview.vue'

const { t } = useI18n()
const store = useArtistStore()
const stats = ref(null)
const currentStatus = ref('open')
const lastKnownStatus = ref('open') // P1-6: 回滚用

async function updateStatus(val) {
  try {
    await artistApi.updateProfile({ status: val })
    lastKnownStatus.value = val // P1-6: 成功后更新已知状态
    currentStatus.value = val
    ElMessage.success(t('dashboard.statusUpdated'))
  } catch (err) {
    currentStatus.value = lastKnownStatus.value // P1-6: 回滚到上次成功状态
    ElMessage.error(err.message)
  }
}

onMounted(async () => {
  await store.fetchProfile()
  currentStatus.value = store.profile?.status || 'open'
  lastKnownStatus.value = currentStatus.value // P1-6: 初始化已知状态
  // 统计卡片 + 今日统计行（独立失败，不阻塞其他模块）
  try { stats.value = await artistApi.getStats() } catch { /* ignore */ }
})
</script>

<style scoped>
/* ─── 窄屏默认：单列，DOM 顺序即展示顺序（验收 6.6） ─── */
.dash-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── 宽屏：双栏（左 60% / 右 40%），显式行列分配（验收 6.1~6.5） ─── */
@media (min-width: 769px) {
  .dash-grid {
    display: grid;
    grid-template-columns: 3fr 2fr;
    column-gap: 16px;
    row-gap: 16px;
    align-items: start;
  }
  /* 左栏 */
  .area-greeting { grid-column: 1; grid-row: 1; }
  .area-revenue  { grid-column: 1; grid-row: 2; }
  .area-stats    { grid-column: 1; grid-row: 3; }
  .area-todo     { grid-column: 1; grid-row: 4; }
  /* 右栏 */
  .area-slot     { grid-column: 2; grid-row: 1; }
  .area-quick    { grid-column: 2; grid-row: 2; }
  .area-status   { grid-column: 2; grid-row: 3; }
  .area-activity { grid-column: 2; grid-row: 4; }
}
</style>
