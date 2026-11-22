// F0281: 真实 XSS 过滤回归测试。原 sanitize.test.ts 全量 mock 了 DOMPurify，
// 真实过滤路径从未被测试；本文件在 jsdom 环境用真实 DOMPurify 验证消毒效果，
// 覆盖 script / 事件属性 / javascript: 协议 / data: 图片 / data-* 属性 / 链接加固。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../sanitize'

describe('sanitizeHtml 真实 DOMPurify 过滤（F0281）', () => {
  it('剥离 <script> 标签与脚本内容', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/alert\(1\)/)
    expect(out).toContain('<p>ok</p>')
  })

  it('剥离事件属性 on*', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)" alt="a">')
    expect(out).not.toMatch(/onerror/i)
    expect(out).toContain('alt="a"')
  })

  it('拦截 javascript: 协议链接', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })

  it('拦截 data: 协议图片', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">')
    expect(out).not.toMatch(/data:text\/html/i)
  })

  it('禁用 data-* 自定义属性', () => {
    const out = sanitizeHtml('<p data-evil="1">ok</p>')
    expect(out).not.toMatch(/data-evil/i)
  })

  it('链接被强制 target=_blank + rel=noopener noreferrer（真实 hook）', () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>')
    expect(out).toMatch(/target="_blank"/)
    expect(out).toMatch(/noopener noreferrer/)
  })

  it('非白名单标签被剥离，合法排版标签保留', () => {
    const out = sanitizeHtml('<iframe src="x"></iframe><strong>bold</strong><ul><li>item</li></ul>')
    expect(out).not.toMatch(/<iframe/i)
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<li>item</li>')
  })
})
