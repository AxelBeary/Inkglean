<template>
  <!-- 统计卡片 ×3（v0.18 移除"本月收入"，收入统计区已覆盖——Q4 已定） -->
  <!-- #2: 卡片可点击 → 跳转订单列表 + 对应状态筛选
       v0.38: 大数字文楷墨色不上色 + 顶部 3px 状态色条 + hover 跳转箭头（REQ §1.1/验收 4） -->
  <div class="stat-grid">
    <el-card shadow="hover" class="stat-card stat-card--pending" @click="goOrders('pending')">
      <div class="stat-num">{{ stats?.pendingCount ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.pendingNew') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--active" @click="goOrders('active')">
      <div class="stat-num">{{ stats?.activeCount ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.activeOrders') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--completed" @click="goOrders('completed')">
      <div class="stat-num">{{ stats?.totalCompleted ?? '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.totalCompleted') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
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
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.stat-card {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  text-align: center;
  transition: transform 0.18s, box-shadow 0.2s, background-color 0.35s;
}
.stat-card:hover { transform: translateY(-3px); box-shadow: var(--sh-2); }
/* 顶部 3px 状态色条（色只标状态，数字保持墨色） */
.stat-card::after {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 3px;
}
.stat-card--pending::after { background: var(--th); }   /* 待确认=藤黄 */
.stat-card--active::after { background: var(--hq); }    /* 进行中=花青 */
.stat-card--completed::after { background: var(--sl); } /* 完成=石绿 */
/* 数字：文楷 + 墨色（不上色，REQ 硬规则）+ tnum */
.stat-num {
  font-family: var(--f-d);
  font-size: 34px; font-weight: 700; line-height: 1.15;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.stat-label { color: var(--ink2); font-size: 12.5px; margin-top: 4px; }
/* hover 跳转箭头（右上角浮现） */
.stat-go {
  position: absolute; right: 13px; top: 12px;
  color: var(--ink4);
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
}
.stat-card:hover .stat-go { opacity: 1; transform: translateX(3px); }
.stat-card--pending:hover .stat-go { color: var(--th); }
.stat-card--active:hover .stat-go { color: var(--hq); }
.stat-card--completed:hover .stat-go { color: var(--sl); }
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
