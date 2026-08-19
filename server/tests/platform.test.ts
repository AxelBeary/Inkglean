/**
 * REQ-022 F2: 外链防投毒纯函数测试（shared/utils/platform.ts）
 *
 * 防投毒向量先行（派工 F2-7）：
 * weibo.com ✓ / m.weibo.com ✓ / weibo.com:8080 ✓ / weibo.com.evil.com ✗ /
 * xweibo.com ✗ / 大小写混写 / javascript: ✗ / ftp: ✗ / data: ✗ /
 * 裸链补全 ✓ / 超长（域名254 / 路径+查询1501 / 总长1801）✗
 *
 * 纯函数不碰数据库，直接 import 断言。
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeLinkUrl,
  assertLinkLengthLimits,
  matchDomain,
  derivePlatformId,
  MAX_HOSTNAME_LEN,
  MAX_PATH_QUERY_LEN,
  MAX_URL_LEN,
  MAX_LINK_COUNT
} from '../src/shared/utils/platform.js'
import { AppError } from '../src/shared/errors.js'

/** 期望 normalizeLinkUrl 抛 LINK_URL_INVALID */
function expectInvalid(raw: unknown): void {
  expect(() => normalizeLinkUrl(raw)).toThrowError(AppError)
  try {
    normalizeLinkUrl(raw)
  } catch (err) {
    const e = err as AppError
    expect(e.code).toBe('LINK_URL_INVALID')
  }
}

