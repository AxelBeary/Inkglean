/**
 * useStickyCta — 吸底约稿条可见性
 *
 * 监听一个"哨兵"元素（通常是 Hero 区），
 * 当哨兵滚出视口后显示吸底 CTA，回到视口时隐藏。
 *
 * 哨兵元素可能在异步组件（defineAsyncComponent）加载后才出现，
 * 因此用 watch 监听元素就绪，而非仅在 onMounted 读取一次。
 */
import { ref, watch, onUnmounted } from 'vue'

export function useStickyCta(sentinelRef) {
  const visible = ref(false)
  let observer = null

  const setup = (el) => {
    observer?.disconnect()
    if (!el) return
    observer = new IntersectionObserver(
      ([entry]) => {
        // 哨兵不可见（滚过去了）→ 显示吸底条
        visible.value = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(el)
  }

  // 哨兵元素就绪（或变化）时建立观察
  watch(sentinelRef, setup, { immediate: true })

  onUnmounted(() => {
    observer?.disconnect()
  })

  return { visible }
}
