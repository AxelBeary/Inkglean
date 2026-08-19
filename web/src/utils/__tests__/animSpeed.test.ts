// utils/animSpeed 后台动画速度 + 减少动效共享模块测试（819-G）
// 覆盖：档位常量 / 归一化（旧值、无值、非法回落默认 1）/ 读写应用清理 / dataset 契约
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANIM_SPEED_KEY,
  ANIM_SPEED_MIN,
  ANIM_SPEED_MAX,
  ANIM_SPEED_STEP,
  ANIM_SPEED_DEFAULT,
  ANIM_SPEED_OPTIONS,
  REDUCE_MOTION_KEY,
  normalizeAnimSpeed,
  readAnimSpeed,
  writeAnimSpeed,
  applyAnimSpeed,
  clearAnimSpeed,
  readReduceMotion,
  writeReduceMotion,
  applyReduceMotion,
  clearReduceMotion
} from '../animSpeed.js'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.animSpeed
  delete document.documentElement.dataset.reduceMotion
})

describe('animSpeed 档位常量与归一化', () => {
  it('范围 0.5~2、step 0.25、默认 1，七档枚举完整', () => {
    expect(ANIM_SPEED_MIN).toBe(0.5)
    expect(ANIM_SPEED_MAX).toBe(2)
    expect(ANIM_SPEED_STEP).toBe(0.25)
    expect(ANIM_SPEED_DEFAULT).toBe(1)
    expect(ANIM_SPEED_OPTIONS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
  })

  it('七档枚举全部原样通过（字符串或数字）', () => {
    for (const v of ANIM_SPEED_OPTIONS) {
      expect(normalizeAnimSpeed(String(v))).toBe(v)
      expect(normalizeAnimSpeed(v)).toBe(v)
    }
  })

  it('无值/非法值一律落回默认 1', () => {
    expect(normalizeAnimSpeed(undefined)).toBe(1)
    expect(normalizeAnimSpeed(null)).toBe(1)
    expect(normalizeAnimSpeed('')).toBe(1)
    expect(normalizeAnimSpeed('abc')).toBe(1)
    expect(normalizeAnimSpeed('0.3')).toBe(1)
    expect(normalizeAnimSpeed('2.5')).toBe(1)
    expect(normalizeAnimSpeed({} as unknown as string)).toBe(1)
  })

  it('非档位值吸附到最近 0.25 步进（0.8→0.75、1.9→2）', () => {
    expect(normalizeAnimSpeed('0.8')).toBe(0.75)
    expect(normalizeAnimSpeed('1.9')).toBe(2)
    expect(normalizeAnimSpeed(0.6)).toBe(0.5)
  })
})

describe('animSpeed 读写', () => {
  it('readAnimSpeed 读取档位字符串并返回数字档', () => {
    localStorage.setItem(ANIM_SPEED_KEY, '1.25')
    expect(readAnimSpeed()).toBe(1.25)
  })

  it('readAnimSpeed 对无值/非法值归一化（不抛错）', () => {
    expect(readAnimSpeed()).toBe(1)
    localStorage.setItem(ANIM_SPEED_KEY, 'oops')
    expect(readAnimSpeed()).toBe(1)
    localStorage.setItem(ANIM_SPEED_KEY, '9')
    expect(readAnimSpeed()).toBe(1)
  })

  it('writeAnimSpeed 统一存档位字符串并返回归一化档位', () => {
    expect(writeAnimSpeed(1.75)).toBe(1.75)
    expect(localStorage.getItem(ANIM_SPEED_KEY)).toBe('1.75')
    expect(writeAnimSpeed('bad')).toBe(1)
    expect(localStorage.getItem(ANIM_SPEED_KEY)).toBe('1')
  })
})

describe('animSpeed 应用与清理', () => {
  it('applyAnimSpeed 设置 dataset（默认 1 也显式设置）', () => {
    expect(applyAnimSpeed(0.5)).toBe(0.5)
    expect(document.documentElement.dataset.animSpeed).toBe('0.5')
    expect(applyAnimSpeed(undefined)).toBe(1)
    expect(document.documentElement.dataset.animSpeed).toBe('1')
  })

  it('clearAnimSpeed 移除存储并摘掉 dataset', () => {
    writeAnimSpeed(2)
    applyAnimSpeed(2)
    clearAnimSpeed()
    expect(localStorage.getItem(ANIM_SPEED_KEY)).toBeNull()
    expect(document.documentElement.dataset.animSpeed).toBeUndefined()
  })
})

describe('减少动效开关', () => {
  it('readReduceMotion："1"=开，其余/无值=关', () => {
    expect(readReduceMotion()).toBe(false)
    localStorage.setItem(REDUCE_MOTION_KEY, '0')
    expect(readReduceMotion()).toBe(false)
    localStorage.setItem(REDUCE_MOTION_KEY, '1')
    expect(readReduceMotion()).toBe(true)
  })

  it('writeReduceMotion 持久化 "1"/"0" 并返回布尔', () => {
    expect(writeReduceMotion(true)).toBe(true)
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBe('1')
    expect(writeReduceMotion(false)).toBe(false)
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBe('0')
  })

  it('applyReduceMotion：开→dataset.reduceMotion="on"，关→摘掉', () => {
    expect(applyReduceMotion(true)).toBe(true)
    expect(document.documentElement.dataset.reduceMotion).toBe('on')
    expect(applyReduceMotion(false)).toBe(false)
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined()
  })

  it('clearReduceMotion 移除存储并摘掉 dataset', () => {
    writeReduceMotion(true)
    applyReduceMotion(true)
    clearReduceMotion()
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBeNull()
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined()
  })
})
