import db from '../../db/connection.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// REQ-043 I4: 平台公告（零打扰版，单条最新公告）
// 存储：platform_config 三键（标题/内容/更新时间）
// 安全：入库前 sanitizeStoredText 消毒，读路径再消毒一次（纵深防御）
// ============================================

const TITLE_KEY = 'announcement_title'
const CONTENT_KEY = 'announcement_content'
const UPDATED_AT_KEY = 'announcement_updated_at'

/** 标题上限（与前端 textarea 同规则） */
export const ANNOUNCEMENT_TITLE_MAX = 100
/** 内容上限（与前端 textarea 同规则） */
export const ANNOUNCEMENT_CONTENT_MAX = 10000

export interface PlatformAnnouncement {
  title: string
  content: string
  updatedAt: string | null
}

function readValue(key: string): string | null {
  const row = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

/** 读取最新平台公告（标题与内容均为空 = 无公告 → null；内容消毒输出） */
export function getPlatformAnnouncement(): PlatformAnnouncement | null {
  const title = readValue(TITLE_KEY)
  const content = readValue(CONTENT_KEY)
  if (!title && !content) return null
  return {
    // d2 P2: 读路径 title 与 content 同口径二次清洗（写路径已清洗，兜底 DB 脏数据/越权直写）
    title: sanitizeStoredText(title || ''),
    content: sanitizeStoredText(content || ''),
    updatedAt: readValue(UPDATED_AT_KEY)
  }
}

/** upsert 单键（platform_config key 主键） */
function upsert(key: string, value: string): void {
  db.prepare(`
    INSERT INTO platform_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

/**
 * 保存平台公告（管理端发布）
 * 标题/内容入库前消毒 + 长度截断（schema 已限长，此处双保险）；
 * 标题与内容都为空 = 清空公告（GET 返回 null）
 */
export function savePlatformAnnouncement(input: { title?: string | null; content?: string | null }): PlatformAnnouncement {
  const title = sanitizeStoredText(String(input.title ?? '')).slice(0, ANNOUNCEMENT_TITLE_MAX)
  const content = sanitizeStoredText(String(input.content ?? '')).slice(0, ANNOUNCEMENT_CONTENT_MAX)

  db.transaction(() => {
    upsert(TITLE_KEY, title)
    upsert(CONTENT_KEY, content)
    const now = (db.prepare("SELECT datetime('now') AS now").get() as { now: string }).now
    upsert(UPDATED_AT_KEY, now)
  })()

  return getPlatformAnnouncement()!
}
