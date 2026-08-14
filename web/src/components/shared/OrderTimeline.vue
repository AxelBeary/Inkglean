<template>
  <div class="order-timeline" :class="{ 'order-timeline--vertical': vertical }">
    <div
      v-for="(stage, index) in sortedStages"
      :key="stage.id"
      class="tl-node"
      :class="nodeState(stage.id)"
    >
      <!-- 节点墨点（E10 纸墨化：外层 18px 定位盒不变，内层 .tl-ink 按态画墨点） -->
      <div class="tl-dot">
        <span class="tl-ink">
          <span v-if="nodeState(stage.id) === 'done'" class="tl-check">✓</span>
        </span>
      </div>

      <!-- 连接线（最后一个节点不画；E10: 1px 淡墨线） -->
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
 * 类似快递物流追踪条：已完成 ✓ 石绿墨点，当前阶段花青墨点略大，未开始淡墨空心。
 * E10 纸墨化：1px 淡墨线（var(--ink3) 系）+ 节点墨点，仅换外观，
 * 数据/条数/三态逻辑不变。桌面端横向，手机端纵向；vertical 强制纵向。
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
/* ═══ E10 纸墨化（纸墨 token）：1px 淡墨线 + 节点墨点；数据/条数/三态逻辑零变化 ═══ */
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

/* 墨点定位盒：固定 18px，横/纵模式中心不漂移；内层 .tl-ink 按态画墨点 */
.tl-dot {
  position: relative; /* 当前节点 ::after 扩散环定位锚点 */
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
}

.tl-ink {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50% 46% 54% 50%; /* 手剪墨点感（纸墨体系圆角族） */
  transition: width var(--dur-fast), height var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast), box-shadow var(--dur-fast);
}

/* 未开始：淡墨空心小点 */
.tl-node.pending .tl-ink {
  width: 8px;
  height: 8px;
  border: 1px solid color-mix(in srgb, var(--ink3) 55%, transparent);
  background: transparent;
}

/* 已完成：石绿实墨点 + 细勾（完成语义色不变） */
.tl-node.done .tl-ink {
  width: 12px;
  height: 12px;
  background: var(--sl);
}
.tl-check { color: var(--card); font-weight: 700; font-size: 9px; line-height: 1; }

/* 当前节点：花青墨点略大 + 软光环（H3: 一次性脉冲 forwards，非循环） */
.tl-node.current .tl-ink {
  width: 14px;
  height: 14px;
  background: var(--hq);
  box-shadow: 0 0 0 4px var(--hq-t);
}
.tl-node.current .tl-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--hq) 30%, transparent);
  /* T 波：一次性脉冲（forwards）；keyframes tl-pulse 在 templates.css */
  animation: tl-pulse 1.8s ease-in-out forwards;
  pointer-events: none;
}

/* T 波：一次性脉冲的 prefers-reduced-motion 豁免 */
@media (prefers-reduced-motion: reduce) {
  .tl-node.current .tl-dot::after { animation: none; }
}

/* 连接线：1px 淡墨（var(--ink3) 系）；已完成段走石绿 */
.tl-line {
  position: absolute;
  top: 8.5px;
  left: calc(50% + 12px);
  right: calc(-50% + 12px);
  height: 1px;
  background: color-mix(in srgb, var(--ink3) 45%, transparent);
  z-index: 0;
  transition: background var(--dur-slow);
}
.tl-line--done { background: color-mix(in srgb, var(--sl) 65%, transparent); }

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
  color: var(--ink3);
  line-height: 1.3;
  word-break: keep-all;
}
.tl-node.done .tl-name { color: var(--ink); font-weight: 600; }
.tl-node.current .tl-name { color: var(--hq); font-weight: 700; }

.tl-bp {
  font-size: 11px;
  color: var(--hq);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tl-current-tag {
  font-size: 10px;
  color: var(--hq);
  background: var(--hq-t);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

/* ─── 纵向布局（vertical prop / 移动端）：竖向淡墨线 + 左侧墨点，标签右侧 ─── */
.order-timeline--vertical {
  flex-direction: column;
  align-items: stretch;
}
.order-timeline--vertical .tl-node {
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  min-height: 44px;
}
.order-timeline--vertical .tl-label {
  margin-top: 0;
  margin-left: 10px;
  text-align: left;
  align-items: flex-start;
}
.order-timeline--vertical .tl-line {
  top: 22px;
  bottom: -4px;
  left: 8.5px;
  right: auto;
  width: 1px;
  height: auto;
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
    min-height: 44px;
  }
  .tl-label {
    margin-top: 0;
    margin-left: 10px;
    text-align: left;
    align-items: flex-start;
  }
  .tl-line {
    top: 22px;
    bottom: -4px;
    left: 8.5px;
    right: auto;
    width: 1px;
    height: auto;
  }
}
</style>
