// linkValidation 纯函数测试（REQ-022 F2 前端体验层）
// 覆盖：裸链补 https / 危险协议拒绝 / 长度边界 / 域名末尾匹配（防投毒核心）
import { describe, it, expect } from 'vitest'
import {
  normalizeLinkUrl,
  checkLinkLength,
  matchDomain,
  validateLink,
  MAX_HOSTNAME_LEN,
  MAX_PATH_QUERY_LEN,
  MAX_URL_LEN,
  LINK_INVALID,
  LINK_TOO_LONG
} from '../linkValidation.js'

// ─── normalizeLinkUrl ───

describe('normalizeLinkUrl（归一化）', () => {
  it('裸链补 https://', () => {
    expect(normalizeLinkUrl('weibo.com/testuser')).toEqual({ ok: true, url: 'https://weibo.com/testuser' })
  })

  it('已有 https:// 原样保留', () => {
    expect(normalizeLinkUrl('https://weibo.com/testuser').ok).toBe(true)
    expect(normalizeLinkUrl('https://weibo.com/testuser').url).toBe('https://weibo.com/testuser')
  })

  it('http:// 保留', () => {
    expect(normalizeLinkUrl('http://example.com/a').url).toBe('http://example.com/a')
  })

  it('javascript: 拒绝', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toEqual({ ok: false, reason: LINK_INVALID })
  })

  it('ftp:// 拒绝', () => {
    expect(normalizeLinkUrl('ftp://files.example.com')).toEqual({ ok: false, reason: LINK_INVALID })
  })

  it('data: 拒绝', () => {
    expect(normalizeLinkUrl('data:text/html,xx')).toEqual({ ok: false, reason: LINK_INVALID })
  })

  it('空串拒绝', () => {
    expect(normalizeLinkUrl('')).toEqual({ ok: false, reason: LINK_INVALID })
    expect(normalizeLinkUrl('   ')).toEqual({ ok: false, reason: LINK_INVALID })
    expect(normalizeLinkUrl(null)).toEqual({ ok: false, reason: LINK_INVALID })
  })

  it('裸域名+端口识别为链接（weibo.com:8080）', () => {
    const res = normalizeLinkUrl('weibo.com:8080/x')
    expect(res.ok).toBe(true)
    expect(res.url).toBe('https://weibo.com:8080/x')
  })

  it('大小写协议兼容', () => {
    expect(normalizeLinkUrl('HTTPS://EXAMPLE.COM/x').ok).toBe(true)
  })
})

// ─── checkLinkLength ───

describe('checkLinkLength（长度边界）', () => {
  it(`域名 ${MAX_HOSTNAME_LEN} 字符允许`, () => {
    const host = 'a'.repeat(MAX_HOSTNAME_LEN)
    expect(checkLinkLength(`https://${host}/`)).toEqual({ ok: true })
  })

  it(`域名 ${MAX_HOSTNAME_LEN + 1} 字符拒绝`, () => {
    const host = 'a'.repeat(MAX_HOSTNAME_LEN + 1)
    expect(checkLinkLength(`https://${host}/`)).toEqual({ ok: false, reason: LINK_TOO_LONG })
  })

  it(`路径+查询 ${MAX_PATH_QUERY_LEN} 允许`, () => {
    const path = '/' + 'p'.repeat(MAX_PATH_QUERY_LEN - 1)
    expect(checkLinkLength(`https://example.com${path}`)).toEqual({ ok: true })
  })

  it(`路径+查询 ${MAX_PATH_QUERY_LEN + 1} 拒绝`, () => {
    const path = '/' + 'p'.repeat(MAX_PATH_QUERY_LEN)
    expect(checkLinkLength(`https://example.com${path}`)).toEqual({ ok: false, reason: LINK_TOO_LONG })
  })

  it(`总长 ${MAX_URL_LEN} 允许 / ${MAX_URL_LEN + 1} 拒绝（hash 填充构造，路径仍 ≤1500）`, () => {
    // hash（fragment）不计入 hostname/pathname+search，可独立撑起总长边界（对齐后端 TC-FN-14/15）
    const ok = `https://a.cn/#${'h'.repeat(MAX_URL_LEN - 14)}`
    expect(ok.length).toBe(MAX_URL_LEN)
    expect(checkLinkLength(ok)).toEqual({ ok: true })
    expect(checkLinkLength(ok + 'h')).toEqual({ ok: false, reason: LINK_TOO_LONG })
  })
})

// ─── matchDomain ───

describe('matchDomain（防投毒末尾匹配）', () => {
  const domains = ['weibo.com', 'weibo.cn']

  it('主机名 === 域名 命中', () => {
    expect(matchDomain('weibo.com', domains)).toBe(true)
  })

  it('真子域 m.weibo.com 命中', () => {
    expect(matchDomain('m.weibo.com', domains)).toBe(true)
  })

  it('evil 子域伪装 weibo.com.evil.com 不命中', () => {
    expect(matchDomain('weibo.com.evil.com', domains)).toBe(false)
  })

  it('前缀粘连 xweibo.com 不命中', () => {
    expect(matchDomain('xweibo.com', domains)).toBe(false)
  })

  it('大小写混写命中', () => {
    expect(matchDomain('WEIBO.COM', domains)).toBe(true)
  })

  it('域名列表为空不命中', () => {
    expect(matchDomain('weibo.com', [])).toBe(false)
    expect(matchDomain('', domains)).toBe(false)
  })
})

// ─── validateLink（组合） ───

const PLATFORMS = [
  { id: 1, matchDomains: ['weibo.com', 'weibo.cn'] },
  { id: 2, matchDomains: ['bilibili.com', 'b23.tv'] }
]

describe('validateLink（组合识别）', () => {
  it('裸链 weibo.com/x → 补 https 且识别平台 1', () => {
    const res = validateLink('weibo.com/x', PLATFORMS)
    expect(res).toEqual({ ok: true, url: 'https://weibo.com/x', platformId: 1 })
  })

  it('https://space.bilibili.com/123 → 识别平台 2', () => {
    const res = validateLink('https://space.bilibili.com/123', PLATFORMS)
    expect(res.platformId).toBe(2)
  })

  it('未知域名 → platformId null（其他）', () => {
    const res = validateLink('https://myblog.example.net', PLATFORMS)
    expect(res.ok).toBe(true)
    expect(res.platformId).toBe(null)
  })

  it('evil 子域伪装 → 不识别（其他）', () => {
    const res = validateLink('https://weibo.com.evil.com/abc', PLATFORMS)
    expect(res.ok).toBe(true)
    expect(res.platformId).toBe(null)
  })

  it('危险协议 → 拒绝', () => {
    expect(validateLink('javascript:alert(1)', PLATFORMS).ok).toBe(false)
    expect(validateLink('ftp://files.example.com', PLATFORMS).ok).toBe(false)
    expect(validateLink('data:text/html,xx', PLATFORMS).ok).toBe(false)
  })

  it('超长 → tooLong', () => {
    const long = `https://example.com/${'a'.repeat(MAX_URL_LEN)}`
    expect(validateLink(long, PLATFORMS)).toEqual({ ok: false, reason: LINK_TOO_LONG })
  })

  it('platforms 缺失 → 校验仍过，platformId null', () => {
    const res = validateLink('weibo.com/x', undefined)
    expect(res.ok).toBe(true)
    expect(res.platformId).toBe(null)
  })
})
