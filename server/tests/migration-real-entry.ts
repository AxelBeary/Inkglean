/**
 * 迁移测试的「真实入口」驱动（issue #117 教训的基建化）
 *
 * 背景：#117 的根因是 14 个迁移测试直调 `migration.up(db)` —— 那条路径绕开了
 * `initDatabase` 的版本调度语义（schema_migrations 版本行、noTransaction 的事务外
 * 执行、per-migration 原子事务）。直调绿的用例在生产路径上可能零效果。
 *
 * 本模块只做一件事：把「构造 target 迁移前夜的老库」+「让 initDatabase 自己跑到 target」
 * 收敛成两个可复用的驱动，测试文件不再自己写调度循环。
 *
 * 两种驱动：
 *
 * 1) `replayFrom(latest)` —— 库已在链尾（通常是正式 initDatabase 建好的全量库），
 *    删掉 `version >= target` 的版本行，让 initDatabase 重放到该迁移及其之后。
 *    适用于「结构回退」等价于「删几行版本行」的场景（纯 ADD COLUMN、幂等守卫型）。
 *
 * 2) `preTargetDb(target, revert)` —— 以 schema.ts 的基线 DDL 起库，再用 `revert`
 *    回调把结构手术回 target 迁移前夜的形态（DROP 掉 target 才建的表 / 加回 target
 *    才删的列），最后预置除 target 外的全部版本行为「已应用」。initDatabase 因此只会
 *    调度 target 一条迁移 —— 与生产升级路径同一个入口、同一个事务纪律。
 *
 * 驱动本身不改任何断言：断言仍由各测试文件按迁移真实产物写。
 */
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/migrate.js'
import { schema } from '../src/db/schema.js'
import { MIGRATIONS } from '../src/db/migrations/index.js'

/** MIGRATIONS 里全部版本号（升序），供断言链尾/覆盖完整性用 */
export const ALL_VERSIONS: number[] = MIGRATIONS.map(m => m.version)

/** 某版本号对应的迁移名（写版本行要用；未知版本抛错，防静默写空名） */
export function migrationName(version: number): string {
  const found = MIGRATIONS.find(m => m.version === version)
  if (!found) throw new Error(`MIGRATIONS 中不存在版本 v${version}`)
  return found.name
}

/** 某表的列名清单 */
export function columnNames(database: Database.Database, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)
}

/** 某表是否存在 */
export function tableExists(database: Database.Database, table: string): boolean {
  return !!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table)
}

/**
 * 撤销一列（不存在则跳过）。
 *
 * revert 回调里常用：基线 schema 有的列要显式撤掉才回到旧形态；
 * 而「只有该迁移才加、schema.ts 尚未同步」的列本来就不存在，这里是 no-op。
 * 返回是否真的执行了 DROP，便于用例断言前置形态。
 */
export function dropColumnIfExists(database: Database.Database, table: string, column: string): boolean {
  if (!columnNames(database, table).includes(column)) return false
  database.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  return true
}

/** 建 schema_migrations 表（若库里还没有——手搓老库没有它） */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/** 把给定版本号批量标为「已应用」 */
export function markApplied(db: Database.Database, versions: Iterable<number>): void {
  ensureMigrationsTable(db)
  const ins = db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
  for (const v of versions) ins.run(v, migrationName(v))
}

/** 某版本行是否已应用 */
export function isApplied(db: Database.Database, version: number): boolean {
  return !!db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)
}

/**
 * 驱动一：库已在链尾（全量 initDatabase 产物），撤掉 `version >= target` 的版本行后重放。
 *
 * 语义：真正走 initDatabase 调度器 —— 版本表读快照、noTransaction 事务外、
 * 常规迁移 BEGIN IMMEDIATE 包裹、成功后写回版本行，全部与生产一致。
 *
 * @param database 已是链尾形态的库（建议每条用例新建，避免跨用例污染）
 * @param target   要重放的起始版本号（含）
 * @returns 实际被重放的版本号列表（升序）——用例可据此断言「确实由调度器跑了」
 */
export function replayFrom(database: Database.Database, target: number): number[] {
  const replayed = ALL_VERSIONS.filter(v => v >= target)
  database.prepare('DELETE FROM schema_migrations WHERE version >= ?').run(target)
  initDatabase(database)
  return replayed
}

/**
 * 幂等重放：只撤销**单个**版本行，让调度器原样再跑一次该迁移。
 *
 * 与 replayFrom 的差别：replayFrom 会连带重放其后所有迁移（适合「结构回退」场景），
 * 本函数只针对一条已应用迁移做幂等复验——正是原用例「DELETE FROM schema_migrations
 * WHERE version = N 后再 up()」的真实入口写法。
 *
 * @returns 重放后该版本行是否被调度器重新写回
 */
export function replayVersion(database: Database.Database, version: number): boolean {
  database.prepare('DELETE FROM schema_migrations WHERE version = ?').run(version)
  initDatabase(database)
  return isApplied(database, version)
}

/**
 * 驱动二：以 schema 基线起库 + `revert` 手术回 target 前夜 + 预置其余版本行，
 * 让 initDatabase 只调度 target 这一条迁移。
 *
 * 与驱动一的差别：驱动一要求「当前结构 - 版本行」能等价回退；当 target 建的表
 * 在新库里由 schema 直接建好（CREATE TABLE 撞名）、或列被后续迁移改过时，用本驱动。
 *
 * 返回时 target 已由调度器真实执行完毕（版本行由 initDatabase 自己写入）。
 * 若 revert 后库里仍残留 target 将建的表，迁移会撞名抛错——这是有意的：
 * 说明 revert 没退干净，用例必须修好前置形态，而不是让迁移被跳过（假绿）。
 *
 * @param target 要真实驱动的迁移版本号（其余版本一律预置为已应用）
 * @param revert 把基线结构手术回 target 前夜形态的回调（在调度器启动前执行）
 */
export function preTargetDb(
  target: number,
  revert: (database: Database.Database) => void
): Database.Database {
  const database = buildPreTarget(target, revert)
  // 真实入口：与生产升级同一条路径——schema_migrations 版本快照 + noTransaction 事务外
  // + 常规迁移 BEGIN IMMEDIATE 包裹；靶迁移由调度器自己发现并执行
  initDatabase(database)
  return database
}

/**
 * 只搭「靶迁移前夜」的库，**不**跑调度器。
 *
 * 用于期望迁移抛错的用例（异常半态必须中止、FK 未真关必须中止等）——调用方自己
 * 调 `initDatabase` 并 assert 抛出。除此之外一律用 `preTargetDb`。
 */
export function buildPreTarget(
  target: number,
  revert: (database: Database.Database) => void
): Database.Database {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(schema)
  revert(database)
  markApplied(database, ALL_VERSIONS.filter(v => v !== target))
  return database
}

/**
 * 建一个全量迁移跑完的内存库（等价于全新安装），供需要链尾形态的用例使用。
 * 注意：不要拿它顶替 setup.js 的共享 db（那是全 worker 共用实例，会被写坏）。
 */
export function freshMigratedDb(): Database.Database {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  initDatabase(database)
  return database
}
