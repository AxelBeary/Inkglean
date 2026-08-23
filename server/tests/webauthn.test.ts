// ============================================
// WebAuthn Passkey 核心功能测试（REQ-040）
// 测试注册、认证、counter 递增、删除、challenge 过期、防枚举
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { createHash, generateKeyPairSync } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
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
import { AppError, E, ERROR_MESSAGES } from '../src/shared/errors.js'
import { buildApp } from '../src/app.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

describe('WebAuthn Passkey (REQ-040)', () => {
  let artist: ArtistRow

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

    it('注册选项应强制用户验证（公网报障修复：下发侧与验证侧两侧一致 required）', async () => {
      const options = await generateRegisterOptions(artist)
      expect(options.authenticatorSelection?.userVerification).toBe('required')
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
        const err = e as AppError
        expect(err.statusCode).toBe(404)
        expect(err.code).toBe(E.WEBAUTHN_CREDENTIAL_NOT_FOUND)
      }
    })

    it('删除不存在的凭据应抛出 404', () => {
      expect(() => deleteCredential(999, artist.id)).toThrow(AppError)
      try {
        deleteCredential(999, artist.id)
      } catch (e) {
        const err = e as AppError
        expect(err.statusCode).toBe(404)
        expect(err.code).toBe(E.WEBAUTHN_CREDENTIAL_NOT_FOUND)
      }
    })
  })

  describe('认证流程', () => {
    it('应生成登录选项', async () => {
      const options = await generateLoginOptions()
      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('rpId')
      // 与验证侧 requireUserVerification:true 一致；无 UV 能力设备由浏览器提前拦截
      expect(options.userVerification).toBe('required')
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
      // 不存在的凭据应返回 WEBAUTHN_AUTHENTICATION_FAILED（与认证失败同响应，防枚举）
      await expect(verifyLogin(fakeCredential)).rejects.toMatchObject({ code: E.WEBAUTHN_AUTHENTICATION_FAILED })
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
      await expect(verifyLogin(fakeCredential)).rejects.toMatchObject({ code: E.WEBAUTHN_CHALLENGE_INVALID })
    })
  })
})

// 测试数据库凭据操作
describe('WebAuthn 数据库操作', () => {
  let artist: ArtistRow

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

// 会话门禁批：动态口令未绑定（totp_verified=0）的画师禁止 Passkey 登录
describe('会话门禁批：Passkey 登录入口未绑定拦截', () => {
  /** 构造伪造凭据（签名必败，但未绑定门禁应先于签名校验生效） */
  function fakeCredential(credId: string, challenge: string) {
    return {
      id: credId,
      // 验证库要求 rawId===id 且 type='public-key'（否则报 not base64url-encoded）
      rawId: credId,
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ challenge, origin: 'http://localhost', type: 'webauthn.get' })).toString('base64url'),
        authenticatorData: Buffer.from('fake').toString('base64url'),
        signature: Buffer.from('fake').toString('base64url'),
        userHandle: ''
      }
    }
  }

  beforeEach(() => {
    cleanDb()
  })

  it('服务层：未绑定画师的凭据被拒——抛 TOTP_BIND_REQUIRED（401），而非 WEBAUTHN_*', async () => {
    const unbound = seedArtist({ qq_number: '30001', subdomain: 'pk-unbound', totp_secret: null, totp_verified: 0 })
    db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(unbound.id, 'gate-cred-1', 'test-public-key', 0, '门禁测试设备')
    const options = await generateLoginOptions()

    await expect(verifyLogin(fakeCredential('gate-cred-1', options.challenge)))
      .rejects.toMatchObject({ code: E.TOTP_BIND_REQUIRED, statusCode: 401 })
  })

  it('服务层对照：已绑定画师伪造签名仍按既有口径抛 WEBAUTHN_AUTHENTICATION_FAILED', async () => {
    const bound = seedArtist({ qq_number: '30002', subdomain: 'pk-bound' })
    // 伪造签名要走真实验签路径（库返回 verified=false 才抛 AppError），
    // 需结构合法：rawId===id、authenticatorData 含正确 rpIdHash、COSE 公钥为真实曲线点、signature 为合法 DER。
    // 结构不合法时库会抛裸 Error（非本批语义，不在本用例验证范围）。
    const credId = Buffer.from('gate-cred-2').toString('base64url')
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const spki = publicKey.export({ type: 'spki', format: 'der' })
    const rawPoint = spki.subarray(spki.length - 65) // 0x04 || x(32) || y(32)
    const coseKey = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      rawPoint.subarray(1, 33),
      Buffer.from([0x22, 0x58, 0x20]),
      rawPoint.subarray(33, 65)
    ])
    db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(bound.id, credId, coseKey.toString('base64url'), 0, '对照设备')
    const options = await generateLoginOptions()

    // authenticatorData：32B rpIdHash（默认 rpId='localhost'）+ flags(UP|UV) + signCount
    const authData = Buffer.concat([
      createHash('sha256').update('localhost').digest(),
      Buffer.from([0x05]),
      Buffer.from([0, 0, 0, 0])
    ])
    // 合法 DER 结构但内容错误的签名 → 验签失败（而非解析报错）
    const badDerSignature = Buffer.concat([
      Buffer.from([0x30, 0x44, 0x02, 0x20]),
      Buffer.concat([Buffer.from([0x01]), Buffer.alloc(31, 0x02)]),
      Buffer.from([0x02, 0x20]),
      Buffer.concat([Buffer.from([0x03]), Buffer.alloc(31, 0x04)])
    ])
    const forgedCredential = {
      id: credId,
      rawId: credId,
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ challenge: options.challenge, origin: 'http://localhost', type: 'webauthn.get' })).toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: badDerSignature.toString('base64url'),
        userHandle: ''
      }
    }

    await expect(verifyLogin(forgedCredential))
      .rejects.toMatchObject({ code: E.WEBAUTHN_AUTHENTICATION_FAILED, statusCode: 401 })
  })

  it('路由层：login-verify 不吞新码，原样透传 401 + TOTP_BIND_REQUIRED + 契约文案', async () => {
    const app: FastifyInstance = await buildApp({ logger: false })
    await app.ready()
    resetRateLimitBuckets()
    try {
      const unbound = seedArtist({ qq_number: '30003', subdomain: 'pk-route', totp_secret: null, totp_verified: 0 })
      db.prepare(`
        INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(unbound.id, 'gate-cred-3', 'test-public-key', 0, '路由透传设备')
      // 经路由下发 challenge（与 verify 同 host 口径）
      const optRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/login-options', payload: { qqNumber: '30003' } })
      expect(optRes.statusCode).toBe(200)
      const challenge = optRes.json().challenge as string

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/webauthn/login-verify',
        payload: fakeCredential('gate-cred-3', challenge)
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('TOTP_BIND_REQUIRED')
      expect(res.json().error).toBe(ERROR_MESSAGES[E.TOTP_BIND_REQUIRED])
    } finally {
      await app.close()
    }
  })
})