describe('防投毒纯函数 (shared/utils/platform.ts)', () => {
  // ─── normalizeLinkUrl：协议白名单 + 裸链补全 ───

  describe('normalizeLinkUrl', () => {
    it('TC-FN-01: 裸域名补全 https://', () => {
      expect(normalizeLinkUrl('weibo.com')).toBe('https://weibo.com/')
      expect(normalizeLinkUrl('weibo.com/u/123')).toBe('https://weibo.com/u/123')
    })

    it('TC-FN-02: 已带 http/https 前缀原样归一化', () => {
      expect(normalizeLinkUrl('https://weibo.com/x')).toBe('https://weibo.com/x')
      expect(normalizeLinkUrl('http://weibo.com/x')).toBe('http://weibo.com/x')
    })

    it('TC-FN-03: 裸域名+端口补全（冒号后纯数字按端口处理）', () => {
      expect(normalizeLinkUrl('weibo.com:8080/x')).toBe('https://weibo.com:8080/x')
    })

    it('TC-FN-04: javascript: 拒绝', () => {
      expectInvalid('javascript:alert(1)')
    })

    it('TC-FN-05: ftp:// 拒绝', () => {
      expectInvalid('ftp://weibo.com/file')
    })

    it('TC-FN-06: data: 拒绝', () => {
      expectInvalid('data:text/html;base64,xxx')
    })

    it('TC-FN-07: 空值/非字符串拒绝', () => {
      expectInvalid('')
      expectInvalid('   ')
      expectInvalid(null)
      expectInvalid(undefined)
      expectInvalid(123)
    })

    it('TC-FN-08: 前后空白先 trim', () => {
      expect(normalizeLinkUrl('  weibo.com  ')).toBe('https://weibo.com/')
    })

    it('TC-FN-09: 无法解析的输入拒绝', () => {
      expectInvalid('https://')
      expectInvalid('http:///')
    })
  })

  // ─── assertLinkLengthLimits：长度硬校验 ───

  describe('assertLinkLengthLimits', () => {
    it('TC-FN-10: 域名 254 字符拒绝（上限 253）', () => {
      // hostname = 250 个 a + '.com' = 254 字符
      const host = 'a'.repeat(250) + '.com'
      expect(host.length).toBe(MAX_HOSTNAME_LEN + 1)
      const url = 'https://' + host + '/'
      expect(() => assertLinkLengthLimits(url)).toThrowError(AppError)
    })

    it('TC-FN-11: 域名 253 字符通过（边界值）', () => {
      const host = 'a'.repeat(249) + '.com'
      expect(host.length).toBe(MAX_HOSTNAME_LEN)
      expect(() => assertLinkLengthLimits('https://' + host + '/')).not.toThrow()
    })

    it('TC-FN-12: 路径+查询 1501 拒绝（上限 1500）', () => {
      // pathname = '/' + 1500 个 a = 1501 字符
      const url = 'https://e.com/' + 'a'.repeat(MAX_PATH_QUERY_LEN)
      expect(new URL(url).pathname.length).toBe(MAX_PATH_QUERY_LEN + 1)
      expect(() => assertLinkLengthLimits(url)).toThrowError(AppError)
    })

    it('TC-FN-13: 路径+查询 1500 通过（边界值）', () => {
      // pathname = '/' + 1499 个 a = 1500 字符
      const url = 'https://e.com/' + 'a'.repeat(MAX_PATH_QUERY_LEN - 1)
      expect(new URL(url).pathname.length).toBe(MAX_PATH_QUERY_LEN)
      expect(() => assertLinkLengthLimits(url)).not.toThrow()
    })

    it('TC-FN-14: 总长 1801 拒绝（上限 1800，用 hash 构造——path/hash 不计入 path+query 限制）', () => {
      // 域名与路径均在上限内，仅靠超长 hash 把总长推过 1800
      const url = 'https://e.com/' + 'a'.repeat(100) + '#' + 'b'.repeat(MAX_URL_LEN - 8 - 5 - 1 - 100 - 1 + 1)
      expect(url.length).toBe(MAX_URL_LEN + 1)
      expect(() => assertLinkLengthLimits(url)).toThrowError(AppError)
    })

    it('TC-FN-15: 总长 1800 通过（边界值）', () => {
      const url = 'https://e.com/' + 'a'.repeat(100) + '#' + 'b'.repeat(MAX_URL_LEN - 8 - 5 - 1 - 100 - 1)
      expect(url.length).toBe(MAX_URL_LEN)
      expect(() => assertLinkLengthLimits(url)).not.toThrow()
    })
  })

  // ─── matchDomain：域名末尾匹配（防投毒核心） ───

  describe('matchDomain', () => {
    it('TC-FN-16: 完全相等命中 (weibo.com ✓)', () => {
      expect(matchDomain('weibo.com', ['weibo.com'])).toBe(true)
    })

    it('TC-FN-17: 子域名命中 (m.weibo.com ✓)', () => {
      expect(matchDomain('m.weibo.com', ['weibo.com'])).toBe(true)
      expect(matchDomain('a.b.weibo.com', ['weibo.com'])).toBe(true)
    })

    it('TC-FN-18: 后缀投毒拒绝 (weibo.com.evil.com ✗)', () => {
      expect(matchDomain('weibo.com.evil.com', ['weibo.com'])).toBe(false)
    })

    it('TC-FN-19: 前缀粘连拒绝 (xweibo.com ✗)', () => {
      expect(matchDomain('xweibo.com', ['weibo.com'])).toBe(false)
      expect(matchDomain('notweibo.com', ['weibo.com'])).toBe(false)
    })

    it('TC-FN-20: 大小写混写命中', () => {
      expect(matchDomain('WEIBO.COM', ['weibo.com'])).toBe(true)
      expect(matchDomain('M.Weibo.Com', ['weibo.com'])).toBe(true)
      expect(matchDomain('weibo.com', ['WEIBO.COM'])).toBe(true)
    })

    it('TC-FN-21: 空主机名/空域名表不命中', () => {
      expect(matchDomain('', ['weibo.com'])).toBe(false)
      expect(matchDomain('weibo.com', [])).toBe(false)
      expect(matchDomain('weibo.com', [''])).toBe(false)
    })
  })

  // ─── derivePlatformId：后端权威推导 ───

  describe('derivePlatformId', () => {
    const platforms = [
      { id: 1, match_domains: JSON.stringify(['weibo.com', 'weibo.cn']) },
      { id: 2, match_domains: JSON.stringify(['bilibili.com', 'b23.tv']) }
    ]

    it('TC-FN-22: 命中返回平台 id', () => {
      expect(derivePlatformId('https://weibo.com/u/1', platforms)).toBe(1)
      expect(derivePlatformId('https://m.weibo.cn/u/1', platforms)).toBe(1)
      expect(derivePlatformId('https://space.bilibili.com/1', platforms)).toBe(2)
    })

    it('TC-FN-23: 未知域名归「其他」（null）', () => {
      expect(derivePlatformId('https://my-art-site.com/x', platforms)).toBeNull()
    })

    it('TC-FN-24: 投毒域名不归任何平台（null 而非误命中）', () => {
      expect(derivePlatformId('https://weibo.com.evil.com/', platforms)).toBeNull()
      expect(derivePlatformId('https://xweibo.com/', platforms)).toBeNull()
    })

    it('TC-FN-25: 非法 URL 返回 null', () => {
      expect(derivePlatformId('not-a-url', platforms)).toBeNull()
    })

    it('TC-FN-26: 脏 match_domains JSON 跳过（不误判不抛错）', () => {
      const dirty = [
        { id: 9, match_domains: 'not-json' },
        { id: 1, match_domains: JSON.stringify(['weibo.com']) }
      ]
      expect(derivePlatformId('https://weibo.com/', dirty)).toBe(1)
    })

    it('TC-FN-27: 按列表顺序取第一个命中', () => {
      const dup = [
        { id: 7, match_domains: JSON.stringify(['weibo.com']) },
        { id: 8, match_domains: JSON.stringify(['weibo.com']) }
      ]
      expect(derivePlatformId('https://weibo.com/', dup)).toBe(7)
    })
  })

  // ─── 常量（派工拍板值） ───

  it('TC-FN-28: 上限常量与拍板值一致', () => {
    expect(MAX_HOSTNAME_LEN).toBe(253)
    expect(MAX_PATH_QUERY_LEN).toBe(1500)
    expect(MAX_URL_LEN).toBe(1800)
    expect(MAX_LINK_COUNT).toBe(8)
  })
})
