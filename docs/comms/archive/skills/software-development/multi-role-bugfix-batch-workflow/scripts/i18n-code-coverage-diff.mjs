// i18n-code-coverage-diff.mjs — 后端错误码 → 前端 locales errors.* 键覆盖对照（跑完即删）
// 用法：改 ROOT 后 node tmp-keydiff.mjs；exit 0 = 全覆盖，1 = 有缺口
// 注意：此脚本比较的是【后端错误码 → 前端键】轴；zh-CN↔en 互对齐是另一个轴，两者独立
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'

const ROOT = 'D:/Hermes Agent CN Desktop/workspace/artist-commission' // ← 按实际仓库改（worktree 同理）

// 1. 从 errors.ts 提取 E 对象全部错误码（形如 KEY: 'KEY'）
const src = readFileSync(`${ROOT}/server/src/shared/errors.ts`, 'utf8')
const codes = [...src.matchAll(/^\s{2,4}([A-Z][A-Z0-9_]+):\s*'\1',?$/gm)].map(m => m[1])
const codeSet = new Set(codes)

// 2. ESM import 两个 locales（locales 是 export default 的 .js）
const zh = (await import(pathToFileURL(`${ROOT}/web/src/locales/zh-CN.js`))).default
const en = (await import(pathToFileURL(`${ROOT}/web/src/locales/en.js`))).default
const zhKeys = new Set(Object.keys(zh.errors || {}))
const enKeys = new Set(Object.keys(en.errors || {}))

// 3. 后端有、前端缺（拦截器会回退显示后端原文；英文模式暴露中文）
const missingZh = codes.filter(c => !zhKeys.has(c))
const missingEn = codes.filter(c => !enKeys.has(c))
console.log(`后端错误码: ${codes.length} | zh-CN errors: ${zhKeys.size} | en errors: ${enKeys.size}`)
console.log(`\n=== 后端有 / zh-CN 缺 (${missingZh.length}) ===\n${missingZh.join(', ') || '无'}`)
console.log(`\n=== 后端有 / en 缺 (${missingEn.length}) ===\n${missingEn.join(', ') || '无'}`)

// 4. 孤儿键（前端有、后端未定义；INTERNAL/UNKNOWN 属通用兜底，人工判断）
const orphanZh = [...zhKeys].filter(k => !codeSet.has(k))
const orphanEn = [...enKeys].filter(k => !codeSet.has(k))
if (orphanZh.length) console.log(`\nzh-CN 孤儿键: ${orphanZh.join(', ')}`)
if (orphanEn.length) console.log(`en 孤儿键: ${orphanEn.join(', ')}`)

// 5. 中英不对称（单侧缺失 → 另一语言回退显示原始 key）
const zhOnly = [...zhKeys].filter(k => !enKeys.has(k))
const enOnly = [...enKeys].filter(k => !zhKeys.has(k))
zhOnly.forEach(k => console.log('仅 zh-CN: ' + k))
enOnly.forEach(k => console.log('仅 en: ' + k))

// 6. 空值键 + 含 {占位符} 的键（需前端 t(key, detail) 传参）
for (const [name, obj] of [['zh-CN', zh], ['en', en]]) {
  for (const k of Object.keys(obj.errors || {})) {
    const v = String(obj.errors[k] ?? '')
    if (!v.trim()) console.log(`${name} 空值键: errors.${k}`)
    const vars = [...v.matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1])
    if (vars.length) console.log(`${name} errors.${k} 含占位符 {${vars.join(',')}}（前端须传参）`)
  }
}

const ok = missingZh.length === 0 && missingEn.length === 0
console.log(ok ? '\n✅ 全覆盖：后端每一码前端双语均有键' : '\n❌ 仍有缺口')
process.exit(ok ? 0 : 1)
