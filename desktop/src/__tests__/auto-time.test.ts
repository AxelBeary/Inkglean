// 本地核心环波8/11 测试：F8 二期自动识别——窗口分类/单票归属纯函数 + 监听桥逃生门；
// 波11 归属匹配：标题解析 + 工时归单规则。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  classifyWindow, attributeTick, extractDocName, matchOrderForTitle,
  AFK_SECS, POLL_SECS, useAutoTimeStore
} from '../stores/autoTime'
import { foregroundTitle, inputIdleSecs } from '../bridge/monitor'
import { BridgeUnavailableError } from '../bridge'
import type { LocalOrder } from '../stores/localLedger'

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

// ─── 波11：归属匹配（窗口标题↔委托，工时归单） ───
function order(p: Partial<LocalOrder>): LocalOrder {
  return {
    id: p.id ?? 1, client_name: p.client_name ?? '张三', title: p.title ?? '头像',
    price: p.price ?? 100, deadline: p.deadline ?? null, status: p.status ?? 'in_progress',
    created_at: '', updated_at: ''
  }
}

describe('extractDocName（绘图软件标题解析）', () => {
  it('CSP/PS/SAI 三种标题格式都取到文档名', () => {
    expect(extractDocName('张三-头像.clip – CLIP STUDIO PAINT')).toBe('张三-头像.clip')
    expect(extractDocName('wip.psd - Photoshop')).toBe('wip.psd')
    expect(extractDocName('线稿 - PaintTool SAI')).toBe('线稿')
  })

  it('无分段/无扩展名取首段', () => {
    expect(extractDocName('untitled')).toBe('untitled')
    expect(extractDocName('')).toBe('')
  })
})

describe('matchOrderForTitle（工时归单规则）', () => {
  it('模板命名「客户名-档位名」命中（波5 联动）', () => {
    const m = matchOrderForTitle('张三-头像.clip – CLIP STUDIO PAINT', [order({ id: 9 })])
    expect(m?.id).toBe(9)
  })

  it('档位（委托内容）匹配优先于客户名', () => {
    const byClient = order({ id: 1, client_name: '李四', title: '全身' })
    const byTitle = order({ id: 2, client_name: '张三', title: '头像' })
    // 文档名含「头像」不含任何客户名→归 title 命中的单；另造一例验证优先级：同时含两者时 title 优先
    const m = matchOrderForTitle('头像稿.clip – CLIP STUDIO PAINT', [byClient, byTitle])
    expect(m?.id).toBe(2)
    const both = matchOrderForTitle('李四-头像.csp – CLIP STUDIO PAINT', [
      order({ id: 3, client_name: '李四', title: '背景' }),
      order({ id: 4, client_name: '张三', title: '头像' })
    ])
    expect(both?.id).toBe(4)
  })

  it('跨软件不断档：CSP 换 PS 标题都含同一客户，归同一单', () => {
    const orders = [order({ id: 5, client_name: '王五', title: '半身' })]
    expect(matchOrderForTitle('王五-半身.clip – CLIP STUDIO PAINT', orders)?.id).toBe(5)
    expect(matchOrderForTitle('王五-半身.psd - Photoshop', orders)?.id).toBe(5)
  })

  it('非绘图窗口/无匹配返 null（不误归）', () => {
    const orders = [order({ id: 5, client_name: '王五' })]
    expect(matchOrderForTitle('王五的文件 - Google Chrome', orders)).toBeNull()
    expect(matchOrderForTitle(' unrelated.clip – CLIP STUDIO PAINT', orders)).toBeNull()
    expect(matchOrderForTitle('', orders)).toBeNull()
  })
})
