// SCR-04/05 定向回归样例（无浏览器/无 vitest，tsx 直接跑）：
//   npm run check:e2e 之外的词法层回归——验证「仅注释豁免」与「转义闭引号」修复，
//   防止 check:e2e 门禁再次出现假阴性（漏报）或假红（误报）。
// 运行：npx tsx e2e/scripts/check-locators.regression.ts
import { analyzeLine, findClosingQuote, hasLocatorOkComment, isDynamicArg } from './locator-lex.js'

let failed = 0
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(actual)}${ok ? '' : ` (期望 ${JSON.stringify(expected)})`}`)
  if (!ok) failed++
}

// ── SCR-04：只有真注释里的 locator-ok 才算豁免 ──
check('行尾 // 注释豁免', hasLocatorOkComment("page.getByText('提交') // locator-ok"), true)
check('块注释 /* */ 豁免', hasLocatorOkComment("/* locator-ok */ page.getByText('提交')"), true)
check('注释含 locator-ok 且行内有字面量', hasLocatorOkComment("page.getByText('提交') // locator-ok 人工确认"), true)
check('字符串字面量不豁免', hasLocatorOkComment("page.getByText('locator-ok 状态提示')"), false)
check('字符串内的 // 不是注释', hasLocatorOkComment("page.getByText('http://locator-ok/x')"), false)
check('转义引号后仍有 // 在字面量内', hasLocatorOkComment("page.getByText('don\\'t // locator-ok')"), false)
check('无 locator-ok 的行不豁免', hasLocatorOkComment("page.getByText('提交')"), false)

// ── SCR-05：闭引号查找跳过反斜杠转义 ──
const escaped = "'don\\'t stop'"
check('findClosingQuote 跳过转义引号', findClosingQuote(escaped, 1, "'"), escaped.length - 1)
check('转义引号字面量判为静态', isDynamicArg(escaped), false)
check('普通静态字面量', isDynamicArg("'提交'"), false)
check('静态字面量 + 选项参', isDynamicArg("'提交', { exact: true }"), false)
check('双引号静态字面量', isDynamicArg('"提交"'), false)
check('字面量拼接变量判为动态', isDynamicArg("'前缀' + name"), true)
check('字面量方法调用判为动态', isDynamicArg("'xx'.trim()"), true)
check('模板串判为动态', isDynamicArg('`${name}`'), true)
check('未闭合引号保守判为动态', isDynamicArg("'abc"), true)

// ── 规则层回归：含 locator-ok 文案的静态字面量不再被整行跳过（仍报 WARN）──
const warnLine = "await expect(page.getByText('locator-ok 状态提示')).toBeVisible()"
const warnIssues = analyzeLine(warnLine, 1)
check('字面量含 locator-ok 的裸调用被扫描到', warnIssues.length, 1)
check('该问题是 WARN 级', warnIssues[0]?.level, 'warn')

// ── 规则层回归：转义引号静态文本不再被误判动态而报 ERROR ──
const staticLine = `await expect(page.getByText(${escaped})).toBeVisible()`
const staticIssues = analyzeLine(staticLine, 2)
check('转义引号静态文本不被判 ERROR', staticIssues.filter(x => x.level === 'error').length, 0)
check('转义引号静态文本仍报 WARN', staticIssues.filter(x => x.level === 'warn').length, 1)

// ── 真注释豁免在规则层生效 ──
check('真注释行被 isExempt 语义跳过（规则层无 issue 由调用方保证）',
  hasLocatorOkComment("await expect(page.getByText('提交')).toBeVisible() // locator-ok"), true)

console.log(`\n回归样例：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
if (failed > 0) process.exit(1)
