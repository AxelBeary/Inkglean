// sanitizeHtml 测试（P0-2 安全修复：DOMPurify 消毒）
//
// ⚠️ 环境限制说明：happy-dom 的 DOMParser 与 DOMPurify 的解析预期不兼容
// （实测：白名单标签被误删、script/form 反而保留、afterSanitizeAttributes hook 不生效），
// 因此本文件 mock DOMPurify，测试 sanitizeHtml 的集成契约：
//   1. 空输入短路（不调用 DOMPurify）
//   2. 白名单配置正确传递（这是我们的安全策略，防止误加危险标签）
//   3. 链接加固 hook 行为（target=_blank + rel=noopener noreferrer）
// DOMPurify 自身的标签/属性过滤由该库的测试套件保证（真实浏览器环境）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSanitize, mockAddHook } = vi.hoisted(() => ({
  mockSanitize: vi.fn((html) => html || ''),
  mockAddHook: vi.fn()
}))

vi.mock('dompurify', () => ({
  default: {
    sanitize: mockSanitize,
    addHook: mockAddHook
  }
}))

import { sanitizeHtml } from '../sanitize.js'

// hook 在 sanitize.js 模块加载时注册，在 clearAllMocks 之前捕获
const linkHookCall = mockAddHook.mock.calls.find(([name]) => name === 'afterSanitizeAttributes')

beforeEach(() => {
  vi.clearAllMocks()
  mockSanitize.mockImplementation((html) => html || '')
})

describe('sanitizeHtml', () => {
  it('空值返回空串，不调用 DOMPurify', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(mockSanitize).not.toHaveBeenCalled()
  })

  it('非空输入透传给 DOMPurify 并返回其结果', () => {
    mockSanitize.mockReturnValueOnce('<p>safe</p>')
    expect(sanitizeHtml('<p>safe</p><script>x</script>')).toBe('<p>safe</p>')
    expect(mockSanitize).toHaveBeenCalledWith('<p>safe</p><script>x</script>', expect.any(Object))
  })

  // ─── 白名单配置（我们的安全策略） ───

  it('传递白名单配置：ALLOWED_TAGS / ALLOWED_ATTR / ALLOW_DATA_ATTR:false', () => {
    sanitizeHtml('<p>hi</p>')
    expect(mockSanitize).toHaveBeenCalledWith('<p>hi</p>', expect.objectContaining({
      ALLOWED_TAGS: expect.any(Array),
      ALLOWED_ATTR: expect.any(Array),
      ALLOW_DATA_ATTR: false
    }))
  })

  it('ALLOWED_TAGS 包含常用排版标签', () => {
    sanitizeHtml('<p>hi</p>')
    const { ALLOWED_TAGS } = mockSanitize.mock.calls[0][1]
    for (const tag of ['p', 'br', 'strong', 'em', 'a', 'img', 'ul', 'ol', 'li', 'table', 'h1', 'blockquote', 'pre', 'code']) {
      expect(ALLOWED_TAGS).toContain(tag)
    }
  })

  it('ALLOWED_TAGS 不含危险标签（script/iframe/form/input/svg/style）', () => {
    sanitizeHtml('<p>hi</p>')
    const { ALLOWED_TAGS } = mockSanitize.mock.calls[0][1]
    for (const tag of ['script', 'iframe', 'form', 'input', 'svg', 'style', 'object', 'embed']) {
      expect(ALLOWED_TAGS).not.toContain(tag)
    }
  })

  it('ALLOWED_ATTR 不含任何事件属性（on* 开头）', () => {
    sanitizeHtml('<p>hi</p>')
    const { ALLOWED_ATTR } = mockSanitize.mock.calls[0][1]
    expect(ALLOWED_ATTR.some(attr => attr.startsWith('on'))).toBe(false)
    // 也不含 style（防 CSS 注入）
    expect(ALLOWED_ATTR).not.toContain('style')
  })

  it('ALLOWED_ATTR 包含链接与图片必需属性', () => {
    sanitizeHtml('<p>hi</p>')
    const { ALLOWED_ATTR } = mockSanitize.mock.calls[0][1]
    for (const attr of ['href', 'src', 'alt', 'title', 'target', 'rel']) {
      expect(ALLOWED_ATTR).toContain(attr)
    }
  })

  // ─── 链接加固 hook（afterSanitizeAttributes） ───

  it('模块加载时注册 afterSanitizeAttributes hook', () => {
    expect(linkHookCall).toBeTruthy()
  })

  it('链接节点被强制 target=_blank + rel=noopener noreferrer', () => {
    const [, hookFn] = linkHookCall
    const attrs = {}
    hookFn({ tagName: 'A', setAttribute: (k, v) => { attrs[k] = v } })
    expect(attrs.target).toBe('_blank')
    expect(attrs.rel).toBe('noopener noreferrer')
  })

  it('非链接节点不受 hook 影响', () => {
    const [, hookFn] = linkHookCall
    const setAttribute = vi.fn()
    hookFn({ tagName: 'P', setAttribute })
    hookFn({ tagName: 'IMG', setAttribute })
    expect(setAttribute).not.toHaveBeenCalled()
  })
})
