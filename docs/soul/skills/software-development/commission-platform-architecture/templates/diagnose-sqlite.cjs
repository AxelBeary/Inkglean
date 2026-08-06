// SQLite 生产库诊断脚本（绘约平台）
// 用途：怀疑数据丢失时，对 live DB 与各 .bak.vN 备份做统一体检。
//
// 用法（容器内，server 是 ESM 包，故必须用 .cjs + 从 /app/server 运行）：
//   docker cp diagnose-sqlite.cjs commission-web:/app/server/diagnose-sqlite.cjs
//   docker exec commission-web sh -c "cd /app/server && node diagnose-sqlite.cjs"
//   # 用完清理：
//   docker exec commission-web rm /app/server/diagnose-sqlite.cjs
//
// 也可在宿主机跑（DB 是 bind mount ./data:/app/data）——把下方 DB_PATHS 改成宿主机绝对路径，
// 并在 server/ 目录下 `node diagnose-sqlite.cjs`（确保能解析 better-sqlite3）。
//
// 判读要点：
//   - WAL checkpoint 返回 {log:0, checkpointed:0} => WAL 无未刷入数据，live 库就是空的，数据只在备份里。
//   - 若 live 库 artists 大量 name=NULL + qq_number 为小整数 => 测试/种子数据写进了生产库（污染指纹）。
//   - 备份的迁移版本号 < live 曾达到的版本 => 恢复后重启容器，迁移会自动向前补齐（幂等）。

const Database = require('better-sqlite3')

// 按需增删——脚本会跳过不存在的文件。
const DB_PATHS = [
  ['LIVE', '/app/data/commission.db'],
  ['BAK v12', '/app/data/commission.db.bak.v12'],
  ['BAK v11', '/app/data/commission.db.bak.v11'],
]

function inspect(label, path, tryCheckpoint) {
  console.log(`\n=== ${label}: ${path} ===`)
  let db
  try {
    db = new Database(path, { readonly: !tryCheckpoint })
  } catch (e) {
    console.log('  (打不开/不存在)', e.message)
    return
  }
  try {
    if (tryCheckpoint) {
      const r = db.pragma('wal_checkpoint(TRUNCATE)')
      console.log('  WAL checkpoint:', JSON.stringify(r))
    }
    // 迁移版本
    try {
      const mig = db.prepare('SELECT MAX(version) AS v, COUNT(*) AS c FROM schema_migrations').get()
      console.log(`  migrations: ${mig.c} 条, 最高 v${mig.v}`)
    } catch (e) { console.log('  migrations: 无表') }
    // 各表行数
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all()
    const counts = {}
    for (const t of tables) counts[t.name] = db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c
    console.log('  rows:', JSON.stringify(counts))
    // 画师抽样（看 name 是否为 NULL => 污染指纹）
    try {
      const artists = db.prepare('SELECT id, name, subdomain, qq_number, created_at FROM artists ORDER BY id LIMIT 6').all()
      console.log('  artists sample:', JSON.stringify(artists))
    } catch (e) { /* 无 artists 表 */ }
    // 订单抽样
    try {
      const orders = db.prepare('SELECT id, order_no, artist_id, status FROM orders ORDER BY id LIMIT 6').all()
      console.log('  orders sample:', JSON.stringify(orders))
    } catch (e) { /* 无 orders 表 */ }
  } finally {
    db.close()
  }
}

DB_PATHS.forEach(([label, path], i) => inspect(label, path, i === 0))
