// i18n 空字符串审计（确定性方法，regex 的定案补充）
// 用法: node scan-empty-i18n.mjs <locale1.js> [locale2.js ...]
//   例: node scan-empty-i18n.mjs web/src/locales/zh-CN.js web/src/locales/en.js
// 原理: import() 每个 locale 模块，深度遍历所有叶子字符串（含数组元素），
//       报 trim() === '' 的完整 path。exit code: 0=无发现, 1=有发现（可作门禁）。
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('用法: node scan-empty-i18n.mjs <locale1.js> [locale2.js ...]')
  process.exit(2)
}

let total = 0
for (const f of files) {
  const mod = await import(pathToFileURL(resolve(f)).href)
  const obj = mod.default
  const empties = []
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k
      if (typeof v === 'string') {
        if (v.trim() === '') empties.push({ path: p, raw: JSON.stringify(v) })
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (typeof item === 'string' && item.trim() === '') empties.push({ path: `${p}[${i}]`, raw: JSON.stringify(item) })
          else if (item && typeof item === 'object') walk(item, `${p}[${i}]`)
        })
      } else if (v && typeof v === 'object') {
        walk(v, p)
      }
    }
  }
  walk(obj, '')
  console.log(`${f}: ${empties.length} 处空/空白字符串`)
  for (const e of empties) console.log(`  ${e.path} = ${e.raw}`)
  total += empties.length
}
console.log(`--- 共 ${total} 处 ---`)
process.exit(total > 0 ? 1 : 0)
