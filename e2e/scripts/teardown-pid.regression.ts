// PR114 MINOR-7 定向回归（无浏览器/无 vitest，tsx 直接跑）：
//   Windows（无 /proc）下 PID 复用防护不得空转——核不到命令行就必须返回 false，
//   绝不能像旧实现那样 `if (!existsSync('/proc')) return true` 仅凭存活就 SIGKILL。
// 运行：npx tsx e2e/scripts/teardown-pid.regression.ts
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { looksLikeE2eServer } from '../global-teardown.js'

let failed = 0
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = Object.is(actual, expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(actual)}${ok ? '' : ` (期望 ${JSON.stringify(expected)})`}`)
  if (!ok) failed++
}

const E2E_CMD = 'C:\\node.exe C:\\repo\\server\\node_modules\\tsx\\dist\\cli.mjs src/index.ts'
const UNRELATED_CMD = 'C:\\Program Files\\SomeApp\\app.exe'

// ── 核身成功：命令行含 tsx + src/index.ts ──
check('E2E 服务器命令行 → true', looksLikeE2eServer(1234, () => E2E_CMD), true)
check('Linux /proc 形态（NUL 分隔已转空格）→ true',
  looksLikeE2eServer(1234, () => 'node /repo/server/node_modules/tsx/dist/cli.mjs src/index.ts'), true)

// ── PR114 MINOR-7 核心：无 /proc 且无法核身时不得仅凭存活放行 ──
check('无 /proc 且 CIM 查不到（null）→ false（旧实现误返 true）', looksLikeE2eServer(1234, () => null), false)
check('无关进程命令行 → false（PID 复用不误杀）', looksLikeE2eServer(1234, () => UNRELATED_CMD), false)
check('读取抛错 → false（保守）', looksLikeE2eServer(1234, () => { throw new Error('CIM unavailable') }), false)
check('只有 tsx 没有 src/index.ts → false', looksLikeE2eServer(1234, () => 'node tsx some-other.js'), false)

// ── 源码级防回退：旧的无 /proc 直通分支不得回来 ──
const here = dirname(fileURLToPath(import.meta.url))
const teardownSrc = readFileSync(resolve(here, '../global-teardown.ts'), 'utf8')
// 剥注释再查——文件头注释本身会引用旧实现形态，不应触发防回退断言
const executableSrc = teardownSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('//'))
  .join('\n')
check('源码不再有 !existsSync("/proc") 直接 return true',
  /!\s*existsSync\(['"]\/proc['"]\)\s*\)\s*return\s+true/.test(executableSrc), false)
check('Windows 走 Get-CimInstance 核身', executableSrc.includes('Get-CimInstance Win32_Process'), true)

console.log(`\n回归样例（teardown PID 核身）：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
if (failed > 0) process.exit(1)
