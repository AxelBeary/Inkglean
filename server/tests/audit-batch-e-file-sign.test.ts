// 审计批E P3-23: file-sign 开发密钥策略对齐会话密钥（auth.service P1-3 同款）
// 生产无密钥 fail-fast 回归 + 开发密钥随机化（非固定串，重启即变，旧固定串无法伪造）
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHmac } from 'crypto'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_SECRET = process.env.SESSION_SECRET

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = ORIGINAL_SECRET
})

describe('审计批E P3-23: file-sign 开发密钥随机化', () => {
  // resetModules 清模块缓存后重新 import——file-sign 模块加载时生成 SECRET（同 auth.service）
  const loadFileSign = () => {
    vi.resetModules()
    return import('../src/shared/file-sign.js')
  }

  it('TC-FF5-01: 生产无 SESSION_SECRET → 模块加载即抛错（fail-fast 回归）', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SESSION_SECRET
    await expect(loadFileSign()).rejects.toThrow(/SESSION_SECRET 未设置/)
  })

  it('TC-FF5-02: 开发无 SESSION_SECRET → 随机密钥可签名可验证，旧固定串无法伪造', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.SESSION_SECRET
    const mod = await loadFileSign()
    const token = mod.signFilePath('references/1/a.png')
    expect(mod.verifyFileToken(token)).toBe('references/1/a.png')

    // 旧固定串 dev-secret-change-in-production 必须验不过（P3-23 根因：可离线爆破伪造）
    const LEGACY = 'dev-secret-change-in-production'
    const payload = token.slice(0, token.lastIndexOf('.'))
    const legacySig = createHmac('sha256', LEGACY).update(payload).digest('base64url')
    expect(mod.verifyFileToken(`${payload}.${legacySig}`)).toBeNull()
  })

  it('TC-FF5-03: 开发密钥每次加载随机生成（同路径两次签名 token 不同）', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.SESSION_SECRET
    const modA = await loadFileSign()
    const tokenA = modA.signFilePath('references/1/a.png')
    const modB = await loadFileSign()
    const tokenB = modB.signFilePath('references/1/a.png')
    expect(tokenA).not.toBe(tokenB)
  })
})
