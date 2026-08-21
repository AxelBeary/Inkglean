<template>
  <div class="order-timeline" :class="{ 'order-timeline--vertical': vertical }">
    <div
      v-for="stage in sortedStages"
      :key="stage.id"
      class="tl-node"
      :class="nodeState(stage.id)"
    >
      <!-- 签内容：节点名 + 收款百分比 + 完成✓ + 进行中签（纵向/窄屏隐藏） -->
      <div class="tl-label">
        <span class="tl-name">{{ stage.name }}</span>
        <span v-if="stage.takesPayment && stage.basisPoints" class="tl-bp">{{ (stage.basisPoints / 100).toFixed(0) }}%</span>
        <span v-if="nodeState(stage.id) === 'done'" class="tl-check">✓</span>
        <span v-if="isCurrent(stage.id)" class="tl-current-tag">{{ $t('track.timeline.current') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * OrderTimeline — 订单进度时间线（R11）
 *
 * 纸签轴构造（2026-08-21 用户拍板）：每一步一张手剪纸签，无圆点无连线，
 * 靠留白与状态色边衔接；完成=石绿边沉底淡化，进行中=主色边独自压重，
 * 未开始=默认签。桌面端横向，手机端纵向；vertical 强制纵向。
 *
 * currentStageId 为 null 时所有阶段显示"未开始"（订单刚创建，尚未进入流程）。
 * 完成日期：当前 API 不返回每阶段完成时间，已完成阶段只显示 ✓。
 */
import { computed } from 'vue'
import type { PropType } from 'vue'

/** 流程阶段（订单时间线节点） */
interface TimelineStage {
  id: number
  name?: string
  sortOrder?: number | null
  takesPayment?: boolean | number | null
  basisPoints?: number | null
}

const props = defineProps({
  /** 流程阶段列表：{ id, name, sortOrder, takesPayment, basisPoints } */
  stages: { type: Array as PropType<TimelineStage[]>, default: () => [] },
  /** 当前阶段 ID（整数或 null） */
  currentStageId: { type: Number, default: null },
  /** 强制纵向（默认桌面横向、移动纵向） */
  vertical: { type: Boolean, default: false }
})

/** 排序后的阶段列表（防御性排序，后端已按 sortOrder 返回） */
const sortedStages = computed(() =>
  [...props.stages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
)

function isCurrent(stageId: number) {
  return props.currentStageId != null && stageId === props.currentStageId
}

/** 节点状态：done / current / pending */
function nodeState(stageId: number) {
  if (props.currentStageId == null) return 'pending'
  if (stageId === props.currentStageId) return 'current'
  const currentIdx = sortedStages.value.findIndex(s => s.id === props.currentStageId)
  const thisIdx = sortedStages.value.findIndex(s => s.id === stageId)
  if (currentIdx === -1) return 'pending'
  return thisIdx < currentIdx ? 'done' : 'pending'
}
</script>

<style scoped>
/* ═══ 纸签轴重做（2026-08-21 用户拍板）：彻底去掉「圆点+连线」时间线骨架 ═══
   每一步 = 一张手剪纸签，签与签靠留白衔接：
   - 状态看色边（横向=上缘 / 纵向=左缘）：完成=石绿、进行中=主色、未开始=强边线；
   - 沉底淡化：走过的签退底透明、文字降一档，当前签独自压重（软阴影+主色描边）；
   - 收款百分比保留为签内小徽章；「进行中」文字签仅横向保留（纵向/窄屏隐藏——
     签本身已足够区分）。
   DOM 结构与类名（tl-node/状态类/tl-name）保持 e2e 断言兼容；
   旧墨点与连线 DOM 已移除，不再绘制。
   颜色全走双端共有的语义变量（--bg-card/--border-color/--color-*），
   后台纸墨作用域自动映射到纸墨颜料，客户端 base/accent 主题同样成立。 */

/* ─── 横向布局（桌面默认）：纸签一排，状态色边在上缘 ─── */
.order-timeline {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 0;
}

.tl-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--border-color-strong);
  border-radius: var(--r-paper);
  padding: 12px 8px;
  box-shadow: var(--shadow-card);
  transition: background-color var(--dur-mid) var(--ease-out), border-color var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out);
}

