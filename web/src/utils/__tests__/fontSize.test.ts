// utils/fontSize 后台字号滑块共享模块测试（818-A）
// 覆盖：旧三档映射 / 非法值与无值回落默认 15 / 读写应用清理 / dataset 契约
import { describe, it, expect, beforeEach } from 'vitest'
import {
  FONT_SIZE_KEY,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
  normalizeFontSize,
  readFontSize,
  writeFontSize,
  applyFontSize,
  clearFontSize
} from '../fontSize.js'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.fontSize
})

describe('fontSize 档位常量与归一化', () => {
  it('范围常量 14~20、默认 15', () => {
    expect(FONT_SIZE_MIN).toBe(14)
    expect(FONT_SIZE_MAX).toBe(20)
    expect(FONT_SIZE_DEFAULT).toBe(15)
  })

  it('旧三档映射：large→15、xlarge→17、normal→默认 15', () => {
    expect(normalizeFontSize('large')).toBe(15)
    expect(normalizeFontSize('xlarge')).toBe(17)
    expect(normalizeFontSize('normal')).toBe(15)
  })

  it('无值/非法值一律落回默认 15', () => {
    expect(normalizeFontSize(undefined)).toBe(15)
    expect(normalizeFontSize(null)).toBe(15)
    expect(normalizeFontSize('')).toBe(15)
    expect(normalizeFontSize('abc')).toBe(15)
    expect(normalizeFontSize('13')).toBe(15)
    expect(normalizeFontSize('21')).toBe(15)
    expect(normalizeFontSize('15.5')).toBe(15)
    expect(normalizeFontSize({} as unknown as string)).toBe(15)
  })

  it('14~20 整数档（字符串或数字）原样通过', () => {
    for (let n = FONT_SIZE_MIN; n <= FONT_SIZE_MAX; n += 1) {
      expect(normalizeFontSize(String(n))).toBe(n)
      expect(normalizeFontSize(n)).toBe(n)
    }
  })
})

describe('fontSize 读写', () => {
  it('readFontSize 读取数字字符串并返回数字档', () => {
    localStorage.setItem(FONT_SIZE_KEY, '18')
    expect(readFontSize()).toBe(18)
  })

  it('readFontSize 对旧值/无值/非法值归一化（不抛错）', () => {
    expect(readFontSize()).toBe(15)
    localStorage.setItem(FONT_SIZE_KEY, 'xlarge')
    expect(readFontSize()).toBe(17)
    localStorage.setItem(FONT_SIZE_KEY, 'oops')
    expect(readFontSize()).toBe(15)
  })

  it('writeFontSize 统一存数字字符串并返回归一化档位', () => {
    expect(writeFontSize(16)).toBe(16)
    expect(localStorage.getItem(FONT_SIZE_KEY)).toBe('16')
    expect(writeFontSize('large')).toBe(15)
    expect(localStorage.getItem(FONT_SIZE_KEY)).toBe('15')
  })
})

describe('fontSize 应用与清理', () => {
  it('applyFontSize 设置 dataset（默认 15 也显式设置）', () => {
    expect(applyFontSize(17)).toBe(17)
    expect(document.documentElement.dataset.fontSize).toBe('17')
    expect(applyFontSize(undefined)).toBe(15)
    expect(document.documentElement.dataset.fontSize).toBe('15')
  })

  it('clearFontSize 移除存储并摘掉 dataset', () => {
    writeFontSize(20)
    applyFontSize(20)
    clearFontSize()
    expect(localStorage.getItem(FONT_SIZE_KEY)).toBeNull()
    expect(document.documentElement.dataset.fontSize).toBeUndefined()
  })
})
