// ============================================
// HTML 消毒工具 - 防止存储型 XSS
// 只允许安全的格式化标签，剥离脚本/事件/危险属性
// ============================================

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div'
])

const ALLOWED_ATTRS = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan']
}

/**
 * 消毒 HTML 字符串，只保留安全标签和属性
 * @param {string} html - 原始 HTML
 * @returns {string} 消毒后的 HTML
 */
export function sanitizeHtml(html) {
  if (!html) return ''

  const template = document.createElement('template')
  template.innerHTML = html

  sanitizeNode(template.content)

  return template.innerHTML
}

function sanitizeNode(node) {
  const toRemove = []

  for (const child of node.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase()

      if (!ALLOWED_TAGS.has(tag)) {
        // 不允许的标签：保留子节点内容，移除标签本身
        toRemove.push(child)
        continue
      }

      // 清理属性
      const allowed = ALLOWED_ATTRS[tag] || []
      const attrsToRemove = []
      for (const attr of child.attributes) {
        const name = attr.name.toLowerCase()
        if (!allowed.includes(name)) {
          attrsToRemove.push(attr.name)
        } else if (name === 'href' || name === 'src') {
          // 阻止 javascript: 协议
          const val = attr.value.trim().toLowerCase()
          if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
            attrsToRemove.push(attr.name)
          }
        }
      }
      attrsToRemove.forEach(a => child.removeAttribute(a))

      // a 标签强制加 rel="noopener"
      if (tag === 'a') {
        child.setAttribute('rel', 'noopener noreferrer')
        child.setAttribute('target', '_blank')
      }

      // 递归清理子节点
      sanitizeNode(child)
    } else if (child.nodeType === Node.COMMENT_NODE) {
      toRemove.push(child)
    }
  }

  // 移除不允许的标签（保留其文本内容）
  for (const el of toRemove) {
    while (el.firstChild) {
      node.insertBefore(el.firstChild, el)
    }
    node.removeChild(el)
  }
}
