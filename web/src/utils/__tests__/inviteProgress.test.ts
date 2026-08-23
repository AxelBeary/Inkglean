// inviteProgress 存储逻辑测试（824：首绑防刷新 + 绑定失效旗标）
// 覆盖：进行中状态存取/坏数据降级/清除；旗标 set/take/clear 消费语义；存储禁用不抛错
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  saveInviteTotpProgress,
  loadInviteTotpProgress,
  clearInviteTotpProgress,
  setTotpBindRequiredNotice,
  takeTotpBindRequiredNotice,
  clearTotpBindRequiredNotice
} from '../inviteProgress'
import { INVITE_TOTP_PROGRESS_KEY, TOTP_BIND_REQUIRED_NOTICE_KEY } from '../../constants/auth'

const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage') as PropertyDescriptor

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  Object.defineProperty(window, 'sessionStorage', originalDescriptor)
})

describe('inviteProgress 首绑进行中状态', () => {
  it('save/load 往返：原样读回', () => {
    saveInviteTotpProgress({ qqNumber: '12345678', otpauthUri: 'otpauth://totp/x?secret=AAA' })
    expect(loadInviteTotpProgress()).toEqual({ qqNumber: '12345678', otpauthUri: 'otpauth://totp/x?secret=AAA' })
  })

  it('无数据时返回 null', () => {
    expect(loadInviteTotpProgress()).toBeNull()
  })

  it('坏 JSON 返回 null 不抛错', () => {
    sessionStorage.setItem(INVITE_TOTP_PROGRESS_KEY, '{not-json')
    expect(loadInviteTotpProgress()).toBeNull()
  })

  it('非对象/字段缺失/空串一律返回 null（防陈旧坏数据卡死恢复流程）', () => {
    const cases = ['"str"', '123', '{}', '{"qqNumber":"123"}', '{"qqNumber":"","otpauthUri":"u"}', '{"qqNumber":1,"otpauthUri":"u"}']
    for (const raw of cases) {
      sessionStorage.setItem(INVITE_TOTP_PROGRESS_KEY, raw)
      expect(loadInviteTotpProgress()).toBeNull()
    }
  })

  it('clear 清除后读取为 null', () => {
    saveInviteTotpProgress({ qqNumber: '1', otpauthUri: 'u' })
    clearInviteTotpProgress()
    expect(sessionStorage.getItem(INVITE_TOTP_PROGRESS_KEY)).toBeNull()
    expect(loadInviteTotpProgress()).toBeNull()
  })

  it('sessionStorage 禁用时静默降级：写不抛错、读返回 null', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      }
    })
    expect(() => saveInviteTotpProgress({ qqNumber: '1', otpauthUri: 'u' })).not.toThrow()
    expect(loadInviteTotpProgress()).toBeNull()
    expect(() => clearInviteTotpProgress()).not.toThrow()
  })
})

describe('inviteProgress 绑定失效提示旗标', () => {
  it('set → take 返回 true 且旗标被清除（展示后清除语义）', () => {
    setTotpBindRequiredNotice()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBe('1')
    expect(takeTotpBindRequiredNotice()).toBe(true)
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
  })

  it('take 只消费一次：第二次返回 false', () => {
    setTotpBindRequiredNotice()
    takeTotpBindRequiredNotice()
    expect(takeTotpBindRequiredNotice()).toBe(false)
  })

  it('无旗标时 take 返回 false', () => {
    expect(takeTotpBindRequiredNotice()).toBe(false)
  })

  it('clear 清除残留旗标', () => {
    setTotpBindRequiredNotice()
    clearTotpBindRequiredNotice()
    expect(takeTotpBindRequiredNotice()).toBe(false)
  })

  it('sessionStorage 禁用时旗标链路静默降级不抛错', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      }
    })
    expect(() => setTotpBindRequiredNotice()).not.toThrow()
    expect(takeTotpBindRequiredNotice()).toBe(false)
    expect(() => clearTotpBindRequiredNotice()).not.toThrow()
  })
})
