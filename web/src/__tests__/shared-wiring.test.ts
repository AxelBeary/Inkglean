// 共享包接线冒烟：@inkglean/shared 以 file: 链接接入，此测试保证链接可解析、源码可导入
// （F3/F4 搬家批的前置保险丝——接线断了这里先红）
import { describe, it, expect } from 'vitest'
import { sharedVersion } from '@inkglean/shared'

describe('@inkglean/shared 接线', () => {
  it('web 端可导入共享包', () => {
    expect(sharedVersion).toBe('0.1.0')
  })
})
