#!/usr/bin/env node
// check-test-tamper.mjs — 测试同改标红闸门（v1，2026-08-19）
//
// 目的：防「测试凑绿」——业务代码与测试文件在同一次改动里一起变时，
//       强制验收人给出裁决理由（--ack-reason），不允许默默通过。
// 背景：外部评判命中本项目真实风险类别（历史实案：本地验收脚本正则漏检
//       吞掉 7 例 CI 报错；AI 改业务逻辑后顺势改测试断言凑绿）。
//       accept.ps1 的基线「用例数只增不减」防的是整条删测试；
//       本闸门补的是另一半：**改**测试——用例数不减，断言却被改软。
//
// 判定口径（git diff --name-only <base>...HEAD）：
//   - 测试文件：server/tests/**、e2e/tests/**、web 下 *.test.* / *.spec.*
//   - 业务文件：server/src/** 与 web/src/** 中的非测试文件
//   - 两者同时出现 = 标红，须 --ack-reason 显式裁决
//   - 只改测试不动业务：不阻塞，黄色提醒人工复核（防测试被单独改软）
//
// 用法：
//   node scripts/check-test-tamper.mjs                      # 默认 base=master
//   node scripts/check-test-tamper.mjs --base origin/master
//   node scripts/check-test-tamper.mjs --ack-reason "v129 计数器下架，断言随下架事实更新"
//
// 退出码：0 = 无标红或已 ack；1 = 标红且未 ack（须一号裁决）；2 = 环境错误

import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
function getFlag(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : ''
}
const base = getFlag('--base') || 'master'
const ackReason = getFlag('--ack-reason').trim()

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
}

let resolvedBase
try {
  resolvedBase = git('rev-parse', '--verify', '--quiet', `${base}^{commit}`)
} catch {
  console.error(`[test-tamper] ❌ 找不到基线引用 "${base}"（--base 可指定其他引用）`)
  process.exit(2)
}

const changed = git('diff', '--name-only', `${base}...HEAD`)
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean)

const isTestFile = p =>
  p.startsWith('server/tests/') ||
  p.startsWith('e2e/tests/') ||
  (p.startsWith('web/') && /\.(test|spec)\.[a-z]+$/.test(p))

const isSrcRoot = p => p.startsWith('server/src/') || p.startsWith('web/src/')

const testFiles = changed.filter(isTestFile)
const bizFiles = changed.filter(p => isSrcRoot(p) && !isTestFile(p))

console.log(`[test-tamper] 基线 ${base}（${resolvedBase.slice(0, 7)}）→ HEAD，共 ${changed.length} 个变更文件`)

if (changed.length === 0) {
  console.log('[test-tamper] ✅ 无改动，放行')
  process.exit(0)
}

if (bizFiles.length === 0) {
  if (testFiles.length > 0) {
    console.log(`[test-tamper] ⚠️ 仅测试文件变更（${testFiles.length} 个），未阻塞——人工复核断言是否被改软：`)
    for (const f of testFiles) console.log(`  - ${f}`)
  } else {
    console.log('[test-tamper] ✅ 未触碰测试与业务源码，放行')
  }
  process.exit(0)
}

if (testFiles.length === 0) {
  console.log(`[test-tamper] ✅ 仅业务代码变更（${bizFiles.length} 个），测试未动，放行`)
  process.exit(0)
}

// 业务 + 测试同改 = 标红区
console.log(`[test-tamper] 🔴 业务代码（${bizFiles.length} 个）与测试（${testFiles.length} 个）同时变更：`)
console.log('  业务：')
for (const f of bizFiles.slice(0, 30)) console.log(`    - ${f}`)
if (bizFiles.length > 30) console.log(`    …（另 ${bizFiles.length - 30} 个）`)
console.log('  测试：')
for (const f of testFiles.slice(0, 30)) console.log(`    - ${f}`)
if (testFiles.length > 30) console.log(`    …（另 ${testFiles.length - 30} 个）`)

if (!ackReason) {
  console.error('[test-tamper] ❌ 未给出裁决理由，闸门失败。')
  console.error('  复核要点：测试是跟随【有意的行为变更】更新，还是在迎合新行为把断言改软？')
  console.error('  确认为前者后重跑并带理由：--ack-reason "<理由，须落入验收报告>"')
  process.exit(1)
}

console.log(`[test-tamper] ✅ 已给出裁决理由，放行：${ackReason}`)
process.exit(0)
