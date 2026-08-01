<template>
  <!-- 统计卡片 ×3（v0.18 移除"本月收入"，收入统计区已覆盖——Q4 已定） -->
  <!-- #2: 卡片可点击 → 跳转订单列表 + 对应状态筛选 -->
  <div class="stat-grid">
    <el-card shadow="hover" class="stat-card stat-card--clickable" @click="goOrders('pending')">
      <div class="stat-num">{{ stats?.pendingCount ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.pendingNew') }}</div>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--clickable" @click="goOrders('active')">
      <div class="stat-num">{{ stats?.activeCount ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.activeOrders') }}</div>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--clickable" @click="goOrders('completed')">
      <div class="stat-num">{{ stats?.totalCompleted ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.totalCompleted') }}</div>
    </el-card>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

defineProps({
  /** getStats 返回（含 pendingCount / activeCount / totalCompleted） */
  stats: { type: Object, default: null }
})

const router = useRouter()

/** #2: 跳转订单列表并带状态筛选（OrderList 读 query.status 初始化 filter） */
function goOrders(status) {
  router.push({ path: '/orders', query: { status } })
}
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-card { text-align: center; background: var(--bg-card); transition: background 0.3s, transform 0.18s; }
.stat-card:hover { transform: translateY(-2px); }
/* #2: 可点击态 */
.stat-card--clickable { cursor: pointer; }
.stat-card--clickable:hover { box-shadow: var(--shadow-card-hover, 0 4px 16px rgba(0, 0, 0, 0.12)); }
.stat-num { font-size: 28px; font-weight: bold; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.stat-label { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
