// #56-6：浮层滚动锁——引用计数，多个浮层同时打开时先关的不替还开着的解锁
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollLock } from '../useScrollLock'

function host(active: Ref<boolean>) {
  return defineComponent({
    setup() {
      useScrollLock(active)
      return () => h('div')
    }
  })
}

const overflow = () => document.documentElement.style.overflow
const mounted: Array<{ unmount: () => void }> = []
function mountHost(active: Ref<boolean>) {
  const w = mount(host(active))
  mounted.push(w)
  return w
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.documentElement.style.overflow = ''
})

describe('useScrollLock', () => {
  it('打开锁、关闭还原', async () => {
    const active = ref(false)
    mountHost(active)
    expect(overflow()).toBe('')
    active.value = true
    await nextTick()
    expect(overflow()).toBe('hidden')
    active.value = false
    await nextTick()
    expect(overflow()).toBe('')
  })

  it('两个浮层同时打开：先关一个仍保持锁定，全关才还原', async () => {
    const a = ref(true)
    const b = ref(true)
    mountHost(a)
    mountHost(b)
    await nextTick()
    expect(overflow()).toBe('hidden')
    a.value = false
    await nextTick()
    expect(overflow()).toBe('hidden')
    b.value = false
    await nextTick()
    expect(overflow()).toBe('')
  })

  it('组件在打开状态被卸载：自动释放，不把页面锁死', async () => {
    const active = ref(true)
    const w = mountHost(active)
    await nextTick()
    expect(overflow()).toBe('hidden')
    w.unmount()
    mounted.splice(mounted.indexOf(w), 1)
    expect(overflow()).toBe('')
  })
})
