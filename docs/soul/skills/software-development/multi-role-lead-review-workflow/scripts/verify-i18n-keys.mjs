// 用法: node scripts/verify-i18n-keys.mjs <vue文件路径> <namespace> <locales目录路径>
// 示例: node scripts/verify-i18n-keys.mjs web/src/views/artist/TierManage.vue tiers web/src/locales
// 验证：① vue 中引用的所有 ns.xxx 键在 zh-CN.js 和 en.js 中都存在 ② 模板区无残留硬编码中文
import { readFileSync } from 'fs'
import { resolve, basename } from 'path'

const [,, vuePath, ns, localesDir] = process.argv
if (!vuePath || !ns || !localesDir) {
  console.log('用法: node verify-i18n-keys.mjs <vue文件> <namespace> <locales目录>')
  process.exit(1)
}

const vue = readFileSync(resolve(vuePath), 'utf8')
const zh = readFileSync(resolve(localesDir, 'zh-CN.js'), 'utf8')
const en = readFileSync(resolve(localesDir, 'en.js'), 'utf8')

// 提取 vue 中所有 ns.xxx 键引用（$t('ns.key') 和 t('ns.key')）
const refs = [...new Set(
  [...vue.matchAll(new RegExp(`\\$t\\('${ns}\\.(\\w+)'\\)|t\\('${ns}\\.(\\w+)'\\)`, 'g'))]
    .map(m => m[1] || m[2])
)]
console.log(`${basename(vuePath)} 引用 ${refs.length} 个 ${ns}.* 键`)

let fail = 0
for (const key of refs) {
  const inZh = new RegExp(`\\b${key}:`).test(zh)
  const inEn = new RegExp(`\\b${key}:`).test(en)
  if (!inZh || !inEn) { console.log(`❌ ${ns}.${key} — zh:${inZh} en:${inEn}`); fail++ }
}

// 反向：模板区（<script> 之前）搜残留硬编码中文（排除注释）
const scriptIdx = vue.indexOf('<script')
const template = scriptIdx > 0 ? vue.slice(0, scriptIdx) : vue
const lines = template.split('\n')
let residual = 0
for (const line of lines) {
  const trimmed = line.trim()
  if (trimmed.startsWith('<!--') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue
  if (trimmed.includes('<!--') && trimmed.includes('-->')) continue // 行内注释
  const chinese = trimmed.match(/[\u4e00-\u9fff]+/g)
  if (chinese) { console.log(`⚠️ 残留中文: "${chinese.join('')}" — ${trimmed.slice(0, 80)}`); residual++ }
}

console.log(`\n模板区残留中文（非注释）: ${residual} 处`)
if (fail > 0) { console.log(`❌ ${fail} 个键缺失`); process.exit(1) }
if (residual > 0) { console.log(`⚠️ ${residual} 处残留中文需处理`); process.exit(1) }
console.log(`✅ 全部 ${ns}.* 键在 zh-CN + en 中存在，无残留硬编码中文`)
