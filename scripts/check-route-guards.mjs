#!/usr/bin/env node
// check-route-guards.mjs — 路由归属守卫静态检查（R-1「防腐栏」，2026-11-28 制作人拍板方案 ①）
// 用法：node scripts/check-route-guards.mjs [仓库根路径] [--list]
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ 这是防腐栏，不是安全证明。                                                  │
// │ 它只回答一个问题：「这条写路由看起来挂守卫了吗？」                            │
// │ 它不能回答：「这条路由是否真的不会越权？」                                    │
// └───────────────────────────────────────────────────────────────────────────┘
//
// 两条必须知道的局限（EVAL.md 第四节「难点」的落地，任务要求写进头注释）：
//
//   局限一（假阴性，脚本查不出）：
//     靠「读后比较」做归属校验的写法（EVAL 里的 C 类）无法用静态文本证明。
//     例如先 getArtworkById(id)、再 if (artwork.artist_id !== request.artist.id) 拒绝——
//     只要比较写在 handler 里，本脚本凭 artist_id 字样就判「看起来挂了」；
//     若比较写在被调用的 service 里、handler 只剩 service.update(id, body)，本脚本会判「没挂」→ 报红。
//     报红后人工核对若确认 service 已自带归属过滤，那是「人放行」，不是「脚本证明」。
//     更危险的方向：为了消红随手补一行 artist_id 注释或占位，本栏就永久失效。
//     所以：绿 = 没有漏挂显而易见的守卫，不等于归属校验成立。
//
//   局限二（假阳性，脚本会放过）：
//     handler 内联了 artist_id 但语义并不归属时同样命中判据——例如日志字段、返回体字段、
//     排序键、统计维度、写的其实是别的画师的列。所以「通过」只代表「看起来挂了」。
//     判定依据是文本命中，不是数据流分析，也不是类型系统。
//
//   —— 结论：本脚本封的是「将来新增路由时忘了 preHandler」这一种失效模式（EVAL 的 D 类写法），
//      也就是 R-1 立项时认定的真正风险面。它不覆盖 C 类写法、不覆盖 service 层越权、
//      不覆盖 SQL 语义错误。R-1 明确不做统一守卫层重构（不动那 161 处 artist_id 与 19 处内联过滤），
//      本栏与既有写法并存，只做增量拦截。
//
// ── 判据（保守、低误报）────────────────────────────────────────────────────
//   射程：server/src/features/**/*.routes.ts 中 fastify.get/post/put/patch/delete('路径', …) 的注册。
//   只查：路径含路径参数（:id 之类）且方法是 POST/PUT/PATCH/DELETE 的**写操作**。
//         GET 读操作不查（噪音大，且读越权不在本轮风险面内）。
//
//   判据 ①（常规归属）：下面两项同时成立才算「看起来挂了」
//       a) 认证：options 对象或 handler 文本里出现 requireAuth / requireAdmin / requireOwn*
//       b) 归属证据（任一）：
//            - options 里出现 requireOwn*（具名守卫，EVAL 的 A 类）
//            - handler 文本里出现 artist_id（EVAL 的 B 类内联 SQL 过滤）
//            - handler 文本里出现 request.artist.id（EVAL 的 C 类常见形态）
//       a / b 缺任一项 → 报红。
//   判据 ②（管理端）：路径以 /api/admin/ 开头 → 必须出现 requireAdmin。
//       管理端另有 step-up 二次认证兜底，但守卫漏挂仍报红。
//   判据 ③（公开端）：路径以 /api/public/ 开头 → 约定为公开端点，不要求归属守卫，
//       只登记不报红（--list 或摘要里列出，便于人工回看是否真该公开）。
//   判据 ③b（客户令牌端）：路径以 /api/orders/ 开头 → 客户侧端点，没有画师登录态，
//       归属靠「高熵订单令牌」建立（客户持有令牌即持有该单）。要求 handler 里出现以下
//       任一令牌/归属证据，否则报红：getClientOrderByToken / requireClientDeliveryAccess /
//       x-order-token / readClientToken / guardRateLimit 之外的 clientToken 语义。
//       这一条是本轮基线跑出来的第二类（见下）：它们不是漏挂守卫，而是**另一种归属模型**，
//       静态栏若不认，就会一直红着逼人去加 allowlist——那才是真正的防线腐蚀。
//       同理 /api/auth/ 前缀（凭据自助改名/删除）要求同前缀证据：requireAuth + 把 id 与
//       request.artist.id 一并交给 service（见判据 ①b 的「第二参数是请求方身份」）。
//
//   ★ 基线分类记录（2026-11-28 首跑，EVAL 要求「先分类再决定」）：
//     首跑 5 项红。逐条人工核对后：真漏挂 0 项，判据误报 5 项，全部按下面「改判据」处置，
//     没有加任何白名单（理由与该批分类详单见 AGENTS/r1-20261128/IMPL.md §基线分类）：
//       - compliance.routes.ts ×2：for-of 循环里用模板字符串拼路径注册，脚本报「无法解析」。
//         该循环体两条都挂了 preHandler: requireAdmin（人工核对 :425/:466），是解析口径不够，
//         故把「模板字符串路径 + 同文件循环内 options 出现 requireAdmin」判为已守卫，
//         其余无法解析形态继续报红。
//       - order-client.routes.ts ×3：客户侧令牌端点，本就没有画师登录态，归属由订单令牌建立
//         （requireDeliveryOrder → getClientOrderByToken → requireClientDeliveryAccess）。
//         故新增判据 ③b 认这套令牌证据，而不是给这三条路由开白名单。
//   判据 ④（解析不了就报红，不静默跳过）：注册形态无法静态解析时（路径不是字符串字面量、
//       handler 是文件外引用、实参括号不配对）→ 报「无法静态判定」，交人工确认。
//       宁可让人看一眼，也不让新写法绕过本栏。
//
//   刻意不做：不加任何文件/路由白名单。出红就二选一——补守卫，或改判据并写明理由。
//   靠 ALLOWLIST 续命的老路 check-file-size.mjs 已经吃过亏（见该文件 2026-09-12 批注），本栏不重蹈。

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.'
const LIST = process.argv.includes('--list')
const FEATURES_DIR = join(ROOT, 'server/src/features')
const BT = String.fromCharCode(96)

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete'])
// 解析不了也必须报出来的注册形态（判据 ④）
const UNPARSABLE_FORMS = [
  { re: /\bfastify\s*\.\s*route\s*\(/g, why: 'fastify.route( 对象式注册，本栏不覆盖' },
  { re: /\bfastify\s*\.\s*all\s*\(/g, why: 'fastify.all( 全方法注册，本栏不覆盖' }
]

const AUTH_RE = /\b(requireAuth|requireAdmin|requireOwn[A-Za-z]*)\b/
const OWN_NAMED_RE = /\brequireOwn[A-Za-z]*\b/
const ADMIN_RE = /\brequireAdmin\b/
const OWN_EVIDENCE = [
  { re: /\bartist_id\b/, label: 'artist_id' },
  { re: /request\s*\.\s*artist\s*\.\s*id\b/, label: 'request.artist.id' },
  // 判据 ①b 补充：把请求方身份作为参数交给 service（例如 updateCredentialName(id, request.artist.id, …)），
  // service 内以 artist_id 过滤。这是 B 类写法在画师端 handler 里的常见落点。
  { re: /,\s*request\s*\.\s*artist\s*\.\s*id\b/, label: 'request.artist.id 传入调用' }
]
// 判据 ③b：客户令牌归属模型（/api/orders/*）——没有画师登录态，归属由高熵订单令牌建立。
// 令牌来源（readClientToken 统一入口 / header / query / body 解构）与令牌校验（按令牌查单或
// requireClient* 守卫）**两者都要有**才算过；只有 token 字样没有校验，照样报红。
const CLIENT_TOKEN_SOURCES = [
  { re: /\breadClientToken\s*\(/, label: 'readClientToken()' },
  { re: /request\s*\.\s*(?:body|headers|query)[\s\S]{0,240}?\btoken\b/, label: '请求取的 token（body/header/query）' }
]
const CLIENT_TOKEN_CHECKS = [
  { re: /\bgetClientOrderByToken\s*\(/, label: 'getClientOrderByToken()' },
  { re: /\bgetClient[A-Za-z]*\s*\(/, label: 'getClient*（按令牌查单）' },
  { re: /\brequireClient[A-Za-z]*\s*\(/, label: 'requireClient*（令牌归属守卫）' },
  { re: /\brequireDelivery(?:Order|File)\s*\(/, label: 'requireDelivery*（令牌归属守卫）' }
]

/** 跳过字符串字面量，返回闭合后的下标；模板字符串的插值段按括号配对跳过 */
function skipString (src, i) {
  const quote = src[i]
  i += 1
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') { i += 2; continue }
    if (quote === BT && ch === '$' && src[i + 1] === '{') {
      let depth = 0
      i += 2
      while (i < src.length) {
        const c = src[i]
        if (c === '{') depth += 1
        else if (c === '}') { if (depth === 0) { i += 1; break } depth -= 1 }
        i += 1
      }
      continue
    }
    if (ch === quote) return i + 1
    i += 1
  }
  return i
}

/** 从指向 '(' 的下标起，按括号深度切分实参；字符串/注释内的逗号不算分隔 */
function splitArgs (src, openIdx) {
  const args = []
  let i = openIdx + 1
  let start = i
  let depth = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 2; continue }
    if (ch === "'" || ch === '"' || ch === BT) { i = skipString(src, i); continue }
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; i += 1; continue }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        if (ch === ')') {
          const tail = src.slice(start, i)
          if (tail.trim() !== '') args.push({ start, text: tail })
          return { args, end: i }
        }
        return null
      }
      depth -= 1
      i += 1
      continue
    }
    if (ch === ',' && depth === 0) {
      const text = src.slice(start, i)
      if (text.trim() !== '') args.push({ start, text })
      i += 1
      start = i
      continue
    }
    i += 1
  }
  return null
}

/**
 * 去注释但保留字符串内容（SQL 里的 artist_id 必须留下来）。
 * 注释字符替换成空格、换行原样保留 —— 这样剥离后下标与原文一一对应，
 * 报出来的「文件:行」才是真行号（早期版本直接拼接会整体前移，红单指错行）。
 */
function stripComments (src) {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      const end = nl === -1 ? src.length : nl
      for (let k = i; k < end; k += 1) out[k] = ' '
      i = end
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      const end = close === -1 ? src.length : close + 2
      for (let k = i; k < end; k += 1) if (out[k] !== '\n') out[k] = ' '
      i = end
      continue
    }
    if (ch === "'" || ch === '"' || ch === BT) { i = skipString(src, i); continue }
    i += 1
  }
  return out.join('')
}

