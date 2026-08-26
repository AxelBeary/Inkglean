// 本地核心环波8 测试：F8 二期自动识别——窗口分类/单票归属纯函数 + 监听桥逃生门。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  classifyWindow, attributeTick, AFK_SECS, POLL_SECS, useAutoTimeStore
} from '../stores/autoTime'
import { foregroundTitle, inputIdleSecs } from '../bridge/monitor'
import { BridgeUnavailableError } from '../bridge'

const win = window as unknown as Record<string, unknown>

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => { delete win.__TAURI_INTERNALS__ })

describe('classifyWindow（窗口标题分类口径）', () => {
  it('绘图软件=在画（CSP/PS/SAI/Krita）', () => {
    expect(classifyWindow('头像.clip – CLIP STUDIO PAINT')).toBe('paint')
    expect(classifyWindow('wip.psd - Photoshop')).toBe('paint')
    expect(classifyWindow('untitled - PaintTool SAI')).toBe('paint')
    expect(classifyWindow('SAI - [线稿]')).toBe('paint')
    expect(classifyWindow('Krita – 草稿')).toBe('paint')
  })

  it('浏览器/游戏平台=摸鱼', () => {
    expect(classifyWindow('bilibili (゜-゜)つロ - Google Chrome')).toBe('fish')
    expect(classifyWindow('某视频 - Microsoft Edge')).toBe('fish')
    expect(classifyWindow('Steam')).toBe('fish')
  })

  it('文档/通讯/空标题=中立', () => {
    expect(classifyWindow('文档1 - Word')).toBe('neutral')
    expect(classifyWindow('QQ')).toBe('neutral')
    expect(classifyWindow('')).toBe('neutral')
  })

  it('sai 子串不误伤无关词（边界词匹配）', () => {
    expect(classifyWindow('saitama - Chrome')).toBe('fish') // 浏览器优先无所谓，关键不误判 paint
    expect(classifyWindow('备忘录 - 武士道 saishu')).toBe('neutral')
  })
})

describe('attributeTick（单票归属：AFK 优先）', () => {
  it('空闲超阈判离开，即使前台是绘图软件', () => {
    expect(attributeTick(AFK_SECS, 'CLIP STUDIO PAINT', AFK_SECS)).toBe('idle')
    expect(attributeTick(AFK_SECS + 60, 'CLIP STUDIO PAINT', AFK_SECS)).toBe('idle')
  })

  it('空闲未超阈按窗口分类', () => {
    expect(attributeTick(10, 'CLIP STUDIO PAINT', AFK_SECS)).toBe('paint')
    expect(attributeTick(10, 'Chrome', AFK_SECS)).toBe('fish')
    expect(attributeTick(10, 'Word', AFK_SECS)).toBe('neutral')
  })

  it('空闲读数不可用（null）时只按窗口分类', () => {
    expect(attributeTick(null, 'CLIP STUDIO PAINT', AFK_SECS)).toBe('paint')
  })

  it('采样周期为 30 秒（口径哨兵：改动须同步更新占比计算与文档）', () => {
    expect(POLL_SECS).toBe(30)
    expect(AFK_SECS).toBe(300)
  })
})

describe('autoTime store（纯浏览器环境降级）', () => {
  it('loadToday 在浏览器环境标记不可用', async () => {
    const store = useAutoTimeStore()
    await store.loadToday()
    expect(store.unavailable).toBe(true)
    expect(store.loaded).toBe(true)
    expect(store.hasData).toBe(false)
  })

  it('start 在浏览器环境不落轮询（幂等无副作用）', () => {
    const store = useAutoTimeStore()
    store.start()
    store.stop()
    expect(store.hasData).toBe(false)
  })

  it('监听桥在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(foregroundTitle()).rejects.toThrow(BridgeUnavailableError)
    await expect(inputIdleSecs()).rejects.toThrow(BridgeUnavailableError)
  })
})
