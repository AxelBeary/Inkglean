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
import type { Ref } from 'vue'

export function useScrollReveal(containerRef?: Ref<HTMLElement | null | undefined> | null) {
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null
  // a3: 卸载标记——onMounted 在 nextTick 前卸载时，续建前先检查，避免 observer 挂在 document 上永不清理
  let disposed = false
  // F0250: 已观察元素集合——避免每次 DOM 变更都重复 observe 同一批节点
  const observed = new WeakSet<Element>()

  const observe = (el: Element) => {
    if (observed.has(el) || el.classList.contains('tpl-visible')) return
    observed.add(el)
    io!.observe(el)
  }

  const scan = (root: ParentNode) => {
    root.querySelectorAll('.tpl-reveal').forEach(observe)
  }

  onMounted(async () => {
    await nextTick()
    if (disposed) return
    const root = containerRef?.value || document

    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('tpl-visible')
            io!.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    scan(root)

    // F0250: 只扫描本次新增的节点，不再对每次 DOM 变更做全树扫描（重复 observe 由 WeakSet 拦截）
    mo = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.classList.contains('tpl-reveal')) observe(node)
          scan(node) // 新增子树内的 .tpl-reveal
        }
      }
    })
    mo.observe(root, { childList: true, subtree: true })
  })

  onUnmounted(() => {
    disposed = true
    io?.disconnect()
    mo?.disconnect()
  })
}
