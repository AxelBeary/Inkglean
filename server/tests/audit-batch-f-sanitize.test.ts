import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { sanitizeStoredText, sanitizeStoredHtml } from '../src/shared/sanitize.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import type { GuestbookMessage } from '../src/features/guestbook/guestbook.service.js'
import * as artistService from '../src/features/artist/artist.service.js'
import * as workflowService from '../src/features/artist/workflow.service.js'
import * as greetingService from '../src/features/artist/greeting.service.js'

// ============================================
// 审计批 F-5（P3-18）: 存储型 XSS 纵深防御
// CodeQL 根治轮·方案 B（2026-08-14）：手写正则清洗整体换 DOMPurify 真引擎
// （isomorphic-dompurify），按渲染路径分两档：
//   - sanitizeStoredHtml：富文本（须知 rules，唯一 v-html 字段），白名单镜像前端
//   - sanitizeStoredText：纯文本（{{ }} 插值字段），零标签提取，& < > 零实体化
// ============================================

describe('sanitizeStoredText 纯文本零标签提取', () => {
  it('TC-F5-01: script 连标签带内容整体移除（含属性、大小写、换行、无闭合）', () => {
    expect(sanitizeStoredText('<script>alert(1)</script>hello')).toBe('hello')
    expect(sanitizeStoredText('a<SCRIPT src="https://evil/x.js">alert(1)</SCRIPT>b')).toBe('ab')
    expect(sanitizeStoredText('<script\n>alert(1)</script>')).toBe('')
    // 无闭合 script 吞到文档尾——比旧正则「删标签留残文」更彻底
    expect(sanitizeStoredText('<script>alert(1)')).toBe('')
    expect(sanitizeStoredText('x<script src="https://evil/x.js">y')).toBe('x')
  })

  it('TC-F5-02: style 连标签带内容整体移除', () => {
    expect(sanitizeStoredText('<style>body{display:none}</style>内容')).toBe('内容')
    expect(sanitizeStoredText('<STYLE type="text/css">.x{}</STYLE>')).toBe('')
  })

  it('TC-F5-03: 标签剥掉只留文本内容（img 无内容直接消失，div/a 留内文）', () => {
    expect(sanitizeStoredText('<img src=x onerror=alert(1)>')).toBe('')
    // d2 P2: 斜杠分隔属性（<img/src=x/onerror=...>）同样整标签剥离
    expect(sanitizeStoredText('<img/src=x/onerror=alert(1)>')).toBe('')
    expect(sanitizeStoredText('<img onerror="alert(1)" src=x>')).toBe('')
    expect(sanitizeStoredText('<div onclick=\'evil()\'>点</div>')).toBe('点')
    expect(sanitizeStoredText('<a OnClick="x">y</a>')).toBe('y')
  })

  it('TC-F5-04: 危险协议随标签一起消失（纯文本输出无标签无属性，不可执行）', () => {
    expect(sanitizeStoredText('<a href="javascript:alert(1)">x</a>')).toBe('x')
    expect(sanitizeStoredText('<a href="JAVASCRIPT:alert(1)">x</a>')).toBe('x')
    // 纯文本形态的「j a v a s c r i p t:」无标签无属性，{{ }} 插值渲染不可执行，原样保留
    expect(sanitizeStoredText('j a v a s c r i p t:alert(1)')).toBe('j a v a s c r i p t:alert(1)')
  })

  it('TC-F5-05: 纯文本零误伤（& < > 不实体化、不丢失——{{ }} 插值字段防双重转义）', () => {
    expect(sanitizeStoredText('R&D')).toBe('R&D')
    expect(sanitizeStoredText('Tom & Jerry')).toBe('Tom & Jerry')
    expect(sanitizeStoredText('价格<100')).toBe('价格<100')
    expect(sanitizeStoredText('<3 小明')).toBe('<3 小明')
    expect(sanitizeStoredText('5<6 折')).toBe('5<6 折')
    expect(sanitizeStoredText('普通文本无标签原样')).toBe('普通文本无标签原样')
    // 实体形式输入解码为文本，渲染层 {{ }} 惰性展示，不可执行
    expect(sanitizeStoredText('实体 &lt;script&gt; 解码为纯文本')).toBe('实体 <script> 解码为纯文本')
  })

  it('TC-F5-06: 非字符串输入安全返回空串（类型兜底）', () => {
    expect(sanitizeStoredText(undefined)).toBe('')
    expect(sanitizeStoredText(null)).toBe('')
    expect(sanitizeStoredText(123)).toBe('')
  })
})

