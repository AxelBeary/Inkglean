#!/usr/bin/env node
// ============================================
// uploads 定时备份脚本（R-6，审计批E，2026-08-11）
//
// 背景：审计 R-6 ① —— 所有作品/参考图/交付文件（uploads/）无备份，磁盘/容器损坏即全部丢失。
// 本脚本把 UPLOAD_DIR 打包为 tar.gz 到 data/backups/uploads-<ISO时间>.tar.gz，
// 与 backup-db.ts（DB 快照）互补，构成「DB + 文件」完整备份对。
//
// 方案：Node 原生 zlib + 自定义 tar 流写入（ustar 格式），零新依赖：
//       - 文件按需流式读入，不把整个 uploads 载入内存（交付文件单文件可达 50MB）
//       - 含 .recycle-bin（回收站内仍是用户数据，恢复窗口内应一并备份）
//
// 用法：npm run backup:uploads      （容器 cron 每日执行）
//       环境变量：UPLOAD_DIR / BACKUP_DIR（默认值见下，容器内由 compose 注入 UPLOAD_DIR）
//
// 保留策略：备份目录内只保留最近 7 份（按文件名排序，删最旧），防磁盘撑爆（与 backup-db.ts 同款）。
// ============================================
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { resolve, dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..') // 仓库根目录
// 默认相对 cwd（与 app.ts 的 UPLOAD_DIR 默认口径一致）；容器内由 compose 注入 UPLOAD_DIR=/app/uploads
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
// 与 backup-db.ts 同一备份目录（容器内解析为 /app/data/backups），DB + uploads 备份放一起方便异地同步
const BACKUP_DIR = process.env.BACKUP_DIR || resolve(ROOT, 'data/backups')
const KEEP = 7

/**
 * 递归收集 uploadDir 下全部文件相对路径（正斜杠归一，排序保证归档可复现）
 * 含 .recycle-bin——回收站内仍是用户数据（30 天恢复窗口），备份应一并覆盖
 */
export function listUploadFiles(uploadDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else files.push(relative(uploadDir, full).replace(/\\/g, '/'))
    }
  }
  walk(uploadDir)
  return files.sort()
}

/** ustar 长路径拆分：>100 字节的路径把前半段放入 prefix（≤155），尾部保留在 name（≤100） */
function tarNameFields(relPath: string): { name: string; prefix: string } {
  if (Buffer.byteLength(relPath, 'utf8') <= 100) return { name: relPath, prefix: '' }
  if (Buffer.byteLength(relPath, 'utf8') > 255) {
    throw new Error(`文件相对路径过长，无法打包: ${relPath}`)
  }
  const parts = relPath.split('/')
  for (let i = 1; i < parts.length; i++) {
    const name = parts.slice(i).join('/')
    const prefix = parts.slice(0, i).join('/')
    if (Buffer.byteLength(name, 'utf8') <= 100 && Buffer.byteLength(prefix, 'utf8') <= 155) {
      return { name, prefix }
    }
  }
  throw new Error(`文件相对路径无法按 ustar 分段: ${relPath}`)
}

/** 512 字节 ustar 文件头（mode/uid/gid 固定、mtime 取源文件；checksum 为字节和八进制） */
function tarHeader(name: string, prefix: string, size: number, mtimeSec: number): Buffer {
  const buf = Buffer.alloc(512)
  buf.write(name, 0, 100, 'utf8')
  buf.write('0000644\0', 100, 8, 'utf8')
  buf.write('0000000\0', 108, 8, 'utf8')
  buf.write('0000000\0', 116, 8, 'utf8')
  buf.write(size.toString(8).padStart(11, '0'), 124, 12, 'utf8')
  buf.write(mtimeSec.toString(8).padStart(11, '0'), 136, 12, 'utf8')
  buf.write('        ', 148, 8, 'utf8') // 先留空再算 checksum（规范要求字段内全空格）
  let sum = 0
  for (let i = 0; i < 512; i++) sum += buf[i]
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8')
  buf.write('0', 156, 1, 'utf8') // typeflag: '0' = 普通文件
  buf.write('ustar\0', 257, 6, 'utf8')
  buf.write('00', 263, 2, 'utf8')
  buf.write(prefix, 345, 155, 'utf8')
  return buf
}

/** 流式读文件内容（大交付文件不整块进内存） */
async function* readFileChunks(absPath: string): AsyncGenerator<Buffer> {
  const stream = createReadStream(absPath)
  for await (const chunk of stream) {
    yield chunk as Buffer
  }
}

/** 逐个文件产出 tar 条目 + 结尾两个全零块（tar 结束标记） */
async function* generateTarEntries(uploadDir: string, fileList: string[]): AsyncGenerator<Buffer> {
  for (const rel of fileList) {
    const abs = join(uploadDir, rel)
    const st = statSync(abs)
    if (!st.isFile()) continue
    const { name, prefix } = tarNameFields(rel)
    yield tarHeader(name, prefix, st.size, Math.floor(st.mtimeMs / 1000))
    if (st.size > 0) yield* readFileChunks(abs)
    const pad = (512 - (st.size % 512)) % 512
    if (pad > 0) yield Buffer.alloc(pad)
  }
  yield Buffer.alloc(1024)
}

/** 生成 uploads tar.gz 归档，返回文件数与归档字节数 */
export async function createUploadsArchive(uploadDir: string, dstPath: string): Promise<{ files: number; bytes: number }> {
  const fileList = listUploadFiles(uploadDir)
  await pipeline(
    Readable.from(generateTarEntries(uploadDir, fileList)),
    createGzip(),
    createWriteStream(dstPath)
  )
  return { files: fileList.length, bytes: statSync(dstPath).size }
}

/** 保留策略：只留最近 KEEP 份 uploads 归档（文件名 ISO 时间序 = 字典序） */
export function pruneUploadsBackups(backupDir: string, keep: number): void {
  const baks = readdirSync(backupDir)
    .filter(f => f.startsWith('uploads-') && f.endsWith('.tar.gz'))
    .sort()
  while (baks.length > keep) {
    unlinkSync(join(backupDir, baks.shift()!))
  }
}

/** 执行一次备份：打包 + 轮转，返回归档路径/大小/文件数 */
export async function backupUploads(opts: { uploadDir: string; backupDir: string }): Promise<{ path: string; size: number; files: number }> {
  mkdirSync(opts.backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = join(opts.backupDir, `uploads-${stamp}.tar.gz`)
  const result = await createUploadsArchive(opts.uploadDir, dst)
  pruneUploadsBackups(opts.backupDir, KEEP)
  return { path: dst, size: result.bytes, files: result.files }
}

async function main(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) {
    throw new Error(`上传目录不存在: ${UPLOAD_DIR}`)
  }
  const result = await backupUploads({ uploadDir: UPLOAD_DIR, backupDir: BACKUP_DIR })
  console.log('BACKUP_OK', result.path, `(${result.size} bytes, ${result.files} files)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('BACKUP_FAILED', (err as Error).message)
    process.exit(1)
  })
}
