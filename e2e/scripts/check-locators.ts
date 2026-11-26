// 03C 防回归：E2E 定位器静态扫描（轻量，无第三方依赖）
// 目标：杜绝 strict-mode violation 复发（87aae3e/832a1aa 教训）
// 规则：
//   1. [ERROR] getByText(动态变量/模板) 未 scope——未来双布局/重复文本必然 strict
//   2. [WARN]  getByText('静态文本') 未 scope 且无豁免注释——人工确认过唯一的加 // locator-ok
//   3. [ERROR] getByRole('button', { name: 动态 }) 未 scope——动态名可能匹配多个元素，必 strict
// 运行：npm run check:e2e（= tsx e2e/scripts/check-locators.ts；CI e2e.yml 前置步骤跑同一命令）
// （F0061：旧指令 node check-locators.js 指向不存在的编译产物，与真实入口脱节）
// SCR-04/05：词法与规则判定已抽到 locator-lex.ts（可单测），本文件只负责遍历/输出/退出码。

import { readFileSync, readdirSync } from 'fs'
import { relative, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { analyzeLine, hasLocatorOkComment } from './locator-lex.js'

const here = dirname(fileURLToPath(import.meta.url))
const testsDir = resolve(here, '../tests')

// F0060: 递归收集全部 spec——旧实现只扫顶层，子目录 spec 会静默漏扫
function collectSpecFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...collectSpecFiles(resolve(dir, entry.name)))
    } else if (entry.name.endsWith('.spec.ts')) {
      out.push(resolve(dir, entry.name))
    }
  }
  return out
}

const files = collectSpecFiles(testsDir)

// 展示路径取相对 tests/ 的形式：顶层 spec 与旧输出一致，子目录 spec 带前缀可定位
const display = (f: string): string => relative(testsDir, f)

let errors = 0
let warnings = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // SCR-04：仅真注释中的 locator-ok 才豁免（字符串字面量里的同名文案不再误豁免）
    if (hasLocatorOkComment(line)) continue

    for (const issue of analyzeLine(line, i + 1)) {
      const tag = issue.level === 'error' ? '[ERROR]' : '[WARN] '
      console.log(`${tag} ${display(file)}:${issue.line} ${issue.message}`)
      console.log(`        ${issue.text}`)
      if (issue.level === 'error') errors++
      else warnings++
    }
  }
}

console.log(`\n扫描完成：${files.length} 个 spec，ERROR=${errors}，WARN=${warnings}`)
if (errors > 0) {
  console.error('存在 ERROR 级定位器风险——请按施工图加固（scope 到 tbody/卡片/组件）')
  process.exit(1)
}
