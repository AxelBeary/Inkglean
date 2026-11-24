// 03C 防回归：E2E 定位器静态扫描（轻量，无第三方依赖）
// 目标：杜绝 strict-mode violation 复发（87aae3e/832a1aa 教训）
// 规则：
//   1. [ERROR] getByText(动态变量/模板) 未 scope——未来双布局/重复文本必然 strict
//   2. [WARN]  getByText('静态文本') 未 scope 且无豁免注释——人工确认过唯一的加 // locator-ok
//   3. [ERROR] getByRole('button', { name: 动态 }) 未 scope——动态名可能匹配多个元素，必 strict
// 运行：npm run check:e2e（= tsx e2e/scripts/check-locators.ts；CI e2e.yml 前置步骤跑同一命令）
// （F0061：旧指令 node check-locators.js 指向不存在的编译产物，与真实入口脱节）

import { readFileSync, readdirSync } from 'fs'
import { relative, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

// 豁免注释：行尾或行前有 // locator-ok 的行跳过
function isExempt(line: string): boolean {
  return /locator-ok/.test(line)
}

// 判定参数是动态（变量/模板/正则）还是静态字符串
function isDynamicArg(arg: string): boolean {
  const a = arg.trim()
  // 模板字符串 `xxx${yyy}`、变量、正则 /xxx/ 均视为动态
  if (a.startsWith('`') || a.startsWith('/') || a.startsWith('$')) return true
  if (a.startsWith("'") || a.startsWith('"')) {
    // F0058: 只认「首参是完整字面量、且其后要么为空、要么以逗号进入选项参」为静态；
    // '前缀' + 变量、'xx'.trim() 这类以字面量开头的拼接一律按动态——旧实现见首字符是引号就判静态，动态定位器漏报。
    // 首参截到闭引号为止，其后内容是「, { exact: true }」这类选项时不算动态。
    const quote = a.charAt(0)
    const close = a.indexOf(quote, 1)
    if (close === -1) return true // 引号未闭合（跨行拼接等）：保守按动态
    const after = a.slice(close + 1).trim()
    return after !== '' && !after.startsWith(',')
  }
  // 含表达式/函数调用
  if (/[\w$]\(/.test(a)) return true
  return true // 兜底：非纯字符串一律按动态
}

for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isExempt(line)) continue

    // 匹配 getByText(...) 调用；捕获「前缀 + 参数」
    // 前缀识别：page.getByText / drawer.getByText / row.getByText / locator(...).getByText 等
    const m = line.match(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\.getByText\(\s*(.+?)\s*\)/)
    if (m) {
      const prefix = m[1]
      const arg = m[2]
      // 真正的 scope 判断：page.getByText 是裸调用；其它（drawer./row./tbody 等）算已 scope
      // F0059: 裸页判定扩为 page / this.page / x.page / 以 Page 结尾的 fixture 页（artistPage、adminPage 等）
      // ——旧实现只认字面量 page，this.page 与页别名绕过全部两条规则
      const isBare = /[Pp]age$/.test(prefix)

      if (isDynamicArg(arg)) {
        if (isBare) {
          // 动态文本裸调用：高置信风险
          const p = line.trim().slice(0, 120)
          console.log(`[ERROR] ${display(file)}:${i + 1} 动态文本 getByText 未 scope（未来双布局/重复必 strict）`)
          console.log(`        ${p}`)
          errors++
        }
        // 已 scope 的动态文本：允许（E3/E4 模式）
      } else if (isBare) {
        // 静态文本裸调用：低置信，需人工确认（可加 // locator-ok 豁免）
        const p = line.trim().slice(0, 120)
        console.log(`[WARN]  ${display(file)}:${i + 1} 静态文本 getByText 裸调用——若页面出现重复文本会 strict；确认唯一可加 // locator-ok`)
        console.log(`        ${p}`)
        warnings++
      }
    }

    // 规则 3：getByRole(role, { name: 动态 }) 裸 page 调用——动态名字可能匹配多个
    // F0059 配套：选项捕获改为非贪婪到 `})`——旧 `[^}]*` 遇 `name: \`动${x}\`` 的插值花括号提前截断，模板名整行漏扫
    const rm = line.match(/\.getByRole\(\s*(['"`][^'"`]*['"`])\s*,\s*(\{.*?\})\s*\)/)
    if (rm) {
      const pre = line.slice(0, rm.index).trim()
      // F0059: 与规则 1/2 同口径——page / this.page / obj.page 属性链 / 以 Page 结尾的页对象都算裸调用
      const isBareRole = /(?:^|[^.\w$])[\w$]*(?:[\w$]+\.)?[Pp]age\s*$/.test(pre)
      const nameMatch = rm[2].match(/\bname\s*:\s*([^,}]+)/)
      if (isBareRole && nameMatch && isDynamicArg(nameMatch[1])) {
        const p = line.trim().slice(0, 120)
        console.log(`[ERROR] ${display(file)}:${i + 1} 动态 name 的 getByRole 未 scope（strict-mode 风险）`)
        console.log(`        ${p}`)
        errors++
      }
    }
  }
}

console.log(`\n扫描完成：${files.length} 个 spec，ERROR=${errors}，WARN=${warnings}`)
if (errors > 0) {
  console.error('存在 ERROR 级定位器风险——请按施工图加固（scope 到 tbody/卡片/组件）')
  process.exit(1)
}
