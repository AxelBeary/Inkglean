<template>
  <div class="order-timeline" :class="{ 'order-timeline--vertical': vertical }">
    <div
      v-for="(stage, index) in sortedStages"
      :key="stage.id"
      class="tl-node"
      :class="nodeState(stage.id)"
    >
      <!-- 节点圆点 -->
      <div class="tl-dot">
        <span v-if="nodeState(stage.id) === 'done'" class="tl-check">✓</span>
      </div>

      <!-- 连接线（最后一个节点不画） -->
      <div v-if="index < stages.length - 1" class="tl-line" :class="{ 'tl-line--done': nodeState(stage.id) === 'done' }"></div>

      <!-- 标签 -->
      <div class="tl-label">
        <span class="tl-name">{{ stage.name }}</span>
        <span v-if="stage.takesPayment && stage.basisPoints" class="tl-bp">{{ (stage.basisPoints / 100).toFixed(0) }}%</span>
        <span v-if="isCurrent(stage.id)" class="tl-current-tag">{{ $t('track.timeline.current') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * OrderTimeline — 订单进度时间线（R11）
 *
 * 类似快递物流追踪条：已完成 ✓ 主色填充，当前阶段脉冲高亮，未开始灰色空心。
 * 桌面端横向，手机端纵向（CSS media query）。
 *
 * currentStageId 为 null 时所有阶段显示"未开始"（订单刚创建，尚未进入流程）。
 * 完成日期：当前 API 不返回每阶段完成时间，已完成阶段只显示 ✓。
 */
import { computed } from 'vue'

const props = defineProps({
  /** 流程阶段列表：{ id, name, sortOrder, takesPayment, basisPoints } */
  stages: { type: Array, default: () => [] },
  /** 当前阶段 ID（整数或 null） */
  currentStageId: { type: Number, default: null },
  /** 强制纵向（默认桌面横向、移动纵向） */
  vertical: { type: Boolean, default: false }
})

/** 排序后的阶段列表（防御性排序，后端已按 sortOrder 返回） */
const sortedStages = computed(() =>
  [...props.stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
)

function isCurrent(stageId) {
  return props.currentStageId != null && stageId === props.currentStageId
}

/** 节点状态：done / current / pending */
function nodeState(stageId) {
  if (props.currentStageId == null) return 'pending'
  if (stageId === props.currentStageId) return 'current'
  const currentIdx = sortedStages.value.findIndex(s => s.id === props.currentStageId)
  const thisIdx = sortedStages.value.findIndex(s => s.id === stageId)
  if (currentIdx === -1) return 'pending'
  return thisIdx < currentIdx ? 'done' : 'pending'
}
</script>

<style scoped>
/* ─── 横向布局（桌面默认） ─── */
.order-timeline {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
}

.tl-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
  position: relative;
}

/* 圆点 */
.tl-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
  z-index: 1;
  transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
}

/* 未开始：灰色空心 */
.tl-node.pending .tl-dot {
  border: 2px solid var(--border-color, #dcdcdc);
  background: transparent;
}

/* 已完成：主色填充 + ✓ */
.tl-node.done .tl-dot {
  border: 2px solid var(--el-color-primary);
  background: var(--el-color-primary);
}
.tl-check { color: #fff; font-weight: 700; font-size: 14px; }

/* 当前阶段：高亮 + 脉冲动画 */
.tl-node.current .tl-dot {
  border: 2px solid var(--el-color-primary);
  background: var(--el-color-primary-soft, color-mix(in srgb, var(--el-color-primary) 15%, transparent));
  animation: tl-pulse 1.8s ease-in-out infinite;
}

/* 连接线 */
.tl-line {
  position: absolute;
  top: 14px;
  left: calc(50% + 18px);
  right: calc(-50% + 18px);
  height: 2px;
  background: var(--border-color, #dcdcdc);
  z-index: 0;
  transition: background 0.3s;
}
.tl-line--done { background: var(--el-color-primary); }

/* 标签 */
.tl-label {
  margin-top: 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.tl-name {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  line-height: 1.3;
  word-break: keep-all;
}
.tl-node.done .tl-name { color: var(--text-primary, #303133); font-weight: 600; }
.tl-node.current .tl-name { color: var(--el-color-primary); font-weight: 700; }

.tl-bp {
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tl-current-tag {
  font-size: 10px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-soft, color-mix(in srgb, var(--el-color-primary) 12%, transparent));
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

/* ─── 纵向布局（移动端 + vertical prop） ─── */
.order-timeline--vertical,
.order-timeline--vertical .tl-node {
  flex-direction: column;
}

@media (max-width: 640px) {
  .order-timeline {
    flex-direction: column;
    align-items: stretch;
  }
  .tl-node {
    flex-direction: row;
    align-items: flex-start;
    flex: none;
    min-height: 48px;
  }
  .tl-label {
    margin-top: 0;
    margin-left: 12px;
    text-align: left;
    align-items: flex-start;
    padding-top: 4px;
  }
  .tl-line {
    position: absolute;
    top: 32px;
    bottom: -4px;
    left: 13px;
    right: auto;
    width: 2px;
    height: auto;
  }
}
</style>
