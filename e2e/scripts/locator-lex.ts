// E2E 定位器静态扫描的轻量词法层（无第三方依赖、无 IO 副作用）。
// 从 check-locators.ts 抽出，使「注释豁免判定 / 首参闭引号判定 / 单行规则」可被定向回归样例直接单测。
// 单一职责：本文件只做词法与规则判定，文件遍历、输出、exitCode 归 check-locators.ts。

/** 单条定位器风险（与 check-locators.ts 输出格式一一对应） */
export interface LocatorIssue {
  level: 'error' | 'warn'
  line: number
  text: string
  message: string
}

/**
 * SCR-04：仅在真正的行注释（//）或块注释（/* *\/）中认 `locator-ok` 为豁免。
 * 旧实现 `/locator-ok/.test(line)` 整行子串匹配，把 `getByText('locator-ok 状态提示')`
 * 这类字符串字面量也当豁免，整行跳过检查 → 校验假阴性。
 * 轻量词法：逐字符跳过单/双/反引号字面量（含反斜杠转义），只把注释片段拼进 comment 再测。
 */
export function hasLocatorOkComment(line: string): boolean {
  let comment = ''
  let i = 0
  const n = line.length
  while (i < n) {
    const ch = line[i]
    // 字符串字面量（含模板串）：整段跳过，内部 // 或 locator-ok 都不算注释
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < n) {
        if (line[i] === '\\') {
          i += 2
          continue
        }
        if (line[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    // 行注释：到行尾
    if (ch === '/' && line[i + 1] === '/') {
      comment += line.slice(i + 2)
      break
    }
    // 块注释：到 */ 或行尾（跨行块注释的后续行不含起始 */，按普通文本处理，下一行重新判定）
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      comment += line.slice(i + 2, end === -1 ? n : end)
      i = end === -1 ? n : end + 2
      continue
    }
    i++
  }
  return /locator-ok/.test(comment)
}

/**
 * SCR-05：找闭合引号时跳过反斜杠转义。
 * 旧实现 `indexOf(quote, 1)` 把 `getByText('don\\'t stop')` 里被转义的 `'` 当闭合引号，
 * 截断后残留 `t stop')` → 误判动态 → 裸调用报 [ERROR] → check:e2e 门禁假红。
 */
export function findClosingQuote(text: string, from: number, quote: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === quote) return i
  }
  return -1
}

/**
 * 判定参数是动态（变量/模板/正则）还是静态字符串字面量。
 * F0058 口径：只认「首参是完整字面量、且其后要么为空、要么以逗号进入选项参」为静态；
 * '前缀' + 变量、'xx'.trim() 这类以字面量开头的拼接一律按动态。
 */
export function isDynamicArg(arg: string): boolean {
  const a = arg.trim()
  // 模板字符串 `xxx${yyy}`、变量、正则 /xxx/ 均视为动态
  if (a.startsWith('`') || a.startsWith('/') || a.startsWith('$')) return true
  if (a.startsWith("'") || a.startsWith('"')) {
    const quote = a.charAt(0)
    // SCR-05：改用转义感知的闭引号查找（旧 indexOf 不处理转义 → 门禁假红）
    const close = findClosingQuote(a, 1, quote)
    if (close === -1) return true // 引号未闭合（跨行拼接等）：保守按动态
    const after = a.slice(close + 1).trim()
    return after !== '' && !after.startsWith(',')
  }
  // 含表达式/函数调用，或兜底非纯字符串一律按动态
  return true
}

/**
 * 对单行执行两条定位器规则（豁免由调用方先判，见 hasLocatorOkComment）。
 * 规则 1/2：裸 page 的 getByText —— 动态 ERROR、静态 WARN；已 scope 的允许。
 * 规则 3：裸 page 的 getByRole(..., { name: 动态 }) —— ERROR。
 */
export function analyzeLine(line: string, lineNo: number): LocatorIssue[] {
  const issues: LocatorIssue[] = []
  const push = (level: LocatorIssue['level'], message: string): void => {
    issues.push({ level, line: lineNo, text: line.trim().slice(0, 120), message })
  }

  // 匹配 getByText(...) 调用；前缀识别 page./drawer./row./locator(...). 等
  const m = line.match(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\.getByText\(\s*(.+?)\s*\)/)
  if (m) {
    const prefix = m[1]
    // F0059: page / this.page / x.page / 以 Page 结尾的 fixture 页（artistPage、adminPage）算裸调用
    const isBare = /[Pp]age$/.test(prefix)
    if (isDynamicArg(m[2])) {
      if (isBare) push('error', '动态文本 getByText 未 scope（未来双布局/重复必 strict）')
      // 已 scope 的动态文本：允许（E3/E4 模式）
    } else if (isBare) {
      push('warn', '静态文本 getByText 裸调用——若页面出现重复文本会 strict；确认唯一可加 // locator-ok')
    }
  }

  // 规则 3：选项非贪婪到 `})`，兼容 name: `动${x}` 的插值花括号（F0059）
  const rm = line.match(/\.getByRole\(\s*(['"`][^'"`]*['"`])\s*,\s*(\{.*?\})\s*\)/)
  if (rm) {
    const pre = line.slice(0, rm.index).trim()
    const isBareRole = /(?:^|[^.\w$])[\w$]*(?:[\w$]+\.)?[Pp]age\s*$/.test(pre)
    const nameMatch = rm[2].match(/\bname\s*:\s*([^,}]+)/)
    if (isBareRole && nameMatch && isDynamicArg(nameMatch[1])) {
      push('error', '动态 name 的 getByRole 未 scope（strict-mode 风险）')
    }
  }

  return issues
}
