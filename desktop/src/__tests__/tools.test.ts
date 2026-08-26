// 工具箱波2 测试：zh 词典 t 函数（插值/缺词回退/覆盖）+ 文件桥逃生门 + F6 档案归一化。
import { describe, it, expect, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { zhT, makeT, ZH_DICT_KEYS } from '../tools/i18n-zh'
import { saveFile, readFileB64, BridgeUnavailableError } from '../bridge'
import { normalizeProfile, splitTags, useLocalProfileStore } from '../stores/localProfile'

const win = window as unknown as Record<string, unknown>

afterEach(() => {
  delete win.__TAURI_INTERNALS__
})

describe('桌面工具箱 t（shared 哑组件注入口径）', () => {
  it('词典命中返回中文词条', () => {
    expect(zhT('priceCard.title')).toBe('价目分享卡')
    expect(zhT('receipt.title')).toBe('小票打印机')
  })

  it('{param} 插值', () => {
    expect(zhT('priceCard.importOk', { n: 5 })).toBe('已导入 5 档')
    expect(zhT('priceCard.contactLine', { contact: 'QQ 123' })).toBe('联系：QQ 123')
  })

  it('缺参保留占位（不吞不装死）', () => {
    expect(zhT('priceCard.importOk')).toBe('已导入 {n} 档')
  })

  it('缺词回退键名本身（排查可见）', () => {
    expect(zhT('not.a.key')).toBe('not.a.key')
  })

  it('词典覆盖两工具核心词条（防漂移哨兵）', () => {
    for (const key of [
      'priceCard.exportPng', 'priceCard.copyText', 'priceCard.tiersLabel',
      'receipt.exportPng', 'receipt.copyText', 'receipt.itemsLabel'
    ]) {
      expect(ZH_DICT_KEYS).toContain(key)
    }
  })
})

describe('文件桥逃生门', () => {
  it('saveFile 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(saveFile('C:\\x.png', new Uint8Array([1]))).rejects.toThrow(BridgeUnavailableError)
  })

  it('readFileB64 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(readFileB64('C:\\a.jpg')).rejects.toThrow(BridgeUnavailableError)
  })
})

describe('F6 本地档案（波4）', () => {
  it('makeT 覆盖优先于词典（署名复用口径）', () => {
    const t = makeT({ 'priceCard.signText': '星野' })
    expect(t('priceCard.signText')).toBe('星野')
    expect(t('priceCard.title')).toBe('价目分享卡') // 未覆盖键照旧走词典
  })

  it('normalizeProfile 坏形状落空档案', () => {
    expect(normalizeProfile(null).nickname).toBe('')
    expect(normalizeProfile({ nickname: 42, intro: '画头像的' }).intro).toBe('画头像的')
    expect(normalizeProfile({ nickname: 42 }).nickname).toBe('')
  })

  it('splitTags 多分隔符去空去重', () => {
    expect(splitTags('日系，厚涂、 Q版,,日系')).toEqual(['日系', '厚涂', 'Q版'])
    expect(splitTags('  ')).toEqual([])
  })

  it('档案 store 在浏览器环境静默降级', async () => {
    setActivePinia(createPinia())
    const store = useLocalProfileStore()
    await store.load()
    expect(store.unavailable).toBe(true)
    expect(store.loaded).toBe(true)
    expect(await store.save({ nickname: 'x', avatar_b64: '', intro: '', tags: '' })).toBe(false)
  })
})
