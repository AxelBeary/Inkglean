<template>
  <!-- R45/C59: 批量删除 ≥3 条用滑块确认
       （F-09 拆分·施工员戊：自 ArtworkManage.vue 原样搬入；选中集与逐条删除写路径仍归父组件，本弹窗只管确认与上报） -->
  <el-dialog v-model="visible" :title="$t('artworks.batchDeleteTitle')" width="400px" class="artwork-dialog" @closed="slideProgress = 0">
    <p class="batch-slide-hint">{{ $t('artworks.batchDeleteConfirm', { n: count }) }}</p>
    <div class="slide-confirm">
      <div class="slide-confirm-fill" :style="{ width: `calc(${slideProgress} * 100%)` }"></div>
      <span class="slide-confirm-label">{{ $t('artworks.slideToDelete') }}</span>
      <div
        class="slide-confirm-thumb"
        :style="{ left: `calc(2px + ${slideProgress} * (100% - 40px))` }"
        @pointerdown="onSlideStart"
        @pointermove="onSlideMove"
        @pointerup="onSlideEnd"
      >
        →
      </div>
    </div>
    <!-- 键盘等价：滑块确认的替代按钮路径（滑块保持可用） -->
    <div class="batch-slide-alt">
      <el-button type="danger" size="small" @click="confirmBatchDelete">
        {{ $t('artworks.batchDeleteBtn') }}
      </el-button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSlideConfirm } from '../../../composables/useSlideConfirm'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 已选条数（父组件 selectedIds.size，文案插值用） */
  count: { type: Number, required: true }
})
const emit = defineEmits(['update:modelValue', 'confirmed'])

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const {
  progress: slideProgress,
  onStart: onSlideStart,
  onMove: onSlideMove,
  onEnd: onSlideEnd
} = useSlideConfirm({
  onConfirm: async () => {
    visible.value = false
    emit('confirmed')
  }
})

/** 键盘替代路径：直接确认批量删除（与滑块滑到底行为一致） */
async function confirmBatchDelete() {
  visible.value = false
  emit('confirmed')
}
</script>

<style scoped>
/* ─── 以下样式自 ArtworkManage.vue 原样搬入（选择器/值零改动） ─── */
/* .slide-confirm 系列样式自始至终来自全局纸墨样式，本文件不重复声明（口径不变） */
/* 滑块确认（与 OrderDetail/QueueBoard 视觉一致，朱砂=危险操作） */
.batch-slide-hint { font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); margin-bottom: 16px; }
.batch-slide-alt { margin-top: 12px; display: flex; justify-content: center; }
/* v0.35 波3: 弹窗纸墨化（与作品编辑弹窗同款，scoped 各自持有） */
.artwork-dialog :deep(.el-dialog) { border-radius: var(--r-l); }
.artwork-dialog :deep(.el-dialog__title) { font-weight: 700; color: var(--ink); }
</style>
