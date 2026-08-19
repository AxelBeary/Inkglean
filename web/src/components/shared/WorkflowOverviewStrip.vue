<template>
  <!-- v0.34 任务E：流程全览重做——编号节点 + 连接线 + 收款徽章强调，横/竖两种形态 -->
  <div class="overview-strip" :class="{ vertical }" role="list">
    <div
      v-for="(s, i) in stages" :key="s.id"
      class="strip-node" role="listitem"
      :class="{ payment: s.takesPayment, final: s.isFinal }"
    >
      <!-- 节点轴：圆点 + 指向下一节点的连接线（最后一个节点无线） -->
      <div class="strip-node-axis">
        <span class="strip-dot">{{ i + 1 }}</span>
        <span v-if="i < stages.length - 1" class="strip-line" aria-hidden="true"></span>
      </div>
      <!-- 节点内容：名称 + 收款徽章 -->
      <div class="strip-node-body">
        <span class="strip-name">{{ s.name }}</span>
        <span v-if="s.takesPayment" class="strip-pay-chip">
          {{ bpLabel(s) }}
          <span v-if="s.isFinal" class="strip-final-tag">{{ $t('workflow.final') }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

/** 流程全览阶段节点 */
interface OverviewStage {
  id: number
  name: string
  takesPayment?: boolean | number | null
  basisPoints?: number | null
  isFinal?: boolean
}

defineProps({
  stages: { type: Array as PropType<OverviewStage[]>, default: () => [] },
  vertical: { type: Boolean, default: false }
})

/** 收款比例标签（basisPoints → 百分比，去掉无意义的 .0） */
function bpLabel(s: OverviewStage) {
  // b3 猎杀修复：takesPayment=true 但无比例时不渲染 NaN%（OrderTimeline 同场景有守卫）
  if (!s.basisPoints) return '—'
  return `${(s.basisPoints / 100).toFixed(1).replace(/\.0$/, '')}%`
}
</script>

<style scoped>
/* ─── 横向（OrderForm / 后台流程全览）：圆点 + 连接线一字排开 ─── */
.overview-strip {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  padding: 10px 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.strip-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 64px;
  max-width: 140px;
}
/* 节点轴（横向：圆点 + 水平连接线） */
.strip-node-axis {
  display: flex;
  align-items: center;
}
.strip-dot {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--bg-inset);
  border: 1px solid var(--border-color-strong);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.strip-line {
  width: 40px; height: 2px; margin-left: 6px;
  background: var(--border-color-strong);
  border-radius: 1px;
}
.strip-node-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.strip-name {
  line-height: 1.4;
  white-space: nowrap;
}

/* ─── 语义色：收款节点 = 主色，尾款 = 金色，普通 = 弱化 ─── */
.strip-node.payment .strip-dot {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--pal-bg, #fff);
}
.strip-node.payment .strip-name {
  color: var(--text-primary);
  font-weight: 600;
}
.strip-node.final .strip-dot {
  background: var(--color-gold);
  border-color: var(--color-gold);
  color: var(--pal-bg, #fff);
}

/* 收款徽章（百分比 + 尾款标签） */
.strip-pay-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary) 70%, #000);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.strip-final-tag {
  color: var(--color-gold);
}
.strip-node.final .strip-pay-chip {
  background: color-mix(in srgb, var(--color-gold) 14%, transparent);
}
/* P2 对比度：深色主题 chip 文字提亮（70% primary + 30% white ≥ 4.5:1，全部 accent 验证过） */
html.dark .strip-pay-chip {
  color: color-mix(in srgb, var(--color-primary) 70%, #fff);
}

/* ─── 竖向（客户端 4 模板 workflow 区块）：左侧轴线时间线 ─── */
.overview-strip.vertical {
  flex-direction: column;
  align-items: stretch;
  padding: 4px 0;
}
.vertical .strip-node {
  flex-direction: row;
  align-items: stretch;
  gap: 12px;
  min-width: 0;
  max-width: none;
}
.vertical .strip-node-axis {
  flex-direction: column;
  align-items: center;
}
.vertical .strip-line {
  width: 2px;
  height: auto;
  flex: 1;
  min-height: 18px;
  margin: 6px 0 0;
}
.vertical .strip-node-body {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 4px 0 14px;
  text-align: left;
}
.vertical .strip-node:last-child .strip-node-body {
  padding-bottom: 4px;
}
</style>
