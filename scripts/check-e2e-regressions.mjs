#!/usr/bin/env node
/**
 * check-e2e-regressions.mjs —— E2E 基建定向回归总入口（#98）
 *
 * 背景：e2e/scripts/*.regression.ts 这批定向回归由 F0050/F0051/TASK2-02/03/MINOR-6/7 等修复批引入，
 * 每个文件都自带断言与退出码，但**此前没有任何门禁或 CI 执行它们**——
 * 写了、能跑、全过，却永远不会自动跑，等于没有防线（"测试存在但没有消费方"）。
 *
 * 本入口把它们收成一个命令，供两处消费：
 *   - CI：.github/workflows/e2e.yml 的 e2e job（与 check:e2e 并列）
 *   - 本地：accept.ps1 的 e2e 道
 * 单一事实源，避免两处各写一份文件清单后漂移（同 ORDER_QUEUE_COLUMNS 的教训）。
 *
 * 为什么用 bash 起子进程而不是动态 import：各 regression 文件是**自执行脚本**（模块顶层跑断言、
 * 失败直接 process.exit），import 会在同一进程内叠加退出码与全局状态，无法逐个隔离判定。
 *
 * 退出码：0 = 全部通过；1 = 有回归失败；2 = 环境错误（tsx 不可用等）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'e2e', 'scripts')

/**
 * 显式登记要跑的回归文件（**新增 regression 必须登记在此**，否则不会被门禁覆盖）。
 * 用显式清单而非 readdir 通配：避免将来某个 .regression.ts 尚未稳定就意外卡红门禁。
 */
const CASES = [
  { file: 'teardown-pid.regression.ts', label: 'teardown PID 核身（MINOR-7）' },
  { file: 'token-refresh.regression.ts', label: '令牌刷新（TASK2-03 / MINOR-5）' },
  { file: 'build-freshness.regression.ts', label: '构建新鲜度（TASK2-02）' },
  { file: 'check-locators.regression.ts', label: '定位器词法（MINOR-6）' }
]

// 守卫：登记了但文件不存在 → 环境错误（防止改名后静默跳过）
const missing = CASES.filter(c => !existsSync(join(DIR, c.file)))
if (missing.length > 0) {
  console.error(`[e2e-regressions] ❌ 清单里的回归文件不存在：${missing.map(m => m.file).join(', ')}`)
  process.exit(2)
}

// 守卫：目录里有 .regression.ts 却没登记 → 提示（不失败，避免旧分支历史文件卡门禁）
const onDisk = readdirSync(DIR).filter(f => f.endsWith('.regression.ts'))
const unregistered = onDisk.filter(f => !CASES.some(c => c.file === f))
if (unregistered.length > 0) {
  console.warn(`[e2e-regressions] ⚠️  以下回归文件未登记、本次不会执行：${unregistered.join(', ')}`)
}

let failed = 0
for (const c of CASES) {
  process.stdout.write(`▶ ${c.label} ... `)
  try {
    // Windows 下 npx 是 .cmd，需经 shell；用 cmd 显式调用并转义参数，避免
    // "args + shell:true 未转义"（DEP0190）的安全提示，同时保持参数不被二次解释。
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'cmd' : 'npx'
    const args = isWin
      ? ['/d', '/s', '/c', 'npx', 'tsx', join('e2e', 'scripts', c.file)]
      : ['tsx', join('e2e', 'scripts', c.file)]
    execFileSync(cmd, args, {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 120_000,
      encoding: 'utf8',
      windowsVerbatimArguments: isWin
    })
    console.log('✅')
  } catch (err) {
    failed++
    console.log('❌')
    const e = err
    // 失败必须可诊断：把子进程输出原样带出来，不只报一句 failed
    if (e.stdout) console.error(e.stdout.trimEnd())
    if (e.stderr) console.error(e.stderr.trimEnd())
    if (!e.stdout && !e.stderr) console.error(e.message)
  }
}

console.log(`\n[e2e-regressions] ${CASES.length - failed}/${CASES.length} 通过`)
if (failed > 0) {
  console.error('[e2e-regressions] ❌ 存在失败的定向回归——见上方输出')
  process.exit(1)
}
