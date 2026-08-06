// audit-i18n-keydiff.mjs — 对照后端 errors.ts 全部错误码 vs 前端 locales errors.* 键（i18n 缺键审计）
// 用法：node audit-i18n-keydiff.mjs <项目根路径>
// 输出：后端有/前端缺的键（zh、en 分别列）+ 中英不对称键 + 含 {占位符} 的键
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'

const ROOT = process.argv[2] || '.'
const src = readFileSync(`${ROOT}/server/src/shared/errors.ts`, 'utf8')
// 提取 E 对象里的错误码（形如  KEY: 'KEY'  的行）
const codes = [...src.matchAll(/^\s{2,4}([A-Z][A-Z0-9_]+):\s*'\1',?$/gm)].map(m => m[1])
const codeSet = new Set(codes)

const zh = (await import(pathToFileURL(`${ROOT}/web/src/locales/zh-CN.js`))).default
const en = (await import(pathToFileURL(`${ROOT}/web/src/locales/en.js`))).default
const zhKeys = new Set(Object.keys(zh.errors || {}))
const enKeys = new Set(Object.keys(en.errors || {}))

const missingZh = codes.filter(c => !zhKeys.has(c))
const missingEn = codes.filter(c => !enKeys.has(c))
console.log(`后端错误码总数: ${codes.length}`)
console.log(`zh-CN errors 键数: ${zhKeys.size} | en errors 键数: ${enKeys.size}`)
console.log(`\n=== 后端有 / zh-CN 缺 (${missingZh.length}) ===`); missingZh.forEach(c => console.log('  ' + c))
console.log(`\n=== 后端有 / en 缺 (${missingEn.length}) ===`); missingEn.forEach(c => console.log('  ' + c))

const zhOnly = [...zhKeys].filter(k => !enKeys.has(k))
const enOnly = [...enKeys].filter(k => !zhKeys.has(k))
if (zhOnly.length || enOnly.length) {
  console.log('\n=== 中英不对称 ===')
  zhOnly.forEach(k => console.log('  仅 zh-CN: ' + k))
  enOnly.forEach(k => console.log('  仅 en: ' + k))
}

// 空值键 + 含 {占位符} 的键（前端 t() 需传参插值）
const emptyZh = [...zhKeys].filter(k => !String(zh.errors[k] || '').trim())
const emptyEn = [...enKeys].filter(k => !String(en.errors[k] || '').trim())
if (emptyZh.length) console.log(`\nzh-CN 空值键: ${emptyZh.join(', ')}`)
if (emptyEn.length) console.log(`en 空值键: ${emptyEn.join(', ')}`)
console.log('\n=== 含 {占位符} 的键（需前端传参插值）===')
for (const [name, obj] of [['zh-CN', zh], ['en', en]]) {
  for (const k of Object.keys(obj.errors || {})) {
    const vars = [...String(obj.errors[k]).matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1])
    if (vars.length) console.log(`  ${name} errors.${k} → {${vars.join(',')}}`)
  }
}
// 注意：本脚本比的是"后端码→前端键"；中英互相对齐是另一个轴（扁平化 diff），两结论不矛盾。
process.exit(missingZh.length === 0 && missingEn.length === 0 ? 0 : 1)
