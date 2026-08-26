// 本地核心环波13 测试：暗色主题——主题解析纯函数 + 偏好归一化（口径哨兵）。
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { resolveTheme } from '../tools/theme'
import { usePrefsStore } from '../stores/prefs'

beforeEach(() => localStorage.clear())

describe('resolveTheme（偏好 × 系统深色）', () => {
  it('light/dark 偏好优先于系统', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('auto 跟随系统；未知偏好落 auto 口径', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme(undefined, true)).toBe('dark')
    expect(resolveTheme('banana', false)).toBe('light')
  })
})

describe('主题偏好归一化（prefs）', () => {
  it('默认 auto', () => {
    setActivePinia(createPinia())
    const prefs = usePrefsStore()
    expect(prefs.prefs.theme).toBe('auto')
  })

  it('setTheme 写入并持久化', async () => {
    setActivePinia(createPinia())
    const prefs = usePrefsStore()
    prefs.setTheme('dark')
    expect(prefs.prefs.theme).toBe('dark')
    await nextTick() // watch 落盘异步，冲刷后再读
    const saved = JSON.parse(localStorage.getItem('shihui-desktop-prefs-v1') ?? '{}') as { theme?: string }
    expect(saved.theme).toBe('dark')
  })

  it('坏值落 auto（归一化纪律）', () => {
    localStorage.setItem('shihui-desktop-prefs-v1', JSON.stringify({ theme: 'neon' }))
    setActivePinia(createPinia())
    const prefs = usePrefsStore()
    expect(prefs.prefs.theme).toBe('auto')
  })
})
