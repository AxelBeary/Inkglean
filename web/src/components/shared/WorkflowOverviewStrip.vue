<template>
  <!-- 纸签轴全览（2026-08-21 用户拍板）：每步一张手剪纸签，无圆点无连线；
       收款签主色边/尾款签金色边 + 右上角小色点印章，收款签前分组留白 -->
  <div class="overview-strip" :class="{ vertical }" role="list">
    <div
      v-for="(s, i) in stages" :key="s.id"
      class="strip-node" role="listitem"
      :class="{ payment: s.takesPayment, final: s.isFinal, gsep: s.takesPayment }"
    >
      <!-- 签内：文楷序号 + 名称 + 收款徽章 -->
      <span class="strip-dot">{{ i + 1 }}</span>
      <span class="strip-name">{{ s.name }}</span>
      <span v-if="s.takesPayment" class="strip-pay-chip">
        {{ bpLabel(s) }}
        <span v-if="s.isFinal" class="strip-final-tag">{{ $t('workflow.final') }}</span>
      </span>
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
/* ═══ 纸签轴全览（2026-08-21 用户拍板定稿：素纸 + 小色点 + 分组留白）═══
   每一步 = 一张手剪纸签：纸色底 + 状态色边（横向=上缘 / 纵向=左缘），
   签与签靠留白衔接，无任何连线；收款签前额外留白（分组节奏）。
   收款签 = 主色边（定金）/ 金色边（尾款）+ 右上角微斜小色点印章。
   颜色全走双端共有语义变量：后台纸墨作用域映射到纸墨颜料，
   客户端 base/accent 主题同样成立。 */

/* ─── 横向（下单流程 / 后台流程全览）：纸签一排，状态色边在上缘 ─── */
.overview-strip {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.strip-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1 1 84px;
  min-width: 84px;
  max-width: 190px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--border-color-strong);
  border-radius: var(--r-paper);
  padding: 12px 8px;
  text-align: center;
  position: relative;
  box-shadow: var(--shadow-card);
}
/* 签内文楷序号（沉底混色：客户端主题的 muted 色对比度不足，不用；
   VL 复审指序号偏弱，混色比例 65%→80% 加余量，四作用域均 ≥5:1） */
.strip-dot {
  font-family: var(--font-display);
  font-size: 11px;
  color: color-mix(in srgb, var(--text-primary) 80%, var(--bg-card));
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.strip-name {
  font-family: var(--font-display);
  font-size: 13.5px;
  color: var(--text-primary);
  letter-spacing: .5px;
  line-height: 1.3;
}

/* ─── 收款签：定金=主色边，尾款=金色边；名称加重 ─── */
.strip-node.payment { border-top-color: var(--color-primary); }
.strip-node.payment .strip-name { color: var(--text-primary); font-weight: 600; }
.strip-node.payment .strip-dot { color: var(--color-primary); }
.strip-node.final { border-top-color: var(--color-gold); }
.strip-node.final .strip-dot { color: color-mix(in srgb, var(--color-gold) 70%, var(--text-primary)); }
/* 小色点印章（拍板定稿）：微斜小方块，定金=朱砂系/尾款=金色系 */
.strip-node.payment::after {
  content: '';
  position: absolute;
  top: -4px;
  right: 8px;
  width: 9px;
  height: 9px;
  border-radius: var(--r-s-hand);
  transform: rotate(8deg);
  background: var(--color-danger);
  opacity: .85;
}
.strip-node.final::after { background: var(--color-gold); }

/* 收款徽章（百分比 + 尾款标签）：手剪纸签样式 */
.strip-pay-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: var(--r-paper);
  background: var(--color-primary-soft);
  border: 1px solid color-mix(in srgb, var(--color-primary) 38%, transparent);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.strip-final-tag {
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-display);
}
.strip-node.final .strip-pay-chip {
  background: color-mix(in srgb, var(--color-gold) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-gold) 40%, transparent);
  /* 金色文字在客户端亮色主题下原生对比度不足，混入主文字色保 ≥4.5:1 */
  color: color-mix(in srgb, var(--color-gold) 70%, var(--text-primary));
}

/* 分组留白（拍板定稿）：收款签前多留一口气（横向左边距叠加在 gap 上） */
.overview-strip .strip-node.gsep:not(:first-child) { margin-left: 8px; }

/* ─── 竖向（客户端画师主页 workflow 区块）：状态色边移到左缘 ─── */
.overview-strip.vertical {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.vertical .strip-node {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  flex: none;
  max-width: none;
  padding: 8px 16px;
  text-align: left;
  border-top-width: 1px;
  border-left: 3px solid var(--border-color-strong);
}
.vertical .strip-node.payment { border-top-color: var(--border-color); border-left-color: var(--color-primary); }
.vertical .strip-node.final { border-top-color: var(--border-color); border-left-color: var(--color-gold); }
.vertical .strip-dot {
  width: 18px;
  text-align: center;
  font-size: 13px;
  flex-shrink: 0;
}
.vertical .strip-name { font-size: 15px; }
.vertical .strip-pay-chip { margin-left: auto; }
/* 竖向分组留白：收款签上方多留一口气 */
.vertical .strip-node.gsep:not(:first-child) { margin-left: 0; margin-top: 8px; }
</style>
