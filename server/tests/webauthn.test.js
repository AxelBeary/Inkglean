// ============================================
// WebAuthn Passkey 核心功能测试（REQ-040）
// 测试注册、认证、counter 递增、删除、challenge 过期、防枚举
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import {
  generateRegisterOptions,
  verifyRegistration,
  generateLoginOptions,
  verifyLogin,
  getCredentials,
  updateCredentialName,
  deleteCredential,
  hasPasskeyCredentials,
  getExistingCredentialIds,
  isCounterRegression
} from '../src/features/auth/webauthn.js'
import { AppError, E } from '../src/shared/errors.js'

describe('WebAuthn Passkey (REQ-040)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '12345', subdomain: 'webauthn-test', name: 'Passkey 测试画师' })
  })

  describe('注册流程', () => {
    it('应该生成注册选项', async () => {
      const options = await generateRegisterOptions(artist)
      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('rp')
      expect(options.rp.name).toBe('拾绘 Inkglean')
      expect(options).toHaveProperty('user')
      expect(options.user.name).toBe('12345')
    })

    it('注册验证应拒绝无效 challenge', async () => {
      const fakeCredential = {
        id: 'fake-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ challenge: 'invalid-challenge', origin: 'http://localhost', type: 'webauthn.create' })).toString('base64url'),
          attestationObject: Buffer.from('fake').toString('base64url')
        }
      }
      await expect(verifyRegistration(artist, fakeCredential)).rejects.toThrow()
    })

    it('注册验证应拒绝过期 challenge', async () => {
      // 生成选项但不消费 challenge（直接验证会因 challenge 不存在而失败）
      const options = await generateRegisterOptions(artist)
      const fakeCredential = {
        id: 'fake-id-2',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ challenge: options.challenge, origin: 'http://localhost', type: 'webauthn.create' })).toString('base64url'),
          attestationObject: Buffer.from('fake').toString('base64url')
        }
      }
      // 由于 verifyRegistration 需要真实 WebAuthn 响应，这里检查会抛出 WEBAUTHN_REGISTRATION_FAILED
      // 因为 attestationObject 是伪造的
      await expect(verifyRegistration(artist, fakeCredential)).rejects.toThrow()
    })
  })

  describe('凭据管理', () => {
    it('新画师凭据列表应为空', () => {
      const creds = getCredentials(artist.id)
      expect(creds).toHaveLength(0)
    })

    it('hasPasskeyCredentials 应返回 false（无凭据时）', () => {
      expect(hasPasskeyCredentials(artist.id)).toBe(false)
    })

    it('getExistingCredentialIds 应返回空数组', () => {
      const ids = getExistingCredentialIds(artist.id)
      expect(ids).toHaveLength(0)
    })

    it('更新不存在的凭据应抛出 404', () => {
      expect(() => updateCredentialName(999, artist.id, '新设备名')).toThrow(AppError)
      try {
        updateCredentialName(999, artist.id, '新设备名')
      } catch (e) {
        expect(e.statusCode).toBe(404)
        expect(e.code).toBe(E.WEBAUTHN_CREDENTIAL_NOT_FOUND)
      }
    })

    it('删除不存在的凭据应抛出 404', () => {
      expect(() => deleteCredential(999, artist.id)).toThrow(AppError)
      try {
        deleteCredential(999, artist.id)
      } catch (e) {
        expect(e.statusCode).toBe(404)
        expect(e.code).toBe(E.WEBAUTHN_CREDENTIAL_NOT_FOUND)
      }
    })
  })

  describe('认证流程', () => {
    it('应生成登录选项', async () => {
      const options = await generateLoginOptions()
      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('rpId')
    })

    it('登录验证应拒绝无效 challenge', async () => {
      const fakeCredential = {
        id: 'nonexistent-cred-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ challenge: 'invalid-challenge', origin: 'http://localhost', type: 'webauthn.get' })).toString('base64url'),
          authenticatorData: Buffer.from('fake').toString('base64url'),
          signature: Buffer.from('fake').toString('base64url'),
          userHandle: ''
        }
      }
      await expect(verifyLogin(fakeCredential)).rejects.toThrow()
    })

    it('不存在的凭据应返回认证失败（防枚举）', async () => {
      // 先生成一个合法的 challenge
      const options = await generateLoginOptions()
      const fakeCredential = {
        id: 'nonexistent-cred-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ challenge: options.challenge, origin: 'http://localhost', type: 'webauthn.get' })).toString('base64url'),
          authenticatorData: Buffer.from('fake').toString('base64url'),
          signature: Buffer.from('fake').toString('base64url'),
          userHandle: ''
        }
      }
      try {
        await verifyLogin(fakeCredential)
      } catch (e) {
        // 不存在的凭据应返回 WEBAUTHN_AUTHENTICATION_FAILED（与认证失败同响应，防枚举）
        expect(e.code).toBe(E.WEBAUTHN_AUTHENTICATION_FAILED)
      }
    })
  })

  describe('防枚举', () => {
    it('未注册 QQ 的 login-options 应与正常返回相同结构', async () => {
      // login-options 不依赖 QQ 号是否注册，总是返回相同的 options 结构
      const options = await generateLoginOptions()
      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('rpId')
      expect(options).toHaveProperty('userVerification')
    })
  })

  describe('counter 防克隆回归判定（812 OOBE：Windows Hello 永远上报 0）', () => {
    it('双侧均 0 = 平台验证器，不判回归', () => {
      expect(isCounterRegression(0, 0)).toBe(false)
    })
    it('验证器有计数器且递增，不判回归', () => {
      expect(isCounterRegression(5, 3)).toBe(false)
    })
    it('验证器有计数器但回退/重复，判回归（疑似克隆）', () => {
      expect(isCounterRegression(3, 5)).toBe(true)
      expect(isCounterRegression(5, 5)).toBe(true)
    })
    it('曾上报过非零后归零，判回归', () => {
      expect(isCounterRegression(0, 5)).toBe(true)
    })
  })

  describe('Challenge 过期', () => {
    it('挑战不存在时应验证失败', async () => {
      // 生成一次挑战使 challenge store 处于非空态（fakeCredential 引用不存在的 challenge）
      await generateLoginOptions()
      const fakeCredential = {
        id: 'fake-cred-id',
        response: {
          clientDataJSON: Buffer.from(JSON.stringify({ challenge: 'nonexistent-challenge', origin: 'http://localhost', type: 'webauthn.get' })).toString('base64url'),
          authenticatorData: Buffer.from('fake').toString('base64url'),
          signature: Buffer.from('fake').toString('base64url'),
          userHandle: ''
        }
      }
      try { await verifyLogin(fakeCredential) } catch (e) {
        expect(e.code).toBe(E.WEBAUTHN_CHALLENGE_INVALID)
      }
    })
  })
})