function makeLineIndex (src) {
  const starts = [0]
  for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1)
  return (idx) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= idx) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

function sliceBalanced (src, braceIdx) {
  if (src[braceIdx] !== '{') return null
  let depth = 0
  let i = braceIdx
  while (i < src.length) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 2; continue }
    if (ch === "'" || ch === '"' || ch === BT) { i = skipString(src, i); continue }
    if (ch === '{') depth += 1
    else if (ch === '}') { depth -= 1; if (depth === 0) return src.slice(braceIdx, i + 1) }
    i += 1
  }
  return null
}

/** handler 是标识符时回查本文件的函数定义体 */
function resolveLocalRef (src, name) {
  const patterns = [
    new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'),
    new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*(?:async\\s*)?\\(?[^=]*\\)?\\s*=>\\s*\\{'),
    new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*(?:async\\s+)?function\\s*\\([^)]*\\)\\s*\\{')
  ]
  for (const re of patterns) {
    const m = re.exec(src)
    if (!m) continue
    const braceIdx = m.index + m[0].length - 1
    const body = sliceBalanced(src, braceIdx)
    if (body) return body
  }
  return null
}

/**
 * 把 handler 里直接调用、且定义在本文件内的函数体也并入上下文（最多两层）。
 * 只用于判据 ③b（客户令牌链）——令牌校验常被抽成同文件小函数
 * （如 requireDeliveryFile → requireDeliveryOrder → readClientToken）。
 * 判据 ①b 的归属证据**不做**这种扩张：一旦扩张，任何调用到含 artist_id 公共函数的
 * 写路由都会被判「看起来挂了」，那就把本栏的辨析力稀释没了。
 */
function expandLocalHelpers (src, handlerText, depth) {
  if (depth <= 0) return ''
  const called = new Set()
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g
  let m
  while ((m = callRe.exec(handlerText)) !== null) called.add(m[1])
  let extra = ''
  for (const name of called) {
    const body = resolveLocalRef(src, name)
    if (!body) continue
    extra += '\n' + body + expandLocalHelpers(src, body, depth - 1)
  }
  return extra
}

function walk (dir, out) {
  const acc = out || []
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, acc)
    else if (name.endsWith('.routes.ts')) acc.push(p)
  }
  return acc
}

