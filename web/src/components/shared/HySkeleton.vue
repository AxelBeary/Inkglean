<template>
  <!-- HySkeleton — 订单卡片骨架屏（纯装饰，translateX 微光，GPU 友好） -->
  <div class="hy-skeleton" aria-hidden="true">
    <div class="hy-skeleton-card" v-for="i in cards" :key="i" :style="{ '--i': i - 1 }">
      <div class="hy-skeleton-thumb"></div>
      <div class="hy-skeleton-lines">
        <div class="hy-skeleton-line hy-skeleton-line--title"></div>
        <div class="hy-skeleton-line hy-skeleton-line--sub"></div>
        <div class="hy-skeleton-line hy-skeleton-line--meta"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  // 兼容静态属性写法（如 count="6"，模板属性恒为字符串），组件内自行归一不依赖运行时转型
  count: { type: [Number, String], default: 6 }
})

/** 归一卡片数：2026-08-22 实测静态属性写法下字符串不会自动转数字（v-for 遍历字符串
 *  会按字符逐项=只出 1 张卡），统一在此归一，同步消除 Invalid prop 警告 */
const cards = computed(() => {
  const n = Number(props.count)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6
})
</script>

<style scoped>
.hy-skeleton {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.hy-skeleton-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  /* 817 修复：骨架底色/描边接入主题 token——旧代码 var(--bg-color) 无映射时回退 #fff，
     暗色模式下整块白色闪烁；链式回退保证画师后台（--card/--line）与旧环境均不白 */
  border: 1px solid var(--line, var(--border-color, #e5e5e5));
  border-radius: 8px;
  background: var(--card, var(--bg-color, #fff));
}
.hy-skeleton-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--line, var(--border-color, #e5e5e5));
}
.hy-skeleton-thumb::after,
.hy-skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%);
  transform: translateX(-100%);
  animation: hy-shimmer 1.4s ease-in-out infinite;
  animation-delay: calc(var(--i, 0) * 0.11s);
}
.hy-skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.hy-skeleton-line {
  position: relative;
  height: 12px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--line, var(--border-color, #e5e5e5));
}
.hy-skeleton-line--title { width: 55%; height: 14px; }
.hy-skeleton-line--sub { width: 75%; }
.hy-skeleton-line--meta { width: 40%; }
@keyframes hy-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .hy-skeleton-thumb::after,
  .hy-skeleton-line::after {
    animation: none;
  }
}
</style>
