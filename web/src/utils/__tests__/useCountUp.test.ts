// useCountUp 减少动效口径回归（#56 时序病）
// 原缺陷：模块级常量在 import 时读一次系统偏好——后台「减少动效」开关是 ArtistLayout 挂载后
// 才写入 html[data-reduce-motion] 的，常量口径永远错过它（且首屏后就再不重读）。
// 现口径：run() 调用时读 isReducedMotion()，命中即直接落终值、一帧都不排。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useCountUp } from '../useCountUp'
import { applyReduceMotion } from '../animSpeed'

function mountCounter(get: () => number) {
  const Comp = defineComponent({
    setup() {
      // 返回的是 reactive 壳，消费方按 obj.display 取值（同 StatCards 口径，不可解构）
      const cu = useCountUp(get, { duration: 600 })
      return () => h('span', String(cu.display))
    }
  })
  return mount(Comp)
}

describe('useCountUp：减少动效在调用时判定', () => {
  let systemReduce = false

  beforeEach(() => {
    systemReduce = false
    delete document.documentElement.dataset.reduceMotion
    vi.spyOn(window, 'matchMedia').mockImplementation(((query: string) => ({
      media: query,
      matches: query.includes('prefers-reduced-motion') && systemReduce
    })) as unknown as typeof window.matchMedia)
    vi.spyOn(window, 'requestAnimationFrame')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应用内开关打开 → 首帧即为终值，且不排 rAF', () => {
    applyReduceMotion(true)
    const w = mountCounter(() => 128)
    expect(w.text()).toBe('128')
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('开关关闭 → 走滚动动画（首帧不是终值，rAF 有排）', async () => {
    const w = mountCounter(() => 128)
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(w.text()).not.toBe('128')
    await nextTick()
  })

  it('中途改开关即刻生效：上一次 mount 用动画，下一次 mount 直落终值（证明未缓存）', () => {
    mountCounter(() => 50)
    applyReduceMotion(true)
    const w2 = mountCounter(() => 50)
    expect(w2.text()).toBe('50')
  })

  it('目标值变化时同样按当下口径处理（reduced 下从当前值直跳新值）', async () => {
    applyReduceMotion(true)
    const target = ref(10)
    const w = mountCounter(() => target.value)
    expect(w.text()).toBe('10')
    target.value = 90
    await nextTick()
    expect(w.text()).toBe('90')
  })
})
