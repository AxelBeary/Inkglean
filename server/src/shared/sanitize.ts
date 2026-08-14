/**
 * F-5（P3-18）: 存储型 XSS 纵深防御——最小入库清洗
 *
 * 安全完全依赖前端 DOMPurify 时为单点防御，本函数做后端兜底。只做三件事，
 * 刻意保守，不动正常文本/HTML 排版（富文本须知等 v-html 合法用途必须保留）：
 *   1. 去 <script>/<style> 标签对（含属性、大小写、换行、自闭合）
 *   2. 去内联事件属性（on*，大小写不敏感）
 *   3. 去 javascript: 协议（大小写、字母间空白混淆均命中）
 * 渲染层消毒仍由前端 DOMPurify 负责（本函数不解析 DOM，不替代它）。
 */

/**
 * 去 <script>/<style> 标签对（含属性、大小写、换行），并补去自闭合标签。
 * 循环洗到不动点（上限 10 次）：`<scr<script></script>ipt>` 这类嵌套绕过单次替换会
 * 还原出 `<script>`，必须重复清洗直至无剩余标签对；上限防恶意超长串卡死。
 *
 * CodeQL 告警修复（2026-08-14，js/bad-tag-filter）：结束标签放宽为 `\b[^>]*>`
 * ——浏览器容错解析会把 `</script foo="bar">`、`</script/foo>` 当作 script 结束
 * 标签，旧正则 `\s*>` 匹配不到，导致 `<script>alert(1)</script foo="bar">` 整对
 * 残留入库。放宽后与开始标签同样允许属性/斜杠，实测不再残留。
 */
function removeTagPairs(input: string): string {
  let out = input
  for (let i = 0; i < 10; i++) {
    const next = out
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*(script|style)\b[^>]*>/gi, '')
      .replace(/<\s*(script|style)\b[^>]*\/\s*>/gi, '')
    if (next === out) break
    out = next
  }
  return out
}

/** 去内联事件属性（on*），保留属性名前的空白/斜杠避免标签粘连 */
function removeInlineEventAttributes(input: string): string {
  return input.replace(/([\s/])on[a-z][a-z0-9_]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '$1')
}

/** 去 javascript: 协议（大小写、字母间空白混淆均命中；保留其余文本） */
function removeJavascriptProtocol(input: string): string {
  return input.replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
}

/**
 * 最小入库清洗（只清理脚本/事件/危险协议，保留排版 HTML）。
 * CodeQL 告警修复（2026-08-14，js/incomplete-multi-character-sanitization）：
 * 全链路循环洗到不动点（上限 10 次）——单次替换存在嵌套还原绕过：
 * `javajavascript:script:` 内层被删后外层重新拼出可执行协议，必须重复清洗直至无变化。
 */
export function sanitizeStoredText(input: unknown): string {
  if (typeof input !== 'string') return ''
  let out = input
  for (let i = 0; i < 10; i++) {
    const next = removeJavascriptProtocol(removeInlineEventAttributes(removeTagPairs(out)))
    if (next === out) break
    out = next
  }
  return out
}
