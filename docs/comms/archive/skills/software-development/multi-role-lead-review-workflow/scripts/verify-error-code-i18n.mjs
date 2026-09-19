#!/usr/bin/env node
/**
 * verify-error-code-i18n.mjs — 后端错误码 vs 前端 i18n errors.* 键覆盖校验
 *
 * 用途：批量核验 errors.ts 的每个错误码在 zh-CN.js / en.js 的 errors 段都有对应键。
 * 缺键 = 英文用户触发该错误时看到后端中文原文直出（或原始错误码）。
 *
 * 用法：node scripts/verify-error-code-i18n.mjs <项目根目录>
 *   项目根目录需含 server/src/shared/errors.ts 与 web/src/locales/{zh-CN,en}.js
 *
 * 背景：v0.35 五号审计发现存量缺 56 键（脚本实锤而非目测）；此后每次
 * errors.ts 新增错误码的分支审核都可跑此脚本复验角色"已补齐"的声明。
 *
 * 注意：errors.ts 错误码枚举段与 ERROR_MESSAGES 段都在文件内，本脚本取
 * ERROR_MESSAGES 之前的段提取码（`CODE: 'CODE',` 自引用模式）；若项目改为
 * 其他定义方式需调整正则。"多余"键（locales 有但枚举没有）常见为 INTERNAL/
 * UNKNOWN 等通用兜底键或已删码残留，人工判断，不自动视为错误。
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = process.argv[2] || process.cwd()
const errorsSrc = readFileSync(resolve(ROOT, 'server/src/shared/errors.ts'), 'utf8')

// 提取错误码枚举（自引用模式 `CODE: 'CODE',`），只取 ERROR_MESSAGES 段之前
const codes = new Set()
const enumSection = errorsSrc.split('ERROR_MESSAGES')[0]
for (const m of enumSection.matchAll(/^\s*([A-Z][A-Z0-9_]+):\s*'\1',/gm)) codes.add(m[1])

function keysOf(file) {
  const s = readFileSync(resolve(ROOT, `web/src/locales/${file}`), 'utf8')
  const errorsBlock = s.split(/errors:\s*{/)[1].split(/\n  },/)[0]
  const keys = new Set()
  for (const m of errorsBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)) keys.add(m[1])
  return keys
}

let failed = false
for (const f of ['zh-CN.js', 'en.js']) {
  const keys = keysOf(f)
  const missing = [...codes].filter(c => !keys.has(c))
  const extra = [...keys].filter(k => !codes.has(k))
  console.log(`${f}: 错误码 ${codes.size} | i18n 键 ${keys.size} | 缺失 ${missing.length}${missing.length ? ' → ' + missing.join(', ') : ''} | 多余 ${extra.length}${extra.length ? ' → ' + extra.join(', ') : ''}`)
  if (missing.length) failed = true
}
if (failed) { console.log('\n❌ 存在缺失键（见上），英文用户将看到非本地化消息'); process.exit(1) }
console.log('\n✅ 双语键全覆盖')
