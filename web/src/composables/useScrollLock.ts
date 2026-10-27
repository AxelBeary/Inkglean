import { onUnmounted, watch, type Ref } from 'vue'

// 引用计数：多个浮层同时打开时，先关的那个不能替还开着的解锁
let locks = 0

function applyLock(on: boolean) {
  if (typeof document === 'undefined') return
  locks = on ? locks + 1 : Math.max(0, locks - 1)
  document.documentElement.style.overflow = locks > 0 ? 'hidden' : ''
}

/** 浮层打开时锁页面滚动；关闭或组件卸载即释放 */
export function useScrollLock(active: Ref<boolean>) {
  let held = false
  watch(active, (v) => {
    if (v === held) return
    held = v
    applyLock(v)
  }, { immediate: true })
  onUnmounted(() => {
    if (!held) return
    held = false
    applyLock(false)
  })
}
