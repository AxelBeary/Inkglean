/* eslint-disable no-console -- 一次性 CLI 脚本按约定豁免（console 输出是脚本本职） */
/**
 * 一次性回填脚本：为存量 artworks 补 width/height
 * 用法：npx tsx server/scripts/backfill-artwork-dimensions.ts
 * 幂等：只更新 width IS NULL 的行，可重复执行
 * 注意：不强制 journal_mode——沿用 DB 当前模式（容器内是 DELETE 模式，强制 WAL 会踩坑）
 */
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// 815 审计 P1-8：dotenv 与默认路径按脚本位置推导仓库根（不依赖 cwd）
const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
dotenv.config({ path: resolve(REPO_ROOT, '.env') })

const DB_PATH = process.env.DB_PATH || resolve(REPO_ROOT, 'data/commission.db')
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || resolve(REPO_ROOT, 'uploads'))

const db = new Database(DB_PATH)

/** 待回填作品行 */
interface ArtworkDimRow {
  id: number
  image_path: string
}

const rows = db.prepare('SELECT id, image_path FROM artworks WHERE width IS NULL OR height IS NULL').all() as ArtworkDimRow[]
console.log(`📐 待回填：${rows.length} 条`)

const update = db.prepare('UPDATE artworks SET width = ?, height = ? WHERE id = ?')
let ok = 0
let fail = 0

for (const row of rows) {
  try {
    const absPath = join(UPLOAD_DIR, row.image_path)
    const meta = await sharp(absPath).metadata()
    if (meta.width && meta.height) {
      update.run(meta.width, meta.height, row.id)
      ok++
    } else {
      console.warn(`⚠️ #${row.id} 无尺寸信息：${row.image_path}`)
      fail++
    }
  } catch (err) {
    console.warn(`❌ #${row.id} 读取失败：${row.image_path} — ${err instanceof Error ? err.message : String(err)}`)
    fail++
  }
}

console.log(`✅ 回填完成：成功 ${ok}，失败 ${fail}`)
db.close()
