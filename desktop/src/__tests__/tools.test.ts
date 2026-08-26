// 工具箱波2 测试：zh 词典 t 函数（插值/缺词回退）+ 文件保存桥逃生门。
import { describe, it, expect, afterEach } from 'vitest'
import { zhT, ZH_DICT_KEYS } from '../tools/i18n-zh'
import { saveFile, BridgeUnavailableError } from '../bridge'

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

describe('文件保存桥逃生门', () => {
  it('saveFile 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(saveFile('C:\\x.png', new Uint8Array([1]))).rejects.toThrow(BridgeUnavailableError)
  })
})
