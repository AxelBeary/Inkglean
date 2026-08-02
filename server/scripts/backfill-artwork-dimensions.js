/**
 * 一次性回填脚本：为存量 artworks 补 width/height
 * 用法：node server/scripts/backfill-artwork-dimensions.js
 * 幂等：只更新 width IS NULL 的行，可重复执行
 */
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { resolve, join } from 'path'
import 'dotenv/config'

const DB_PATH = process.env.DB_PATH || './data/commission.db'
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

const rows = db.prepare('SELECT id, image_path FROM artworks WHERE width IS NULL OR height IS NULL').all()
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
    console.warn(`❌ #${row.id} 读取失败：${row.image_path} — ${err.message}`)
    fail++
  }
}

console.log(`✅ 回填完成：成功 ${ok}，失败 ${fail}`)
db.close()
