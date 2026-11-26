// 817 修复回归：Passkey 取消不得损坏既有 profile（AccountSecurity 取消分支契约）
// 取消 = 浏览器 NotAllowedError/AbortError → 人话提示 + 返回 null，流程不得回写任何外部状态。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePasskeyCreate } from '../usePasskeyCreate'

const h = vi.hoisted(() => ({
  msgInfo: vi.fn(),
  msgWarn: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { info: h.msgInfo, warning: h.msgWarn, error: h.msgError }
}))

// 分类谓词一律用真实实现（部分 mock），不手抄一份：手抄的分类若与真实实现漂移，
// 测试会继续绿而线上已坏——这类断言必须打在真代码上。
vi.mock('../utils/webauthn.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/webauthn')>()
  return { ...actual }
})

beforeEach(() => {
  h.msgInfo.mockClear()
  h.msgWarn.mockClear()
  h.msgError.mockClear()
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

// 2026-11-27 报障回归（Edge Dev 无法注册 Passkey）：SecurityError 曾被并进
// 「浏览器不支持（需 HTTPS 或 localhost）」，而该页本就在 HTTPS 下且 PublicKeyCredential 可用，
// 提示指错了方向。现在必须走独立归因文案。
describe('usePasskeyCreate 错误归因（2026-11-27 报障修复）', () => {
  it('SecurityError（rp.id 非法/与域名不符）→ 域名归因文案，不再报「浏览器不支持」', async () => {
    const { passkeyCreateFlow } = usePasskeyCreate()

    const result = await passkeyCreateFlow(async () => {
      await Promise.reject(Object.assign(new Error('This is an invalid domain.'), { name: 'SecurityError' }))
      return null
    })

    expect(result).toBeNull()
    expect(h.msgError).toHaveBeenCalledWith('common.passkeyDomainRejected')
    expect(h.msgWarn).not.toHaveBeenCalledWith('common.passkeyNotSupported')
  })

  it('NotSupportedError（真·能力缺失）仍报「浏览器不支持」', async () => {
    const { passkeyCreateFlow } = usePasskeyCreate()

    const result = await passkeyCreateFlow(async () => {
      await Promise.reject(Object.assign(new Error('no webauthn'), { name: 'NotSupportedError' }))
      return null
    })

    expect(result).toBeNull()
    expect(h.msgWarn).toHaveBeenCalledWith('common.passkeyNotSupported')
    expect(h.msgError).not.toHaveBeenCalled()
  })

  it('其余异常 → 兜底「Passkey 验证失败」', async () => {
    const { passkeyCreateFlow } = usePasskeyCreate()

    const result = await passkeyCreateFlow(async () => {
      await Promise.reject(Object.assign(new Error('boom'), { name: 'UnknownError' }))
      return null
    })

    expect(result).toBeNull()
    expect(h.msgError).toHaveBeenCalledWith('common.passkeyFailed')
  })
})
