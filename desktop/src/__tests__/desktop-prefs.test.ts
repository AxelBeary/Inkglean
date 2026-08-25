// 方向 A 测试①⑤：桌面布局偏好归一化 + 撕出状态持久化
// ① prefs 归一化：坏数据落默认永不抛错；today 强制不可隐（系统控制优先纪律）。
// ⑤ 撕出状态随偏好持久化：重开应用（新 store 实例）仍读到撕出态。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePrefsStore } from '../stores/prefs'

const KEY = 'shihui-desktop-prefs-v1'

function freshStore() {
  setActivePinia(createPinia())
  return usePrefsStore()
}

describe('prefs 归一化（坏数据落默认，永不抛错）', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('无数据落默认：全空 + 素纸 + 未专注 + 字号 16', () => {
    const prefs = freshStore()
    expect(prefs.prefs.hidden).toEqual([])
    expect(prefs.prefs.mount).toBe('plain')
    expect(prefs.prefs.torn).toEqual([])
    expect(prefs.prefs.focus).toBe(false)
    expect(prefs.prefs.fontSize).toBe(16)
  })

  it('坏 JSON 落默认不抛错', () => {
    localStorage.setItem(KEY, '{这不是json')
    const prefs = freshStore()
    expect(prefs.prefs.hidden).toEqual([])
    expect(prefs.prefs.mount).toBe('plain')
  })

  it('陈旧/非法值逐项落默认：today 强制剔除、非法装裱与撕出件被滤掉', () => {
    localStorage.setItem(KEY, JSON.stringify({
      hidden: ['today', 'ops', 'not-a-panel'],
      mount: 'gold-leaf',
      torn: ['timer', 'rocket'],
      focus: 'yes'
    }))
    const prefs = freshStore()
    expect(prefs.prefs.hidden).toEqual(['ops'])      // today 不可隐，非法 id 剔除
    expect(prefs.prefs.mount).toBe('plain')          // 非法装裱落素纸
    expect(prefs.prefs.torn).toEqual(['timer'])      // 非法撕出件剔除
    expect(prefs.prefs.focus).toBe(false)            // 非布尔落默认
  })

  it('toggleHidden 拒绝隐藏 today（系统控制优先）', async () => {
    const prefs = freshStore()
    prefs.toggleHidden('today')
    prefs.toggleHidden('ops')
    await nextTick()
    expect(prefs.prefs.hidden).toEqual(['ops'])
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { hidden: string[] }
    expect(persisted.hidden).toEqual(['ops'])
  })

  it('字号归一化：越界钳到 14~20，非法值落默认 16；setFontSize 同样钳位', async () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 99 }))
    const hi = freshStore()
    expect(hi.prefs.fontSize).toBe(20)

    localStorage.setItem(KEY, JSON.stringify({ fontSize: 3 }))
    const lo = freshStore()
    expect(lo.prefs.fontSize).toBe(14)

    localStorage.setItem(KEY, JSON.stringify({ fontSize: 'big' }))
    const bad = freshStore()
    expect(bad.prefs.fontSize).toBe(16)

    bad.setFontSize(18)
    await nextTick()
    expect(bad.prefs.fontSize).toBe(18)
    bad.setFontSize(99)
    expect(bad.prefs.fontSize).toBe(20)
    bad.setFontSize(1)
    expect(bad.prefs.fontSize).toBe(14)
  })
})

describe('撕出状态持久化（测试⑤）', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('撕出写入偏好文件，贴回移除；重开应用（新实例）读到撕出态', async () => {
    const prefs = freshStore()
    prefs.setTorn('timer', true)
    prefs.setTorn('deadline', true)
    await nextTick()

    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { torn: string[] }
    expect(raw.torn.sort()).toEqual(['deadline', 'timer'])

    // 「重开应用」= 全新 store 实例，从本机偏好回读
    const reopened = freshStore()
    expect(reopened.isTorn('timer')).toBe(true)
    expect(reopened.isTorn('deadline')).toBe(true)
    expect(reopened.isTorn('today-todo')).toBe(false)

    // 贴回后持久化同步移除
    reopened.setTorn('timer', false)
    await nextTick()
    const raw2 = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { torn: string[] }
    expect(raw2.torn).toEqual(['deadline'])
  })

  it('装裱与专注同样持久化回读', async () => {
    const prefs = freshStore()
    prefs.setMount('indigo')
    prefs.setFocus(true)
    await nextTick()

    const reopened = freshStore()
    expect(reopened.prefs.mount).toBe('indigo')
    expect(reopened.prefs.focus).toBe(true)
  })
})
