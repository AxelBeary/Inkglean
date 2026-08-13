<template>
  <Teleport to="body">
    <Transition name="undo-toast">
      <div v-if="visible" class="undo-toast" role="status">
        <span class="undo-toast-msg">{{ message }}</span>
        <button class="undo-toast-btn" :disabled="undoing" @click="onUndo">{{ label }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// v0.36 波1: 破坏性操作软撤销提示（时间条拖拽改期后弹出，5 秒自动消失）
// ElMessage 不支持 action 按钮，故自写 fixed 小组件；深色背景白字，视觉重量参考 ElMessage
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  message: { type: String, default: '' },
  /** 撤销按钮文案（由父组件传入已翻译文本，组件自身不依赖 i18n 键） */
  label: { type: String, default: 'Undo' },
  /** 自动消失时长（ms） */
  duration: { type: Number, default: 5000 }
})
const emit = defineEmits(['undo', 'timeout'])

const undoing = ref(false)
let timer = null

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null }
}

/** 撤销按钮一次性：点击后进入 undoing 态并通知父组件执行恢复 */
function onUndo() {
  if (undoing.value) return
  undoing.value = true
  clearTimer()
  emit('undo')
}

// visible 变 true → 启动倒计时，超时通知父组件关闭；重新弹出时重置 undoing
watch(() => props.visible, (v) => {
  clearTimer()
  undoing.value = false
  if (v) timer = setTimeout(() => emit('timeout'), props.duration)
}, { immediate: true })

onBeforeUnmount(clearTimer)
</script>

<style scoped>
.undo-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(90vw, 480px);
  padding: 10px 16px;
  background: rgba(30, 32, 36, 0.92);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  font-size: calc(var(--font-scale, 1) * 13px);
  color: #fff;
}
.undo-toast-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.undo-toast-btn {
  flex-shrink: 0;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: none;
  color: #7ab3ff;
  font-size: calc(var(--font-scale, 1) * 13px);
  font-weight: 600;
  cursor: pointer;
}
.undo-toast-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.undo-toast-btn:disabled { opacity: 0.5; cursor: default; }
.undo-toast-enter-active, .undo-toast-leave-active { transition: opacity var(--dur-mid), transform var(--dur-mid); }
.undo-toast-enter-from, .undo-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
