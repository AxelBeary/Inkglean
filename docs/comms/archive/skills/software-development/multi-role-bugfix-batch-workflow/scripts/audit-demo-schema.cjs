// audit-demo-schema.cjs — demo-data.ts INSERT 列 vs 真实表列对照（种子数据完整性审计）
// 在容器内跑（能拿到迁移后的真实表结构）：docker cp 进 /app/server 后 node audit-demo-schema.cjs
// 只读。输出：幻影列（demo 写了表没有）/ NOT NULL 漏写 / nullable 缺列（人工判断）
const fs = require('fs')
const Database = require('better-sqlite3')

const demoSrc = fs.readFileSync('/app/server/scripts/demo-data.ts', 'utf8')
const db = new Database('/app/data/commission.db', { readonly: true })

const inserts = {}
const re = /INSERT INTO (\w+)\s*\(([^)]+)\)/gi
let m
while ((m = re.exec(demoSrc)) !== null) {
  const table = m[1]
  m[2].split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
    ;(inserts[table] = inserts[table] || new Set()).add(c)
  })
}

let issues = 0
for (const [table, demoCols] of Object.entries(inserts)) {
  let realCols
  try { realCols = db.prepare(`PRAGMA table_info(${table})`).all() }
  catch (e) { console.log(`\n[${table}] 表不存在或查询失败: ${e.message}`); issues++; continue }
  const realSet = new Set(realCols.map(c => c.name))
  const phantom = [...demoCols].filter(c => !realSet.has(c))
  const missing = realCols.filter(c => !demoCols.has(c.name))
  const missingRequired = missing.filter(c => c.notnull === 1 && c.dflt_value === null && c.pk === 0)

  console.log(`\n[${table}] demo 写 ${demoCols.size} 列 / 表实有 ${realSet.size} 列`)
  if (phantom.length) { console.log(`  🔴 demo 写了不存在的列: ${phantom.join(', ')}`); issues++ }
  if (missingRequired.length) { console.log(`  🔴 NOT NULL 无默认值但 demo 没写: ${missingRequired.map(c => c.name).join(', ')}`); issues++ }
  if (missing.length) console.log(`  🟡 表有但 demo 未写（nullable，人工判断）: ${missing.map(c => c.name).join(', ')}`)
}
console.log(`\n=== 汇总：🔴 硬问题 ${issues} 处 ===`)
db.close()
process.exit(issues > 0 ? 1 : 0)
