#!/usr/bin/env node
// check-changelog-size.mjs — changelog 活档体积防阀（v1，2026-09-27 A+B+D 拍板批，accept 第 19 道）
//
// 目的：docs/changelog.md 是逐批顶插的工程台账，只增不减会 re-膨胀成第二个「搬前 134KB」。
//       本闸门把「滚动分册」触发点变成机械判据：撞线即红，处置唯一 = 按 STATUS 惯例把
//       oldest 段整段搬 docs/changelog-archive/ 新卷（逐行哈希零丢失）；**禁止调高阈值续命**
//       （同 check-file-size 的 F-44 纪律）。
//
// 规则：
//   1. 活档整体 ≤ 40KB（UTF-8 字节）且 ≤ 450 行（含空行，node 口径——勿用 Measure-Object 对比）；
//   2. 单个 H2 段 ≤ 4KB 字节——**只判本次变更新增/改动的段**（沿 check-file-size 的 F-44
//      「存量冻结、禁调高阈值续命」与 check-status-line 增量口径）：段内容在 HEAD 基线中
//      逐字存在即存量豁免；新建/改动过大段即红（该段自身拆分信号，参照 food-menu 先例）；
//   3. 归档卷 docs/changelog-archive/ 豁免体积检查（本脚本只管活档；历史卷可以大）。
//
// 用法：
//   node scripts/check-changelog-size.mjs                    # 默认活档
//   node scripts/check-changelog-size.mjs --path <file>      # 自测/特殊场景指定文件（全量判段，无基线豁免）
// 退出码：0 = 通过；1 = 超限；2 = 环境错误（文件不存在）

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
function getFlag(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : ''
}
const KB_LIMIT = parseInt(getFlag('--kb') || '40', 10)
const LINE_LIMIT = parseInt(getFlag('--lines') || '450', 10)
const SECTION_LIMIT = parseInt(getFlag('--section-kb') || '4', 10) * 1024
const FILE = getFlag('--path') || 'docs/changelog.md'

if (!existsSync(FILE)) {
  console.error(`[changelog-size] ❌ 找不到文件：${FILE}`)
  process.exit(2)
}

const buf = Buffer.from(readFileSync(FILE, 'utf8'), 'utf8')
const lines = buf.toString('utf8').replaceAll('\r', '').split('\n')
const violations = []

if (buf.length > KB_LIMIT * 1024) violations.push(`${FILE} 体积 ${buf.length} B > ${KB_LIMIT} KB——按纪律滚动分册：oldest 段整段搬 docs/changelog-archive/ 新卷（逐行哈希零丢失），禁调高本阈值`)
if (lines.length > LINE_LIMIT) violations.push(`${FILE} 行数 ${lines.length} > ${LINE_LIMIT}——处置同上`)

// 单 H2 段体积：从每个 ^## 行到下一个 ^## 或文件尾。
// 存量豁免：HEAD 基线中逐字存在同内容段（join('\n') 哈希）→ 不报；新建/改动段过大即红。
const h2idx = lines.reduce((acc, l, i) => { if (/^## /.test(l)) acc.push(i); return acc }, [])
let baselineSectionHashes = null
if (!getFlag('--path')) {
  try {
    const baseRaw = execFileSync('git', ['show', `HEAD:${FILE}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replaceAll('\r', '')
    const baseLines = baseRaw.split('\n')
    const baseIdx = baseLines.reduce((acc, l, i) => { if (/^## /.test(l)) acc.push(i); return acc }, [])
    baselineSectionHashes = new Set()
    for (let k = 0; k < baseIdx.length; k++) {
      const s = baseIdx[k], e = k + 1 < baseIdx.length ? baseIdx[k + 1] : baseLines.length
      baselineSectionHashes.add(baseLines.slice(s, e).join('\n'))
    }
  } catch { baselineSectionHashes = null } // HEAD 无此文件（首次入库批）→ 全量判
}
for (let k = 0; k < h2idx.length; k++) {
  const start = h2idx[k]
  const end = k + 1 < h2idx.length ? h2idx[k + 1] : lines.length
  const sectionText = lines.slice(start, end).join('\n')
  const section = Buffer.from(sectionText, 'utf8')
  const isExisting = baselineSectionHashes && baselineSectionHashes.has(sectionText)
  if (section.length > SECTION_LIMIT && !isExisting) {
    violations.push(`${FILE} 段「${lines[start].slice(0, 40)}」体积 ${section.length} B > ${SECTION_LIMIT / 1024} KB——新建/改动段过大，落档前先精简或拆分该批次条目`)
  }
}

console.log(`[changelog-size] 活档 ${FILE}：${buf.length} B / ${lines.length} 行 / H2 段 ${h2idx.length} 个（阈值 ${KB_LIMIT} KB、${LINE_LIMIT} 行、新增/改动单段 ${SECTION_LIMIT / 1024} KB${baselineSectionHashes ? '，存量段豁免已启用' : ''}）`)
if (violations.length) {
  console.error(`\n🔴 changelog 体积防阀失败（${violations.length} 项）：`)
  violations.forEach(v => console.error('  ' + v))
  process.exit(1)
}
console.log('[changelog-size] ✅ changelog 活档体积防阀通过')