/* 旧墨点与连线：纸签构造已移除对应 DOM，无残留绘制 */

/* 标签即签内容 */
.tl-label {
  margin-top: 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.tl-name {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.3;
  word-break: keep-all;
  font-family: var(--font-display);
  letter-spacing: .5px;
}

/* 未开始：默认签 */

/* 已完成：石绿边 + 沉底淡化（退底透明、降影、文字降一档但保对比度，✓ 随签变淡）
   沉底文字不用 --text-muted（客户端主题下该色对比度不足 4.5:1），
   改用 text-primary 向卡底混色，四个作用域下均 ≥4.5:1。 */
.tl-node.done {
  background: transparent;
  box-shadow: none;
  border-color: color-mix(in srgb, var(--border-color) 60%, transparent);
  border-top-color: var(--color-success);
}
.tl-node.done .tl-name { color: color-mix(in srgb, var(--text-primary) 70%, var(--bg-card)); }
.tl-check {
  color: color-mix(in srgb, var(--color-success) 60%, var(--text-primary));
  font-weight: 700;
  font-size: 13px;
  line-height: 1;
}

/* 进行中：主色边 + 微染底 + 独自压重 */
.tl-node.current {
  border-color: color-mix(in srgb, var(--color-primary) 32%, var(--border-color));
  border-top-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 5%, var(--bg-card));
  box-shadow: var(--shadow-card-hover);
}
.tl-node.current .tl-name { color: var(--text-primary); font-weight: 700; }

.tl-bp {
  font-size: 11px;
  color: var(--color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tl-current-tag {
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border: 1px solid color-mix(in srgb, var(--color-primary) 38%, transparent);
  padding: 0 8px;
  border-radius: var(--r-s-hand);
  white-space: nowrap;
}

/* ─── 纵向布局（vertical prop）：状态色边移到左缘，「进行中」签隐藏 ─── */
.order-timeline--vertical {
  flex-direction: column;
  gap: 8px;
}
.order-timeline--vertical .tl-node {
  flex-direction: row;
  align-items: center;
  flex: none;
  min-height: 0;
  padding: 8px 16px;
  border-top-width: 1px;
  border-left: 3px solid var(--border-color-strong);
}
.order-timeline--vertical .tl-node.done { border-left-color: var(--color-success); border-top-color: color-mix(in srgb, var(--border-color) 60%, transparent); }
.order-timeline--vertical .tl-node.current { border-left-color: var(--color-primary); border-top-color: color-mix(in srgb, var(--color-primary) 32%, var(--border-color)); }
.order-timeline--vertical .tl-label {
  margin-left: 0;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  text-align: left;
  width: 100%;
}
.order-timeline--vertical .tl-name { font-size: 13px; }
/* 纵向：百分比与 ✓ 推到签右缘 */
.order-timeline--vertical .tl-bp,
.order-timeline--vertical .tl-check { margin-left: auto; }
.order-timeline--vertical .tl-bp + .tl-check { margin-left: 8px; }
/* A3 拍板：纵向不显示「进行中」文字签（签本身已强调） */
.order-timeline--vertical .tl-current-tag { display: none; }

@media (max-width: 640px) {
  .order-timeline {
    flex-direction: column;
    gap: 8px;
  }
  .tl-node {
    flex-direction: row;
    align-items: center;
    flex: none;
    min-height: 0;
    padding: 8px 16px;
    border-top-width: 1px;
    border-left: 3px solid var(--border-color-strong);
  }
  .tl-node.done { border-left-color: var(--color-success); border-top-color: color-mix(in srgb, var(--border-color) 60%, transparent); }
  .tl-node.current { border-left-color: var(--color-primary); border-top-color: color-mix(in srgb, var(--color-primary) 32%, var(--border-color)); }
  .tl-label {
    margin-top: 0;
    margin-left: 0;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    text-align: left;
    width: 100%;
  }
  .tl-name { font-size: 13px; }
  /* 窄屏纵向：徽章推右 + 藏起「进行中」签 */
  .tl-bp, .tl-check { margin-left: auto; }
  .tl-bp + .tl-check { margin-left: 8px; }
  .tl-current-tag { display: none; }
}
</style>
