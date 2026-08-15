// 03C 防回归：E2E 定位器静态扫描（轻量，无第三方依赖）
// 目标：杜绝 strict-mode violation 复发（87aae3e/832a1aa 教训）
// 规则：
//   1. [ERROR] getByText(动态变量/模板) 未 scope——未来双布局/重复文本必然 strict
//   2. [WARN]  getByText('静态文本') 未 scope 且无豁免注释——人工确认过唯一的加 // locator-ok
//   3. [TODO]  getByRole('button', { name: 动态 }) 未 scope——本脚本暂未实现扫描，列为待办
// 运行：node e2e/scripts/check-locators.js（在 CI e2e.yml 前置步骤跑）

import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const testsDir = resolve(here, '../tests')
const files = readdirSync(testsDir).filter(f => f.endsWith('.spec.js'))

let errors = 0
let warnings = 0

// 豁免注释：行尾或行前有 // locator-ok 的行跳过
function isExempt(line) {
  return /locator-ok/.test(line)
}

// 判定参数是动态（变量/模板/正则）还是静态字符串
function isDynamicArg(arg) {
  const a = arg.trim()
  // 模板字符串 `xxx${yyy}`、变量、正则 /xxx/ 均视为动态
  if (a.startsWith('`') || a.startsWith('/') || a.startsWith('$')) return true
  if (a.startsWith("'") || a.startsWith('"')) return false
  // 含表达式/函数调用
  if (/[\w$]\(/.test(a)) return true
  return true // 兜底：非纯字符串一律按动态
}

for (const file of files) {
  const text = readFileSync(resolve(testsDir, file), 'utf8').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isExempt(line)) continue

    // 匹配 getByText(...) 调用；捕获「前缀 + 参数」
    // 前缀识别：page.getByText / drawer.getByText / row.getByText / locator(...).getByText 等
    const m = line.match(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\.getByText\(\s*(.+?)\s*\)/)
    if (!m) continue
    const prefix = m[1]
    const arg = m[2]
    const scoped = !/^page$/.test(prefix) && prefix !== 'page' && !prefix.endsWith('page')
    // 真正的 scope 判断：page.getByText 是裸调用；其它（drawer./row./tbody 等）算已 scope
    const isBare = prefix === 'page'

    if (isDynamicArg(arg)) {
      if (isBare) {
        // 动态文本裸调用：高置信风险
        const p = line.trim().slice(0, 120)
        console.log(`[ERROR] ${file}:${i + 1} 动态文本 getByText 未 scope（未来双布局/重复必 strict）`)
        console.log(`        ${p}`)
        errors++
      }
      // 已 scope 的动态文本：允许（E3/E4 模式）
    } else {
      if (isBare) {
        // 静态文本裸调用：低置信，需人工确认（可加 // locator-ok 豁免）
        const p = line.trim().slice(0, 120)
        console.log(`[WARN]  ${file}:${i + 1} 静态文本 getByText 裸调用——若页面出现重复文本会 strict；确认唯一可加 // locator-ok`)
        console.log(`        ${p}`)
        warnings++
      }
    }
  }
}

console.log(`\n扫描完成：${files.length} 个 spec，ERROR=${errors}，WARN=${warnings}`)
if (errors > 0) {
  console.error('存在 ERROR 级定位器风险——请按施工图加固（scope 到 tbody/卡片/组件）')
  process.exit(1)
}
