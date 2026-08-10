import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import { sanitizeStoredText } from '../src/shared/sanitize.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import * as artistService from '../src/features/artist/artist.service.js'

// ============================================
// 审计批 F-5（P3-18）: 存储型 XSS 纵深防御
// sanitizeStoredText 只做三件事：去 <script>/<style> 标签对、去内联事件属性（on*）、
// 去 javascript: 协议；不动正常文本/HTML 排版（富文本须知必须保留）
// ============================================

describe('sanitizeStoredText 最小入库清洗', () => {
  it('TC-F5-01: 去除 script 标签对（含属性、大小写、换行）', () => {
    expect(sanitizeStoredText('<script>alert(1)</script>hello')).toBe('hello')
    expect(sanitizeStoredText('a<SCRIPT src="https://evil/x.js">alert(1)</SCRIPT>b')).toBe('ab')
    expect(sanitizeStoredText('<script\n>alert(1)</script>')).toBe('')
    expect(sanitizeStoredText('x<script src=x/>y')).toBe('xy')
  })

  it('TC-F5-02: 去除 style 标签对', () => {
    expect(sanitizeStoredText('<style>body{display:none}</style>内容')).toBe('内容')
    expect(sanitizeStoredText('<STYLE type="text/css">.x{}</STYLE>')).toBe('')
  })

  it('TC-F5-03: 去除内联事件属性（on*，保留属性名前的空白不粘连）', () => {
    expect(sanitizeStoredText('<img src=x onerror=alert(1)>')).toBe('<img src=x >')
    expect(sanitizeStoredText('<img onerror="alert(1)" src=x>')).toBe('<img  src=x>')
    expect(sanitizeStoredText('<div onclick=\'evil()\'>点</div>')).toBe('<div >点</div>')
    // 大小写不敏感
    expect(sanitizeStoredText('<a OnClick="x">y</a>')).toBe('<a >y</a>')
  })

  it('TC-F5-04: 去除 javascript: 协议（大小写/空白混淆）', () => {
    expect(sanitizeStoredText('<a href="javascript:alert(1)">x</a>')).toBe('<a href="alert(1)">x</a>')
    expect(sanitizeStoredText('<a href="JAVASCRIPT:alert(1)">x</a>')).toBe('<a href="alert(1)">x</a>')
    expect(sanitizeStoredText('j a v a s c r i p t:alert(1)')).toBe('alert(1)')
  })

  it('TC-F5-05: 正常富文本原样保留（加粗/链接/列表/中文）', () => {
    const rich = '<p>约稿须知：<strong>定金不退</strong>，请见 <a href="https://example.com/faq">FAQ</a></p><ul><li>工期 30 天</li></ul>'
    expect(sanitizeStoredText(rich)).toBe(rich)
    expect(sanitizeStoredText('普通文本 &lt;script&gt; 原样（实体形式不动）')).toBe('普通文本 &lt;script&gt; 原样（实体形式不动）')
  })

  it('TC-F5-06: 非字符串输入安全返回空串（类型兜底）', () => {
    expect(sanitizeStoredText(undefined)).toBe('')
    expect(sanitizeStoredText(null)).toBe('')
    expect(sanitizeStoredText(123)).toBe('')
  })
})

describe('sanitizeStoredText 写入口挂接', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88420', subdomain: 'f5-xss' })
  })

  it('TC-F5-07: 留言 content 入库前清洗', () => {
    const msg = guestbookService.createMessage(artist.id, '小明', '<script>alert(1)</script><img src=x onerror=alert(2)>画得真好')
    expect(msg.content).toBe('<img src=x >画得真好')
  })

  it('TC-F5-08: 画师回复入库前清洗', () => {
    const msg = guestbookService.createMessage(artist.id, '小明', '你好')
    guestbookService.replyMessage(artist.id, msg.id, '谢谢<a href="javascript:alert(1)">点我</a>')
    const after = guestbookService.getMessageById(msg.id)
    expect(after.artist_reply).toBe('谢谢<a href="alert(1)">点我</a>')
  })

  it('TC-F5-09: 须知入库前清洗（富文本排版保留）', () => {
    const rules = artistService.updateRules(artist.id, '<p><strong>重要</strong></p><script>alert(1)</script><a href="https://ok.com">链接</a>')
    expect(rules.content).toBe('<p><strong>重要</strong></p><a href="https://ok.com">链接</a>')
  })

  it('TC-F5-10: 画师 bio / announcement 入库前清洗', () => {
    const updated = artistService.updateArtist(artist.id, {
      bio: '简介<script>alert(1)</script>正文',
      announcement: '公告<img src=x onerror=alert(1)>'
    })
    expect(updated.bio).toBe('简介正文')
    expect(updated.announcement).toBe('公告<img src=x >')
  })

  it('TC-F5-11: 作品描述入库前清洗（创建 + 编辑）', async () => {
    const artwork = await artistService.createArtwork(artist.id, {
      imagePath: `images/${artist.id}/x.png`,
      title: '图',
      description: '<style>p{}</style>描述'
    })
    expect(artwork.description).toBe('描述')

    const edited = artistService.updateArtwork(artwork.id, {
      description: '<a href="javascript:void(0)">坏</a>好'
    })
    expect(edited.description).toBe('<a href="void(0)">坏</a>好')
  })

  it('TC-F5-12: 正常富文本经写入口完整保留', () => {
    const rich = '<p>须知：<strong>加粗</strong> <a href="https://example.com">链接</a></p>'
    const rules = artistService.updateRules(artist.id, rich)
    expect(rules.content).toBe(rich)
  })
})
