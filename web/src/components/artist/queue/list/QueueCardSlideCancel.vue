<template>
  <!-- R30e: 取消订单滑块确认（替代普通弹窗，防误触）
       （F-09 巨型文件拆分批·丁：自 QueueBoardList.vue 原样搬入；滑块进度、在途锁与取消请求全部留在父组件，
        三个指针处理函数按既有函数 prop 口径直传（监听器即父组件函数本身，e.currentTarget 语义与拆分前一致）） -->
  <div class="slide-cancel-row">
    <div class="slide-cancel">
      <div class="slide-cancel-fill" :style="{ width: `calc(${progress} * 100%)` }"></div>
      <span class="slide-cancel-label">{{ $t('queue.slideToCancel') }}</span>
      <div
        class="slide-cancel-thumb"
        :style="{ left: `calc(2px + ${progress} * (100% - 40px))` }"
        @pointerdown="slideStart"
        @pointermove="slideMove"
        @pointerup="slideEnd"
      >
        →
      </div>
    </div>
    <el-button
      text size="small" type="danger"
      :disabled="busy"
      @click="emit('confirm')"
    >
      {{ $t('queue.slideCancelConfirm') }}
    </el-button>
    <el-button text size="small" :aria-label="$t('common.close')" @click="emit('close')">✕</el-button>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

defineProps({
  // 滑块进度 0~1（父组件 slideProgress）
  progress: { type: Number, required: true },
  // 取消请求在途锁（父组件 cancellingBusyId === element.id）
  busy: Boolean,
  // ─── 以下三个指针处理函数为父组件既有 handler（函数 prop，口径同 refreshNow/guardDrop） ───
  slideStart: { type: Function as PropType<(e: PointerEvent) => void>, required: true },
  slideMove: { type: Function as PropType<(e: PointerEvent) => void>, required: true },
  slideEnd: { type: Function as PropType<(e: PointerEvent) => void>, required: true }
})
const emit = defineEmits(['confirm', 'close'])
</script>

<style scoped>
/* ─── 以下样式自 QueueBoardList.vue 原样搬入（值/选择器零改动） ─── */
/* R30e: 滑块确认（整行，拖到底触发取消） */
.slide-cancel-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.slide-cancel {
  position: relative;
  flex: 1;
  height: 40px;
  border-radius: 999px;
  background: var(--zs-t);
  border: 1px solid color-mix(in srgb, var(--zs) 45%, transparent);
  overflow: hidden;
  user-select: none;
}
.slide-cancel-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: color-mix(in srgb, var(--zs) 28%, transparent);
  transition: width 0.05s linear;
}
.slide-cancel-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600;
  color: var(--zs);
  pointer-events: none;
}
.slide-cancel-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--zs);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-cancel-thumb:active { cursor: grabbing; }
</style>
