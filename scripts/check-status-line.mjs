#!/usr/bin/env node
// check-status-line.mjs — STATUS 单行长度防阀（v1，2026-09-20，better-harness 修复批，用户裁决选项①）
//
// 目的：把 AGENTS.md「STATUS 体例与归档纪律」第 2 条（单行不超 200 字）落成机械检查。
//       此前该条只是人工约定无防线，超长行会让 ripgrep 漏报、diff 不可读、精确替换易错。
//
// 规则：
//   1. 默认扫描 docs/comms/STATUS.md 与 desktop/docs/STATUS.md；
//   2. 只校验「本次变更涉及的新增/修改行」——用 git diff 解析新增行，存量超长行不报错；
//   3. 新增行字符数（Unicode 码点）> 200 即标红，exit 1。
//
// 基线口径（对齐 check-test-tamper 的场景策略，见 accept.ps1 v3 注释）：
//   - 分支验收：--base master（默认），取 master...HEAD 已提交 diff；
//   - master 自检且 HEAD == base（提交前跑）：已提交面恒空 → 改取工作区 diff（git diff <base>），
//     让防阀对未提交改动做实质判读；
//   - 归档搬动（G8 类纯文本搬运批）属高风险单独一批，本闸门的存量豁免正好放行搬入的旧长行
//     ——若需对存量也体检，用 --all 显式切换。
//
// 用法：
//   node scripts/check-status-line.mjs                       # 默认 base=master，两个 STATUS 文件
//   node scripts/check-status-line.mjs --base HEAD~1         # master 自检场景（已提交视角）
//   node scripts/check-status-line.mjs --all                 # 全文件体检（含存量，会报历史长行）
//   node scripts/check-status-line.mjs docs/comms/STATUS.md  # 显式指定文件
//
// 退出码：0 = 无违规；1 = 存在变更超长行（须拆短后重新落档）；2 = 环境错误

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
function getFlag(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : ''
}
const LIMIT = parseInt(getFlag('--limit') || '200', 10)
const checkAll = args.includes('--all')
const base = getFlag('--base') || 'master'
const VALUE_FLAGS = new Set(['--base', '--limit'])
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]))
const FILES = positional.length ? positional : ['docs/comms/STATUS.md', 'desktop/docs/STATUS.md']

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' })
}

let resolvedBase
try {
  resolvedBase = git('rev-parse', '--verify', '--quiet', `${base}^{commit}`).trim()
} catch {
  console.error(`[status-line] ❌ 找不到基线引用 "${base}"（--base 可指定其他引用）`)
  process.exit(2)
}

// 场景策略：HEAD 与 base 同一提交时（master 自检/提交前跑），master...HEAD 恒空，
// 改取工作区未提交 diff，防阀不空转（ledger_R4 §4.4 教训的同一治法）。
let headSha = ''
try { headSha = git('rev-parse', 'HEAD').trim() } catch { /* 空仓库 */ }
const useWorktreeDiff = headSha === resolvedBase

// 解析 diff 中每个文件的新增行内容（路径相对仓库根）
function addedLinesFromDiff(file) {
  const diffArgs = useWorktreeDiff
    ? ['diff', '--unified=0', '--no-color', base, '--', file]
    : ['diff', '--unified=0', '--no-color', `${base}...HEAD`, '--', file]
  return git(...diffArgs)
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.slice(1))
}

// 兜底：diff 拿不到内容时（如文件未跟踪），按 --all 口径处理该文件
function fullFileLines(file) {
  return readFileSync(file, 'utf8').replaceAll('\r', '').split('\n')
}

const violations = []
let checked = 0

for (const file of FILES) {
  if (!existsSync(file)) {
    console.log(`[status-line] ⚠️ 跳过不存在的文件：${file}`)
    continue
  }
  let lines
  if (checkAll) {
    lines = fullFileLines(file)
  } else {
    lines = addedLinesFromDiff(file)
    if (lines.length === 0 && !git('ls-files', '--', file).trim()) {
      // 未跟踪新文件：无 diff 可比，全文按新规体检
      lines = fullFileLines(file)
    }
  }
  lines.forEach((line, idx) => {
    const len = Array.from(line).length
    if (len > LIMIT) {
      // --all 口径给真实行号；增量口径只给序号（新增行在原文件的行号无读者意义）
      const loc = checkAll ? `第 ${idx + 1} 行` : `新增第 ${idx + 1} 段`
      violations.push(`${file} ${loc}：${len} 字符 > ${LIMIT}（${line.slice(0, 40)}…）`)
    }
  })
  checked += lines.length
}

console.log(`[status-line] 基线 ${base}${useWorktreeDiff && !checkAll ? '（HEAD==base，改取工作区未提交 diff）' : ''}，校验 ${checked} 行（${checkAll ? '全文件' : '仅本次变更新增行'}），上限 ${LIMIT} 字符`)

if (violations.length) {
  console.error(`\n🔴 STATUS 单行长度防阀失败（${violations.length} 项）：`)
  violations.forEach(v => console.error('  ' + v))
  console.error('\n处置：按 AGENTS.md 体例第 2 条拆成「短标题行 + `- ` 分组要点」，禁止把整批结论塞进一个长行。')
  process.exit(1)
}
console.log('[status-line] ✅ STATUS 单行长度防阀通过')