const norm = (p) => p.split('\\').join('/')
// 模板字符串路径里的插值段在解析时被替换成 NUL 占位；输出时换成人能读的 ${…}
const showPath = (p) => p.split('\u0000').join('${…}')

function analyzeFile (file) {
  const rawText = readFileSync(file, 'utf8')
  const src = stripComments(rawText)
  const lineOf = makeLineIndex(rawText)
  const rel = norm(relative(ROOT, file))
  const found = []
  const unparsable = []

  for (const form of UNPARSABLE_FORMS) {
    form.re.lastIndex = 0
    let m
    while ((m = form.re.exec(src)) !== null) unparsable.push({ line: lineOf(m.index), rel, why: form.why })
  }

  const routeRe = /\bfastify\s*\.\s*(get|post|put|patch|delete)\s*\(/g
  let match
  while ((match = routeRe.exec(src)) !== null) {
    const method = match[1]
    const line = lineOf(match.index)
    const parsed = splitArgs(src, match.index + match[0].length - 1)
    if (!parsed) { unparsable.push({ line, rel, why: '实参括号不配对，无法切分' }); continue }
    const args = parsed.args
    if (args.length < 2) continue

    const rawPathArg = args[0].text.trim()
    const pathMatch = /^(['"])([\s\S]*)\1$/.exec(rawPathArg)
    const templateMatch = /^`([\s\S]*)`$/s.exec(rawPathArg)
    let routePath = null
    if (pathMatch) {
      routePath = pathMatch[2]
    } else if (templateMatch) {
      // 模板字符串路径（for-of 循环里拼前缀是既有写法，见 compliance.routes.ts）。
      // 只要插值之外的部分还能看出 /api/admin/ 或 :id 这类结构，就按结构判；
      // 判不出来（插值占满路径）仍报「无法解析」，不静默放过。
      const literal = templateMatch[1].replace(/\$\{[^}]*\}/g, '\u0000')
      routePath = literal
    } else {
      unparsable.push({ line, rel, why: '路径不是字符串/模板字面量：' + rawPathArg.slice(0, 40) })
      continue
    }
    const hasOptions = args.length >= 3
    const optionsText = hasOptions ? args[1].text : ''
    const handlerArg = args[args.length - 1].text
    let handlerText = handlerArg
    let handlerUnresolved = false
    const ident = /^[A-Za-z_$][\w$]*$/.exec(handlerArg.trim())
    if (ident) {
      const body = resolveLocalRef(src, ident[0])
      if (body) handlerText = body
      else { handlerText = ''; handlerUnresolved = true }
    }

    found.push({
      rel,
      line,
      method: method.toUpperCase(),
      path: routePath,
      isWrite: WRITE_METHODS.has(method),
      hasParam: /:\s*[A-Za-z_]/.test(routePath),
      optionsText,
      handlerText,
      handlerHelpers: expandLocalHelpers(src, handlerText, 2),
      handlerUnresolved
    })
  }
  return { found, unparsable }
}

function evaluate (route) {
  const scope = route.optionsText + '\n' + route.handlerText
  const hasAuth = AUTH_RE.test(scope)
  const hasNamedOwn = OWN_NAMED_RE.test(scope)
  const evidence = OWN_EVIDENCE.filter((e) => e.re.test(scope)).map((e) => e.label)
  // 判据 ③b 允许沿同文件小函数看一层令牌链，其余判据只看 handler 本体
  const tokenScope = scope + '\n' + (route.handlerHelpers || '')
  const tokenSources = CLIENT_TOKEN_SOURCES.filter((e) => e.re.test(tokenScope)).map((e) => e.label)
  const tokenChecks = CLIENT_TOKEN_CHECKS.filter((e) => e.re.test(tokenScope)).map((e) => e.label)
  const isAdmin = route.path.indexOf('/api/admin/') === 0
  const isPublic = route.path.indexOf('/api/public/') === 0
  const isClientOrder = route.path.indexOf('/api/orders/') === 0

  if (route.handlerUnresolved) {
    // 判据 ④：handler 是文件外引用，函数体看不到 → 不静默放过，交人工确认
    return { status: 'violation', missing: 'handler 是文件外引用，无法静态确认归属校验' }
  }
  if (isAdmin) {
    if (ADMIN_RE.test(scope)) return { status: 'pass', note: 'requireAdmin' }
    return { status: 'violation', missing: '管理端写操作缺 requireAdmin' }
  }
  if (isPublic) {
    return { status: 'public', note: hasAuth ? '公开前缀（另有认证）' : '公开前缀（无守卫，按约定放行）' }
  }
  if (isClientOrder) {
    const miss = []
    if (tokenSources.length === 0) miss.push('订单令牌来源（readClientToken|header|query|body.token）')
    if (tokenChecks.length === 0) miss.push('令牌校验（getClientOrderByToken|getClient*|requireClient*|requireDelivery*）')
    if (miss.length) return { status: 'violation', missing: '客户侧写操作缺 ' + miss.join(' + ') }
    return { status: 'pass', note: '客户令牌归属（' + tokenSources[0] + ' → ' + tokenChecks[0] + '）' }
  }
  const missing = []
  if (!hasAuth && !hasNamedOwn) missing.push('认证/守卫（requireAuth|requireAdmin|requireOwn*）')
  if (!hasNamedOwn && evidence.length === 0) missing.push('归属证据（requireOwn*|artist_id|request.artist.id）')
  if (missing.length) return { status: 'violation', missing: missing.join(' + ') }
  return { status: 'pass', note: hasNamedOwn ? 'requireOwn*' : evidence.join('/') }
}

const files = walk(FEATURES_DIR).sort()
if (files.length === 0) {
  console.error('🔴 未扫到任何 *.routes.ts —— 路径口径可能失效：' + norm(FEATURES_DIR))
  console.error('   本栏扫不到文件时必须报红，不能因为「没东西可查」而报绿。')
  process.exit(1)
}

const allRoutes = []
const unparsable = []
for (const f of files) {
  const res = analyzeFile(f)
  allRoutes.push(...res.found)
  unparsable.push(...res.unparsable)
}

const violations = []
const publicRoutes = []
let checkedWrite = 0
for (const r of allRoutes) {
  if (!r.isWrite || !r.hasParam) continue
  checkedWrite += 1
  const verdict = evaluate(r)
  if (verdict.status === 'violation') violations.push({ route: r, verdict })
  else if (verdict.status === 'public') publicRoutes.push({ route: r, verdict })
  else if (LIST) console.log('  ✅ ' + r.rel + ':' + r.line + '  ' + r.method + ' ' + showPath(r.path) + '  → ' + (verdict.note || ''))
}
for (const u of unparsable) {
  violations.push({ route: { rel: u.rel, line: u.line, method: '?', path: '(无法解析的注册)' }, verdict: { missing: u.why } })
}

violations.sort((a, b) => a.route.rel.localeCompare(b.route.rel) || a.route.line - b.route.line)
const summary = '扫描 ' + files.length + ' 个路由文件 / ' + allRoutes.length + ' 条注册 / 受检写路由 ' + checkedWrite +
  ' 条（其中公开前缀 ' + publicRoutes.length + ' 条）'

if (publicRoutes.length && LIST) {
  console.log('')
  console.log('ℹ️ 公开前缀写路由（/api/public/*，按约定不要求归属守卫，仅登记）：')
  for (const item of publicRoutes) console.log('  · ' + item.route.rel + ':' + item.route.line + '  ' + item.route.method + ' ' + showPath(item.route.path))
}

if (violations.length) {
  console.error('')
  console.error('🔴 路由归属守卫检查失败（' + violations.length + ' 项）—— 这是防腐栏，不是安全证明')
  for (const item of violations) {
    console.error('  ' + item.route.rel + ':' + item.route.line + '  ' + item.route.method + ' ' + showPath(item.route.path))
    console.error('      缺：' + item.verdict.missing)
  }
  console.error('')
  console.error('处置：给该路由补 preHandler（requireAuth + requireOwn*/requireAdmin），或在 handler 里做归属校验；')
  console.error('判据误报请改判据并写明理由——不要加白名单绕过。报绿也不等于安全（见头注释两条局限）。')
  console.error('统计：' + summary)
  process.exit(1)
}

console.log('✅ 路由归属守卫检查通过（防腐栏，非安全证明）')
console.log('   ' + summary + '，违反 0 项')
if (publicRoutes.length) console.log('   ℹ️ 公开前缀写路由 ' + publicRoutes.length + ' 条登记放行（加 --list 逐条列出）')
console.log('   局限提醒：C 类「读后比较」写法查不出；handler 里 artist_id 语义不同时会放过。')
