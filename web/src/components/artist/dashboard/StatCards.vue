<template>
  <!-- 统计卡片 ×3（v0.18 移除"本月收入"，收入统计区已覆盖——Q4 已定） -->
  <!-- #2: 卡片可点击 → 跳转订单列表 + 对应状态筛选
       v0.38: 大数字文楷墨色不上色 + 顶部 3px 状态色条 + hover 跳转箭头（REQ §1.1/验收 4）
       02D P1-1: 计数从 0 滚动到目标（加载期保持 -，数据到达后滚动） -->
  <div class="stat-grid">
    <el-card shadow="hover" class="stat-card stat-card--pending" @click="goOrders('pending')">
      <div class="stat-num">{{ stats?.pendingCount != null ? pendingCount.display : '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.pendingNew') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--active" @click="goOrders('active')">
      <div class="stat-num">{{ stats?.activeCount != null ? activeCount.display : '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.activeOrders') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
    </el-card>
    <el-card shadow="hover" class="stat-card stat-card--completed" @click="goOrders('completed')">
      <div class="stat-num">{{ stats?.totalCompleted != null ? totalCompleted.display : '-' }}</div>
      <div class="stat-label">{{ $t('dashboard.totalCompleted') }}</div>
      <span class="stat-go" aria-hidden="true">→</span>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCountUp } from '../../../utils/useCountUp.js'

const props = defineProps({
  /** getStats 返回（含 pendingCount / activeCount / totalCompleted） */
  stats: { type: Object, default: null }
})

const router = useRouter()

// 02D P1-1: 计数滚动（整数；加载期显示 -，数据到达后从 0 滚动到目标）
const pendingCount = useCountUp(computed(() => props.stats?.pendingCount ?? 0))
const activeCount = useCountUp(computed(() => props.stats?.activeCount ?? 0))
const totalCompleted = useCountUp(computed(() => props.stats?.totalCompleted ?? 0))

/** #2: 跳转订单列表并带状态筛选（OrderList 读 query.status 初始化 filter） */
function goOrders(status) {
  router.push({ path: '/orders', query: { status } })
}
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.artist-scope .stat-card {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  text-align: center;
  transition: transform 0.18s ease-out, box-shadow 0.2s, background-color 0.35s;
}
.stat-card:hover { box-shadow: var(--sh-2); }
.stat-card:active { transform: translateY(-2px) scale(0.98); }
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
  font-size: calc(var(--font-scale, 1) * 34px); font-weight: 700; line-height: 1.15;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.stat-label { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12.5px); margin-top: 4px; }
/* hover 跳转箭头（右上角浮现） */
.stat-go {
  position: absolute; right: 13px; top: 12px;
  color: var(--ink4);
  font-size: calc(var(--font-scale, 1) * 14px);
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
}
.stat-card:hover .stat-go { opacity: 1; transform: translateX(3px); }
.stat-card--pending:hover .stat-go { color: var(--th); }
.stat-card--active:hover .stat-go { color: var(--hq); }
.stat-card--completed:hover .stat-go { color: var(--sl); }
/* 竖屏/窄屏：三列硬挤会把标签挤断行（812 用户实测报障），≤600px 改单列堆叠。
   注意：el-card 外壳唯一子元素是 .el-card__body，横排必须挂在 body 层才生效
   （首版误挂在外壳层未生效，用户二次报障"全部挤在一起"后定位） */
@media (max-width: 600px) {
  .stat-grid { grid-template-columns: 1fr; gap: 12px; }
  .stat-card :deep(.el-card__body) {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; text-align: left;
  }
  .stat-num { font-size: calc(var(--font-scale, 1) * 24px); }
  .stat-label { margin-top: 0; }
  .stat-go { top: 50%; transform: translateY(-50%); }
  .stat-card:hover .stat-go { transform: translateY(-50%) translateX(3px); }
}
</style>