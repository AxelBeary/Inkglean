/**
 * F-5（P3-18）: 存储型 XSS 纵深防御——入库清洗（CodeQL 根治轮·方案 B，2026-08-14）
 *
 * 手写正则清洗被 CodeQL 连续判警（#18/19/21/22/23，incomplete-multi-character-sanitization /
 * bad-tag-filter）：字符串替换永远追不上浏览器容错解析的变体。根治 = 换 DOMPurify
 * 真引擎（isomorphic-dompurify，服务端 jsdom 解析），mutation XSS 从原理上消失。
 *
 * 字段按渲染路径分两档（渲染面已逐个核实）：
 *   1. sanitizeStoredHtml —— 富文本字段（须知 rules，唯一走 v-html/SanitizedRichText 的字段）。
 *      白名单完全镜像前端 web/src/utils/sanitize.js（单一事实源，存储层/渲染层同口径）。
 *   2. sanitizeStoredText —— 纯文本字段（留言/昵称/bio/公告/节点名/话术/作品标题描述等，
 *      全部 {{ }} 插值渲染）。零标签提取：保留纯文本、标签连内容一起剥掉。
 *      刻意不走白名单序列化——实测序列化会把「价格<100」变成「价格&lt;100」，
 *      经 {{ }} 插值双重转义直接显示实体，误伤正常文本。
 */
import DOMPurify from 'isomorphic-dompurify'

/** 白名单镜像 web/src/utils/sanitize.js（改动须两处同步，单一事实源） */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div'
]

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan'
]

// 与前端同款钩子：所有链接强制新窗口 + noopener（存储层即固化，不依赖渲染层补）
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * 富文本入库清洗（白名单重建）。仅供 v-html 渲染路径的字段（须知 rules）使用。
 * DOMPurify 内置 javascript:/data:/vbscript: 协议拦截与嵌套/畸形标签解析，
 * 不存在字符串替换的还原绕过。
 */
export function sanitizeStoredHtml(input: unknown): string {
  if (typeof input !== 'string') return ''
  return DOMPurify.sanitize(input, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false })
}

/**
 * 纯文本入库清洗（零标签提取）。供 {{ }} 插值渲染的字段使用。
 * 实现：ALLOWED_TAGS 空集消毒后取 textContent——
 *   - script/style 连标签带内容整体移除（`<script>alert(1)` 无闭合也不留残文）
 *   - 其余标签剥掉只留文本；纯文本原样保留（& < > 零实体化，无双重转义误伤）
 */
export function sanitizeStoredText(input: unknown): string {
  if (typeof input !== 'string') return ''
  const dom = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: true
  })
  return dom.textContent ?? ''
}
