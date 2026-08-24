// 共享包冒烟单测：包可被解析、契约常量在位
import { describe, it, expect } from 'vitest'
import { sharedVersion } from '../index'

describe('@inkglean/shared 骨架', () => {
  it('导出契约版本常量', () => {
    expect(sharedVersion).toBe('0.1.0')
  })
})
