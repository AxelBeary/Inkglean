/**
 * useScrollReveal — 滚动渐入
 *
 * 给带 .tpl-reveal 类的元素挂 IntersectionObserver，
 * 进入视口时加 .tpl-visible 触发 CSS 动画（templates.css）。
 *
 * 模板通过 defineAsyncComponent 异步加载，.tpl-reveal 元素可能在
 * 父组件 onMounted 之后才插入 DOM，因此用 MutationObserver 监听
 * 新增节点，动态补挂观察。尊重 prefers-reduced-motion（CSS 层已降级）。
 */
import { onMounted, onUnmounted, nextTick } from 'vue'

export function useScrollReveal(containerRef) {
  let io = null
  let mo = null

  const observe = (el) => {
    if (el.classList.contains('tpl-visible')) return
    io.observe(el)
  }

  const scan = (root) => {
    root.querySelectorAll('.tpl-reveal').forEach(observe)
  }

  onMounted(async () => {
    await nextTick()
    const root = containerRef?.value || document

    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('tpl-visible')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    scan(root)

    // 监听异步组件插入的新节点，补挂观察
    mo = new MutationObserver(() => scan(root))
    mo.observe(root, { childList: true, subtree: true })
  })

  onUnmounted(() => {
    io?.disconnect()
    mo?.disconnect()
  })
}
