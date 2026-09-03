<script setup lang="ts">
// 卷尾「排期 · 近 7 天」摘要签（9/4 主页重设计落码波1 · 路B）。
// 台面口径（原型 THESIS）：长卷是摘要台面不是储物间——一眼扫完这一周忙不忙，整条点开才进独立排期页三视图。
// 数据由 Home 统一下发（sched.stripDays），本组件不取数（框架纪律）；柱条四色照原型 .sd：
// over=朱砂 / busy=花青 / full=藤黄 / free=--line2 素条。整条可点 + 键盘等价（role=button + Enter/Space）。
// 本地模式照显（拍板②：canAccept 恒 false → 空日落 full 藤黄，不标 free 素条）。
import { useRouter } from 'vue-router'
import type { StripDay } from '../../schedule/strip'

defineProps<{ days: StripDay[] }>()

const router = useRouter()

function open(): void {
  void router.push({ name: 'schedule' })
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open()
  }
}
function dayTitle(d: StripDay): string {
  return d.count > 0 ? `${d.weekday} · ${d.count} 单在途` : `${d.weekday} · 空`
}
</script>

<template>
  <!-- 无数据（失败/空）整条不渲染，不留死签（§一-4） -->
  <div
    v-if="days.length > 0"
    class="sched-strip"
    role="button"
    tabindex="0"
    aria-label="打开排期三视图"
    @click="open"
    @keydown="onKeydown"
  >
    <span v-for="d in days" :key="d.date.getTime()" class="sd" :class="d.tone" :title="dayTitle(d)">
      <span class="dw">{{ d.weekday }}</span>
      <span class="bar" aria-hidden="true"></span>
    </span>
    <span class="open-hint">看三视图 ›</span>
  </div>
</template>

<style scoped>
/* 照原型 .sched-strip / .sd 逐段移植；hover 只改底色不位移（动效克制红线） */
.sched-strip {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 6px 10px; border-radius: var(--r-s-hand);
  transition: background var(--dur-fast) var(--ease-out);
}
.sched-strip:hover { background: rgba(var(--ink-rgb), .05); }
.sd { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; width: 30px; }
.sd .dw { font-size: 10px; color: var(--ink4); }
.sd .bar { width: 6px; height: 20px; margin: 0; border-radius: var(--r-s-hand); background: var(--line2); }
.sd.busy .bar { background: var(--hq); }
.sd.full .bar { background: var(--th); }
.sd.over .bar { background: var(--zs); }
/* free＝素条（--line2 默认，不另设色，暗色主题自动跟随） */
.open-hint { margin-left: 4px; font-size: 12px; color: var(--hq-d); white-space: nowrap; }
</style>