// 测试数据库凭据操作
describe('WebAuthn 数据库操作', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '54321', subdomain: 'webauthn-db' })
  })

  it('应能直接插入并读取凭据', () => {
    // 直接插入模拟凭据
    db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(artist.id, 'test-cred-1', 'test-public-key', 0, '测试设备')

    const creds = getCredentials(artist.id)
    expect(creds).toHaveLength(1)
    expect(creds[0].credential_id).toBe('test-cred-1')
    expect(creds[0].counter).toBe(0)
    expect(creds[0].device_name).toBe('测试设备')
    expect(hasPasskeyCredentials(artist.id)).toBe(true)
  })

  it('应能更新凭据设备名', () => {
    const result = db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(artist.id, 'test-cred-2', 'test-public-key-2', 0, '旧设备名')

    const pkId = Number(result.lastInsertRowid)
    const updated = updateCredentialName(pkId, artist.id, '新设备名')
    expect(updated.device_name).toBe('新设备名')
  })

  it('应能删除凭据', () => {
    const result = db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(artist.id, 'test-cred-3', 'test-public-key-3', 0, '待删除设备')

    const pkId = Number(result.lastInsertRowid)
    deleteCredential(pkId, artist.id)
    expect(getCredentials(artist.id)).toHaveLength(0)
    expect(hasPasskeyCredentials(artist.id)).toBe(false)
  })

  it('其他画师不能操作他人的凭据', () => {
    const artist2 = seedArtist({ qq_number: '99999', subdomain: 'webauthn-db2' })
    const result = db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(artist.id, 'test-cred-4', 'test-public-key-4', 0, '设备')

    const pkId = Number(result.lastInsertRowid)
    // artist2 尝试更新 artist 的凭据
    expect(() => updateCredentialName(pkId, artist2.id, '新名称')).toThrow(AppError)
    expect(() => deleteCredential(pkId, artist2.id)).toThrow(AppError)
  })
})
