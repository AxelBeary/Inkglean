import { describe, it, expect } from 'vitest'
import { identifyPlatform, getPlatformLabel, parsePlatformUrls, KNOWN_PLATFORMS } from '../src/utils/platform.js'

describe('平台识别工具 (platform.js)', () => {
  // ─── identifyPlatform ───

  describe('identifyPlatform', () => {
    it('TC-PL-01: Pixiv URL 识别', () => {
      expect(identifyPlatform('https://www.pixiv.net/users/12345')).toBe('pixiv')
      expect(identifyPlatform('https://pixiv.me/abc')).toBe('pixiv')
    })

    it('TC-PL-02: Twitter/X URL 识别', () => {
      expect(identifyPlatform('https://twitter.com/user')).toBe('x')
      expect(identifyPlatform('https://x.com/user')).toBe('x')
    })

    it('TC-PL-03: 微博 URL 识别', () => {
      expect(identifyPlatform('https://weibo.com/user')).toBe('weibo')
      expect(identifyPlatform('https://m.weibo.cn/u/123')).toBe('weibo')
    })

    it('TC-PL-04: Lofter URL 识别', () => {
      expect(identifyPlatform('https://user.lofter.com')).toBe('lofter')
    })

    it('TC-PL-05: B站 URL 识别', () => {
      expect(identifyPlatform('https://space.bilibili.com/12345')).toBe('bilibili')
      expect(identifyPlatform('https://b23.tv/abc')).toBe('bilibili')
    })

    it('TC-PL-06: 小红书 URL 识别', () => {
      expect(identifyPlatform('https://www.xiaohongshu.com/user/profile/123')).toBe('xiaohongshu')
      expect(identifyPlatform('https://xhslink.com/abc')).toBe('xiaohongshu')
    })

    it('TC-PL-07: 未知平台返回 other', () => {
      expect(identifyPlatform('https://example.com')).toBe('other')
      expect(identifyPlatform('https://my-art-site.com')).toBe('other')
    })

    it('TC-PL-08: 空值/非字符串返回 other', () => {
      expect(identifyPlatform('')).toBe('other')
      expect(identifyPlatform(null)).toBe('other')
      expect(identifyPlatform(undefined)).toBe('other')
      expect(identifyPlatform(123)).toBe('other')
    })
  })

  // ─── getPlatformLabel ───

  describe('getPlatformLabel', () => {
    it('TC-PL-09: 已知平台返回显示名', () => {
      expect(getPlatformLabel('pixiv')).toBe('Pixiv')
      expect(getPlatformLabel('x')).toBe('X (Twitter)')
      expect(getPlatformLabel('weibo')).toBe('微博')
      expect(getPlatformLabel('bilibili')).toBe('Bilibili')
    })

    it('TC-PL-10: 未知平台返回"其他"', () => {
      expect(getPlatformLabel('unknown')).toBe('其他')
      expect(getPlatformLabel('')).toBe('其他')
    })
  })

  // ─── parsePlatformUrls ───

  describe('parsePlatformUrls', () => {
    it('TC-PL-11: 正常 JSON 解析', () => {
      const json = JSON.stringify([
        { url: 'https://www.pixiv.net/users/1', platform: 'pixiv' },
        { url: 'https://x.com/user', platform: 'x' }
      ])
      const result = parsePlatformUrls(json)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ url: 'https://www.pixiv.net/users/1', platform: 'pixiv', label: 'Pixiv' })
      expect(result[1]).toEqual({ url: 'https://x.com/user', platform: 'x', label: 'X (Twitter)' })
    })

    it('TC-PL-12: 兼容纯字符串数组（旧格式）', () => {
      const json = JSON.stringify(['https://weibo.com/user', 'https://example.com'])
      const result = parsePlatformUrls(json)
      expect(result).toHaveLength(2)
      expect(result[0].platform).toBe('weibo')
      expect(result[1].platform).toBe('other')
    })

    it('TC-PL-13: 无 platform 字段时自动识别', () => {
      const json = JSON.stringify([{ url: 'https://space.bilibili.com/123' }])
      const result = parsePlatformUrls(json)
      expect(result[0].platform).toBe('bilibili')
      expect(result[0].label).toBe('Bilibili')
    })

    it('TC-PL-14: 空值/非法 JSON 返回空数组', () => {
      expect(parsePlatformUrls(null)).toEqual([])
      expect(parsePlatformUrls('')).toEqual([])
      expect(parsePlatformUrls('not-json')).toEqual([])
      expect(parsePlatformUrls('{}')).toEqual([])
    })

    it('TC-PL-15: 过滤空 url 条目', () => {
      const json = JSON.stringify([{ url: '' }, { url: 'https://x.com/a' }, {}])
      const result = parsePlatformUrls(json)
      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://x.com/a')
    })
  })

  // ─── KNOWN_PLATFORMS ───

  describe('KNOWN_PLATFORMS', () => {
    it('TC-PL-16: 白名单包含所有预期平台', () => {
      expect(KNOWN_PLATFORMS).toContain('pixiv')
      expect(KNOWN_PLATFORMS).toContain('x')
      expect(KNOWN_PLATFORMS).toContain('weibo')
      expect(KNOWN_PLATFORMS).toContain('lofter')
      expect(KNOWN_PLATFORMS).toContain('bilibili')
      expect(KNOWN_PLATFORMS).toContain('xiaohongshu')
      expect(KNOWN_PLATFORMS).toContain('other')
    })
  })
})
