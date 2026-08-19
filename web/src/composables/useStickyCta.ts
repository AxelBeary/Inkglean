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
import type { Ref } from 'vue'

export function useStickyCta(sentinelRef: Ref<unknown>) {
  const visible = ref(false)
  let observer: IntersectionObserver | null = null

  const setup = (el: unknown) => {
    observer?.disconnect()
    // 兼容两种哨兵来源：
    // 1) DOM 元素（直接传 el）
    // 2) 异步组件实例（el.sentinelEl 是 defineExpose 的模板 ref，经 expose proxy 已自动 unwrap 为 DOM 元素）
    const sentinel = (el as { sentinelEl?: unknown } | null)?.sentinelEl || el
    if (!sentinel || !(sentinel instanceof Element)) return
    observer = new IntersectionObserver(
      ([entry]) => {
        // 哨兵不可见（滚过去了）→ 显示吸底条
        visible.value = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(sentinel)
  }

  // 哨兵元素就绪（或变化）时建立观察
  watch(sentinelRef, setup, { immediate: true })

  onUnmounted(() => {
    observer?.disconnect()
  })

  return { visible }
}
