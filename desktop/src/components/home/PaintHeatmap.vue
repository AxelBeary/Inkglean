<script setup lang="ts">
// 整年在画热力图（RingoTrack 款 GitHub 小绿砖 · 纸墨风墨色深浅）：
// 一列一周、一行一星期（周日→周六），格色深浅＝当日在画时长（tools/heatmap.ts 已算好档位）。
// 纯 CSS 无图表库；纸墨 token 上色（--hq 花青随亮/暗主题自适配，用透明度分深浅）。
import { formatSeconds } from '../../stores/timer'
import { WEEKDAY_LABELS, type HeatCell, type HeatColumn } from '../../tools/heatmap'

defineProps<{ columns: HeatColumn[] }>()

/** 悬停签：手动拆 YYYY-MM-DD（不用 new Date(str)，避免 UTC 解析偏一天） */
function tip(cell: HeatCell): string {
  if (cell.future) return ''
  const [, m, d] = cell.date.split('-')
  const label = `${Number(m)}月${Number(d)}日`
  return cell.secs > 0 ? `${label} · 在画 ${formatSeconds(cell.secs)}` : `${label} · 无记录`
}
</script>

<template>
  <div class="heat" role="img" aria-label="近一年每日画画时长热力图">
    <div class="heat-scroll">
      <div class="heat-inner">
        <!-- 月份签行（与列同宽同距对齐） -->
        <div class="months">
          <span v-for="(c, i) in columns" :key="i" class="mcell">{{ c.monthLabel ?? '' }}</span>
        </div>
        <div class="body">
          <!-- 星期行签（一/三/五） -->
          <div class="wdays">
            <span v-for="(l, i) in WEEKDAY_LABELS" :key="i" class="wd">{{ l ?? '' }}</span>
          </div>
          <div class="grid">
            <div v-for="(c, i) in columns" :key="i" class="col">
              <span
                v-for="cell in c.cells"
                :key="cell.date"
                class="hc"
                :class="{ future: cell.future }"
                :data-l="cell.level"
                :title="tip(cell)"
              ></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="legend">
      <span class="lg-k">少</span>
      <span class="hc" data-l="0"></span>
      <span class="hc" data-l="1"></span>
      <span class="hc" data-l="2"></span>
      <span class="hc" data-l="3"></span>
      <span class="hc" data-l="4"></span>
      <span class="lg-k">多</span>
    </div>
  </div>
</template>

<style scoped>
.heat { --cell: 11px; --gap: 3px; }
/* 53 列铺满约 740px，窄窗横向滚动（纸墨滚动条随全局） */
.heat-scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
.heat-inner { display: inline-flex; flex-direction: column; gap: 4px; }

.months { display: flex; gap: var(--gap); height: 13px; margin-left: 20px; }
.mcell { flex: none; width: var(--cell); font-size: 10px; line-height: 13px; color: var(--ink4); white-space: nowrap; overflow: visible; }

.body { display: flex; gap: 6px; }
.wdays { display: flex; flex-direction: column; gap: var(--gap); width: 14px; flex: none; }
.wd { height: var(--cell); font-size: 10px; line-height: var(--cell); color: var(--ink4); text-align: right; }

.grid { display: flex; gap: var(--gap); }
.col { display: flex; flex-direction: column; gap: var(--gap); }

.hc {
  display: block; width: var(--cell); height: var(--cell); flex: none;
  border-radius: 2px; background: var(--hq);
}
.hc[data-l="0"] { background: rgba(var(--ink-rgb), .07); }
.hc[data-l="1"] { opacity: .3; }
.hc[data-l="2"] { opacity: .52; }
.hc[data-l="3"] { opacity: .76; }
.hc[data-l="4"] { opacity: 1; }
.hc.future { background: transparent; }

.legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; }
.legend .hc { width: 10px; height: 10px; }
.lg-k { font-size: 11px; color: var(--ink4); margin: 0 3px; }
</style>
