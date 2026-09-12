<template>
  <!-- 拖拽把手 + 键盘等价：上移/下移（拖拽排序的可达替代，走同一条 drag-end 持久化）
       （F-09 巨型文件拆分批·丁：自 QueueBoardList.vue 原样搬入；顺序写回与 drag-end 持久化仍归父组件 moveQueueItem，
        本卡只上报方向。多根片段：两个 div 仍是 .queue-item 的相邻子节点，DOM 顺序与拆分前完全一致） -->
  <div class="drag-handle" :title="$t('queue.dragHint')" aria-hidden="true">⠿</div>
  <div class="queue-move" role="group" :aria-label="$t('queue.reorderLabel')">
    <button
      type="button" class="queue-move-btn" :disabled="index === 0"
      :aria-label="$t('queue.moveUp')" :title="$t('queue.moveUp')"
      @click.stop="emit('move', -1)"
    >
      ↑
    </button>
    <button
      type="button" class="queue-move-btn" :disabled="isLast"
      :aria-label="$t('queue.moveDown')" :title="$t('queue.moveDown')"
      @click.stop="emit('move', 1)"
    >
      ↓
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps({
  // 卡片在正式队列中的序号（上移禁用态判定，与原模板 index === 0 同式）
  index: { type: Number, required: true },
  // 是否最后一张（原模板 index === queue.length - 1 判定，表达式留在父组件）
  isLast: Boolean
})
const emit = defineEmits(['move'])
</script>

<style scoped>
/* ─── 以下样式自 QueueBoardList.vue 原样搬入（值/选择器零改动） ─── */
.drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 20px); color: var(--ink3); user-select: none; }
.drag-handle:active { cursor: grabbing; }
.queue-move { display: inline-flex; gap: 1px; flex-shrink: 0; }
.queue-move-btn {
  width: 24px; height: 24px; padding: 0;
  border: none; border-radius: var(--r-s);
  background: none; color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 700; line-height: 1;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.queue-move-btn:hover:not(:disabled) { color: var(--hq); background: var(--hq-t); }
.queue-move-btn:disabled { opacity: 0.35; cursor: default; }
</style>
