#!/usr/bin/env node
/* eslint-disable no-console -- CLI 运维脚本按约定豁免（console 输出是脚本本职） */
// ============================================
// 入驻模式设置脚本（P1 余批：onboarding_mode 有读无写 → 补部署后运维通道）
//
// 场景：开箱向导（POST /api/setup/onboarding-mode）只在首次部署走一次，
//       初始化完成后该端点永久 410（防把部署期口子变成常态后台口子）。
//       部署之后仍需切换邀请制/手动制 → 在服务器本机执行本脚本直接改库配置。
//       安全边界同「服务器 CLI 重绑脚本」：只有能物理操作服务器的人可用（不经网络、不开端口）。
//
// 用法：tsx scripts/set-onboarding-mode.ts <invite|manual> [--dry-run]
//   invite  = 邀请制（仅持邀请码者可注册）
//   manual  = 手动制（关闭邀请入驻）
//   --dry-run = 只打印 当前值 → 目标值，不落库
//
// 防误操作：必须显式传入合法模式参数，无交互、无默认值；非法参数直接报错退出。
// ============================================
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..') // 仓库根目录
dotenv.config({ path: resolve(ROOT, '.env') })

// 显式库路径：真实库在仓库根 data/（docker-compose 挂载同一文件）。可用 DB_PATH 覆盖。
const DB_PATH = process.env.DB_PATH || resolve(ROOT, 'data/commission.db')

// ─── 参数解析：位置参数为模式，--dry-run 为开关；无交互默认值 ───
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const mode = args.find((a) => !a.startsWith('--'))

const ALLOWED = ['invite', 'manual'] as const
if (!mode || !(ALLOWED as readonly string[]).includes(mode)) {
  console.error('❌ 用法: tsx scripts/set-onboarding-mode.ts <invite|manual> [--dry-run]')
  console.error('   invite = 邀请制；manual = 手动制（关闭邀请入驻）')
  process.exit(1)
}

if (!existsSync(DB_PATH)) {
  console.error(`❌ 数据库不存在: ${DB_PATH}`)
  process.exit(1)
}

// ─── 裸开库：只设 busy_timeout，绝不碰 journal_mode（Docker bind mount 数据安全，v0.38 迁移事故同款教训） ───
const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')

interface ConfigValueRow {
  value: string
}

// ─── 1. 读当前值（migrate 用 INSERT OR IGNORE 预置，行恒在；缺失时按未知处理不误判） ───
const beforeRow = db
  .prepare("SELECT value FROM platform_config WHERE key = 'onboarding_mode'")
  .get() as ConfigValueRow | undefined
const before = beforeRow?.value ?? '(缺失)'
console.log(`当前 onboarding_mode: ${before}`)
console.log(`目标 onboarding_mode: ${mode}`)

if (DRY_RUN) {
  console.log('ℹ️ --dry-run：未做任何修改。')
  db.close()
  process.exit(0)
}

if (!beforeRow) {
  console.error('❌ platform_config 缺少 onboarding_mode 行（预期由迁移 INSERT OR IGNORE 预置）——请核对库版本后重试，未做任何修改')
  db.close()
  process.exit(1)
}

// ─── 2. 落库：UPDATE 覆盖既有行（与本功能写端点 setOnboardingMode 同一条 SQL 口径） ───
const result = db
  .prepare("UPDATE platform_config SET value = ? WHERE key = 'onboarding_mode'")
  .run(mode)
if (result.changes === 0) {
  console.error('❌ UPDATE 未命中任何行，未生效——请检查库状态')
  db.close()
  process.exit(1)
}

// ─── 3. 回读校验（self-report 不可信：以库里实际值为准） ───
const after = (db
  .prepare("SELECT value FROM platform_config WHERE key = 'onboarding_mode'")
  .get() as ConfigValueRow).value
db.close()

if (after !== mode) {
  console.error(`❌ 回读校验失败：库值 ${after}，应为 ${mode}`)
  process.exit(1)
}
console.log(`✅ 已更新：${before} → ${after}`)
