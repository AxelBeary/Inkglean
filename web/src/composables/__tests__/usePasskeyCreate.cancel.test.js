// 817 修复回归：Passkey 取消不得损坏既有 profile（AccountSecurity 取消分支契约）
// 取消 = 浏览器 NotAllowedError/AbortError → 人话提示 + 返回 null，流程不得回写任何外部状态。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePasskeyCreate } from '../usePasskeyCreate.js'

const h = vi.hoisted(() => ({
  msgInfo: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { info: h.msgInfo }
}))

vi.mock('../utils/webauthn.js', () => ({
  isWebAuthnCancellation: (err) => {
    const name = err instanceof Error ? err.name : ''
    return name === 'NotAllowedError' || name === 'AbortError'
  },
  isWebAuthnUnsupported: (err) => {
    const name = err instanceof Error ? err.name : ''
    return name === 'NotSupportedError' || name === 'SecurityError'
  }
}))

beforeEach(() => {
  h.msgInfo.mockClear()
})

describe('usePasskeyCreate 取消路径（817 修复）', () => {
  it('用户取消（NotAllowedError）→ 提示 + 返回 null，既有 profile 不被触碰', async () => {
    const profile = { qq_number: '10001', name: 'Alice' }
    let mutated = false
    const { passkeyCreateFlow } = usePasskeyCreate()

    const result = await passkeyCreateFlow(async () => {
      // 模拟 AccountSecurity 注册仪式：成功分支才回写 store，取消分支不进入
      const credential = await Promise.reject(
        Object.assign(new Error('cancel'), { name: 'NotAllowedError' })
      )
      profile.qq_number = 'damaged'
      mutated = true
      return credential
    }, { setBusy: vi.fn() })

    expect(result).toBeNull()
    expect(h.msgInfo).toHaveBeenCalledWith('common.passkeyCancelled')
    expect(mutated).toBe(false)
    expect(profile).toEqual({ qq_number: '10001', name: 'Alice' })
  })

  it('AbortError 同样按取消处理，不落任何回写', async () => {
    let reachedSuccessBranch = false
    const { passkeyCreateFlow } = usePasskeyCreate()

    const result = await passkeyCreateFlow(async () => {
      await Promise.reject(Object.assign(new Error('abort'), { name: 'AbortError' }))
      reachedSuccessBranch = true
      return null
    })

    expect(result).toBeNull()
    expect(h.msgInfo).toHaveBeenCalledWith('common.passkeyCancelled')
    expect(reachedSuccessBranch).toBe(false)
  })
})
