<script setup lang="ts">
// 815 拍板 #1：取消后 5 秒撤销提示（右下角，倒计时 + 撤销按钮；与账本"墨迹未干"同节奏）
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** 订单标识文案（订单号或客户名） */
  label: { type: String, default: '' },
  /** 撤销窗口毫秒数（后端下发 undoWindowMs） */
  windowMs: { type: Number, default: 5000 }
})

const emit = defineEmits(['undo', 'expire'])
const { t } = useI18n()

const remainMs = ref(props.windowMs)
let timer: ReturnType<typeof setInterval> | null = null

const seconds = computed(() => Math.max(0, Math.ceil(remainMs.value / 1000)))
const progress = computed(() => Math.max(0, Math.min(1, remainMs.value / props.windowMs)))

onMounted(() => {
  const startedAt = Date.now()
  timer = setInterval(() => {
    remainMs.value = props.windowMs - (Date.now() - startedAt)
    if (remainMs.value <= 0) {
      clearInterval(timer!)
      timer = null
      emit('expire')
    }
  }, 100)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

function onUndo() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  emit('undo')
}
</script>

<template>
  <div class="cancel-undo-toast" role="status">
    <div class="cut-body">
      <span class="cut-text">{{ t('orderDetail.cancelUndoHint', { label, s: seconds }) }}</span>
      <button type="button" class="cut-btn" @click="onUndo">{{ t('orderDetail.cancelUndoBtn') }}</button>
    </div>
    <div class="cut-bar">
      <div class="cut-bar-fill" :style="{ width: progress * 100 + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.cancel-undo-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 3000;
  min-width: 260px;
  max-width: 360px;
  background: var(--card, #fff);
  border: 1px solid var(--line, #E5E2DA);
  border-radius: var(--r-m, 10px);
  box-shadow: 0 6px 24px rgba(31, 30, 25, 0.14);
  overflow: hidden;
}
.cut-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}
.cut-text {
  font-size: 13px;
  color: var(--ink, #1F1E19);
}
.cut-btn {
  flex-shrink: 0;
  padding: 4px 14px;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--sb-text-on, #fff);
  background: var(--hq, #2D5F5B);
  border: none;
  border-radius: var(--r-s, 6px);
  cursor: pointer;
}
.cut-btn:hover { opacity: 0.9; }
.cut-bar { height: 3px; background: var(--line, #E5E2DA); }
.cut-bar-fill {
  height: 100%;
  background: var(--hq, #2D5F5B);
  transition: width 0.1s linear;
}
</style>