describe('sanitizeStoredHtml 富文本白名单重建（镜像前端 web/src/utils/sanitize.js）', () => {
  it('TC-F5-R1: script/style 整体移除，事件属性剥离', () => {
    expect(sanitizeStoredHtml('<script>alert(1)</script>hello')).toBe('hello')
    expect(sanitizeStoredHtml('<style>body{display:none}</style>内容')).toBe('内容')
    expect(sanitizeStoredHtml('<img src=x onerror=alert(1)>')).toBe('<img src="x">')
    expect(sanitizeStoredHtml('<div onclick="evil()">点</div>')).toBe('<div>点</div>')
    // CodeQL #18/19/21/22/23 全部构造：畸形闭合/孤立标签由真解析引擎归零
    expect(sanitizeStoredHtml('<script>alert(1)</script foo="bar">')).toBe('')
    expect(sanitizeStoredHtml('<script>alert(1)</script/foo>')).toBe('')
    expect(sanitizeStoredHtml('<script>alert(1)')).toBe('')
    expect(sanitizeStoredHtml('<scr<script></script>ipt>')).not.toMatch(/<\s*script/i)
    expect(sanitizeStoredHtml('<scr<script></script>ipt>')).not.toContain('alert')
  })

  it('TC-F5-R2: javascript: 协议整属性移除（不是剥前缀留残文）', () => {
    expect(sanitizeStoredHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('href')
    expect(sanitizeStoredHtml('<a href="javascript:alert(1)">x</a>')).toContain('>x</a>')
    expect(sanitizeStoredHtml('<a href="https://ok.com">链接</a>')).toContain('href="https://ok.com"')
  })

  it('TC-F5-R3: 链接钩子——强制 target=_blank + noopener（与前端同款）', () => {
    const out = sanitizeStoredHtml('<a href="https://ok.com">链接</a>')
    expect(out).toBe('<a href="https://ok.com" target="_blank" rel="noopener noreferrer">链接</a>')
  })

  it('TC-F5-R4: 正常富文本排版保留（含 div/table 不误删——五号风险点实测）', () => {
    expect(sanitizeStoredHtml('<div>块级保留</div>')).toBe('<div>块级保留</div>')
    // jsdom 规范化会补 tbody，属正常序列化，结构语义不变
    expect(sanitizeStoredHtml('<table><tr><td>表</td></tr></table>'))
      .toBe('<table><tbody><tr><td>表</td></tr></tbody></table>')
    const rich = '<p>须知：<strong>加粗</strong> 与 <em>斜体</em></p><ul><li>一</li><li>二</li></ul>'
    expect(sanitizeStoredHtml(rich)).toBe(rich)
    expect(sanitizeStoredHtml('<h2>标题</h2><blockquote>引用</blockquote><pre><code>code</code></pre>'))
      .toBe('<h2>标题</h2><blockquote>引用</blockquote><pre><code>code</code></pre>')
  })

  it('TC-F5-R5: 白名单外标签剥离留内文，data-* 属性移除（ALLOW_DATA_ATTR:false）', () => {
    expect(sanitizeStoredHtml('<iframe src="https://evil"></iframe>尾')).toBe('尾')
    expect(sanitizeStoredHtml('<form action="/x"><input></form>文')).toBe('文')
    expect(sanitizeStoredHtml('<p data-foo="1">x</p>')).toBe('<p>x</p>')
  })

  it('TC-F5-R6: 非字符串输入安全返回空串（类型兜底）', () => {
    expect(sanitizeStoredHtml(undefined)).toBe('')
    expect(sanitizeStoredHtml(null)).toBe('')
    expect(sanitizeStoredHtml(123)).toBe('')
  })
})

describe('写入口挂接（纯文本字段走 sanitizeStoredText）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88420', subdomain: 'f5-xss' })
  })

  it('TC-F5-07: 留言 content 入库前清洗', () => {
    const msg = guestbookService.createMessage(artist.id, '小明', '<script>alert(1)</script><img src=x onerror=alert(2)>画得真好') as GuestbookMessage
    expect(msg.content).toBe('画得真好')
  })

  it('TC-F5-08: 画师回复入库前清洗', () => {
    const msg = guestbookService.createMessage(artist.id, '小明', '你好') as GuestbookMessage
    guestbookService.replyMessage(artist.id, msg.id, '谢谢<a href="javascript:alert(1)">点我</a>')
    const after = guestbookService.getMessageById(msg.id) as GuestbookMessage
    expect(after.artist_reply).toBe('谢谢点我')
  })

  it('TC-F5-09: 须知入库前走富文本白名单（排版保留+链接钩子固化）', () => {
    const rules = artistService.updateRules(artist.id, '<p><strong>重要</strong></p><script>alert(1)</script><a href="https://ok.com">链接</a>') as { content: string }
    expect(rules.content).toBe('<p><strong>重要</strong></p><a href="https://ok.com" target="_blank" rel="noopener noreferrer">链接</a>')
  })

  it('TC-F5-10: 画师 bio / announcement 入库前清洗', () => {
    const updated = artistService.updateArtist(artist.id, {
      bio: '简介<script>alert(1)</script>正文',
      announcement: '公告<img src=x onerror=alert(1)>'
    }) as { bio: string; announcement: string }
    expect(updated.bio).toBe('简介正文')
    expect(updated.announcement).toBe('公告')
  })

  it('TC-F5-11: 作品描述入库前清洗（创建 + 编辑）', async () => {
    const artwork = await artistService.createArtwork(artist.id, {
      imagePath: `images/${artist.id}/x.png`,
      title: '图<script>alert(1)</script>',
      description: '<style>p{}</style>描述'
    }) as { id: number; title: string; description: string }
    expect(artwork.title).toBe('图')
    expect(artwork.description).toBe('描述')

    const edited = artistService.updateArtwork(artwork.id, {
      title: '新图<img src=x onerror=alert(1)>',
      description: '<a href="javascript:void(0)">坏</a>好'
    }) as { title: string; description: string }
    expect(edited.title).toBe('新图')
    expect(edited.description).toBe('坏好')
  })

  it('TC-F5-16: createArtist bio 与 updateArtist 同口径清洗', async () => {
    const created = await artistService.createArtist({
      qqNumber: '88421', name: '新画师', subdomain: 'f5bio',
      bio: '<script>alert(1)</script>简介'
    }) as { bio: string }
    expect(created.bio).toBe('简介')
  })

  it('TC-F5-17: 工作流节点 name/description/speechTemplate 写入口清洗', () => {
    workflowService.seedArtistStages(artist.id)
    const stage = workflowService.addStage(artist.id, {
      name: '<script>alert(1)</script>细化',
      description: '<img src=x onerror=alert(1)>描述'
    }) as { id: number; name: string; description: string }
    expect(stage.name).toBe('细化')
    expect(stage.description).toBe('描述')

    const updated = workflowService.updateStage(artist.id, stage.id, {
      speechTemplate: '<a href="javascript:alert(1)">话术</a>'
    }) as { speechTemplate: string }
    expect(updated.speechTemplate).toBe('话术')
  })

  it('TC-F5-18: 问候语 text 写入口清洗（全局/专属/更新）', () => {
    const g = greetingService.createGlobalGreeting({ text: '<script>alert(1)</script>早上好' }) as { id: number; text: string }
    expect(g.text).toBe('早上好')
    const a = greetingService.createArtistGreeting(artist.id, { text: '<img src=x onerror=alert(1)>专属' }) as { text: string }
    expect(a.text).toBe('专属')
    const updated = greetingService.updateGreeting(g.id, { text: '<a href="javascript:alert(1)">新问候</a>' }) as { text: string }
    expect(updated.text).toBe('新问候')
  })

  it('TC-F5-19: 留言 nickname 与 content 同口径清洗', () => {
    const msg = guestbookService.createMessage(artist.id, '<img src=x onerror=alert(1)>访客', '你好') as GuestbookMessage
    expect(msg.nickname).toBe('访客')
  })

  it('TC-F5-12: 正常富文本须知经写入口完整保留（链接钩子固化 _blank/noopener）', () => {
    const rules = artistService.updateRules(artist.id, '<p>须知：<strong>加粗</strong> <a href="https://example.com">链接</a></p>') as { content: string }
    expect(rules.content).toBe('<p>须知：<strong>加粗</strong> <a href="https://example.com" target="_blank" rel="noopener noreferrer">链接</a></p>')
  })

  it('TC-F5-24: 纯文本字段含 & < 特殊字符零误伤（{{ }} 插值防双重转义回归）', () => {
    const msg = guestbookService.createMessage(artist.id, 'R&D 粉', '价格<100 吗？5<6 折') as GuestbookMessage
    expect(msg.nickname).toBe('R&D 粉')
    expect(msg.content).toBe('价格<100 吗？5<6 折')
    const updated = artistService.updateArtist(artist.id, { bio: 'Tom & Jerry 同人社' }) as { bio: string }
    expect(updated.bio).toBe('Tom & Jerry 同人社')
  })
})
