import { requireAuth } from '../../shared/middleware/auth.js'
import { mkdirSync, existsSync, unlinkSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join, extname, basename, resolve, sep } from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { nanoid } from 'nanoid'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'
import { getDiskHeadroom } from '../admin/health.service.js'
import * as trackingService from '../tracking/tracking.service.js'
import db from '../../db/connection.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 文件上传路由
// UPLOAD_DIR 优先由 app.js 通过插件选项传入，保证与静态服务路径一致
// ============================================
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB（图片/参考图）
const DELIVER_MAX_SIZE = 50 * 1024 * 1024 // P2-A: 交付文件放宽到 50MB

// 白名单：只允许图片扩展名（防 .html/.svg XSS）
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const RECOMMENDED_TYPES = ['image/webp', 'image/jpeg', 'image/png']

// MIME 类型白名单（双重校验，防扩展名伪造）
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// 交付文件白名单（不含 .svg — SVG 可内嵌脚本，同源存储会导致 XSS）
const DELIVER_ALLOWED = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
  '.psd', '.ai', '.tiff', '.pdf',
  '.zip', '.rar', '.7z',
  '.mp4', '.mov',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md'
]

// 交付文件 MIME 黑名单（拒绝可执行/可渲染脚本的类型）
const DELIVER_BLOCKED_MIME = ['image/svg+xml', 'text/html', 'application/xhtml+xml']

// ─── GHSA-6pf3-g4xq-854w（Wave1·高）参考图囤积守卫 ───
// 单文件 10MB × 10 次/10 分/IP 的次数限流拦不住囤积：未绑定订单的登记行此前全仓零 DELETE，
// 孤儿回收又把这些行当「DB 仍引用」→ 磁盘只进不出（实算 14.4GB/天/IP）。三道闸：
//   ① 写盘前磁盘水位（health.service getDiskHeadroom，见本文件 reference 路由）
//   ② 写盘前累计字节配额（本段，per-anon 与 per-IP 各算一份，绑定/TTL 清扫后额度自动释放）
//   ③ 未绑定行的 TTL 清理（app.ts gcDatabaseTtl，REFERENCE_UPLOAD_TTL_DAYS 默认 3 天）
// 配额阈值 env REFERENCE_UPLOAD_MAX_TOTAL_MB（MB，默认 50；0 = 显式关闭配额）。
const REFERENCE_UNBOUND_MAX_MB_DEFAULT = 50

/** 未绑定参考图的累计字节上限（每次请求现读 env，运维不改码即可调档） */
function referenceUnboundMaxBytes(): number {
  const raw = Number(process.env.REFERENCE_UPLOAD_MAX_TOTAL_MB)
  const mb = Number.isFinite(raw) && raw >= 0 ? raw : REFERENCE_UNBOUND_MAX_MB_DEFAULT
  return Math.floor(mb * 1024 * 1024)
}

/**
 * 某匿名凭证名下「未绑定」登记行的累计字节。
 * COALESCE(file_size, MAX_FILE_SIZE)：v77 之前的存量行没有尺寸记录，
 * 按单文件上限保守计入（宁可早拒，也不逐行 stat 磁盘——把文件系统扫描成本
 * 挂在公开无鉴权接口上等于换个姿势继续被耗尽）。
 */
function unboundBytesByAnon(anonId: number): number {
  const row = db.prepare(
    'SELECT COALESCE(SUM(COALESCE(file_size, ?)), 0) AS bytes FROM reference_uploads WHERE anon_id = ? AND order_id IS NULL'
  ).get(MAX_FILE_SIZE, anonId) as { bytes: number }
  return row.bytes
}

/** 某 IP 名下「未绑定」登记行的累计字节（ip 为 v77 新列，存量行 NULL 自然不计入；保守计入口径同上） */
function unboundBytesByIp(ip: string): number {
  const row = db.prepare(
    'SELECT COALESCE(SUM(COALESCE(file_size, ?)), 0) AS bytes FROM reference_uploads WHERE ip = ? AND order_id IS NULL'
  ).get(MAX_FILE_SIZE, ip) as { bytes: number }
  return row.bytes
}

/** 配额拒绝响应（429 + 明确码：未绑定囤积超限，等绑定或 TTL 清扫后可再试） */
function rejectQuota(reply: FastifyReply, usedBytes: number, maxBytes: number, subject: 'anon' | 'ip') {
  const toMb = (n: number) => Math.round(n / 1048576 * 10) / 10
  return reply.code(429).send({
    code: 'REFERENCE_QUOTA_EXCEEDED',
    error: '该来源尚未绑定订单的参考图已占满暂存额度，请先完成下单，或等旧参考图被暂存清理后再试',
    detail: { subject, usedMb: toMb(usedBytes), maxMb: toMb(maxBytes) }
  })
}

/** 磁盘水位拒绝响应（507 = 存储不足，非客户端可重试的频控） */
function rejectDisk(reply: FastifyReply, freeMb: number | null, minFreeMb: number) {
  return reply.code(507).send({
    code: 'DISK_WATERMARK_BLOCKED',
    error: '服务器存储空间紧张，暂时无法接收新的参考图，请稍后再试，或直接把参考图发给画师',
    detail: { freeMb, minFreeMb }
  })
}

/**
 * P0-B: 安全扩展名提取 — basename 剥路径成分 + 正则限字符集
 */
function safeExt(filename: string | undefined, allowList: string[]): string | null {
  const ext = extname(basename(String(filename || ''))).toLowerCase()
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return null
  return allowList.includes(ext) ? ext : null
}

function checkFileType(mimeType: string, fileName: string): { recommended: boolean; message: string | null } {
  const ext = extname(fileName).toLowerCase()
  const isRecommended = RECOMMENDED_TYPES.includes(mimeType) ||
    ['.webp', '.jpg', '.jpeg', '.png'].includes(ext)
  if (!isRecommended) {
    return {
      recommended: false,
      message: '建议转换为 JPG 或 WebP 格式以获得更好的预览体验，但当前格式也可以正常上传。'
    }
  }
  return { recommended: true, message: null }
}

/** multipart 文件数据（@fastify/multipart 返回） */
interface MultipartFile {
  filename: string
  mimetype: string
  file: NodeJS.ReadableStream & { truncated?: boolean }
}

/** 保存结果 */
interface SaveResult {
  filePath: string
  absPath: string
  size: number
}

/** 读取文件头部字节（避免把整文件读入内存） */
function readHead(absPath: string, length: number): Buffer {
  const fd = openSync(absPath, 'r')
  try {
    const buf = Buffer.alloc(length)
    const bytes = readSync(fd, buf, 0, length, 0)
    return buf.subarray(0, bytes)
  } finally {
    closeSync(fd)
  }
}

/** 图片魔数校验（d3 P2）：不信客户端 multipart 头，落库前核对真实文件头 */
function sniffImageMagic(absPath: string): boolean {
  const head = readHead(absPath, 12)
  if (head.length < 8) return false
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47 &&
      head[4] === 0x0D && head[5] === 0x0A && head[6] === 0x1A && head[7] === 0x0A) return true
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return true
  const ascii = head.toString('latin1')
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return true
  return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP'
}

/** 交付文件内容黑名单（d3 P2）：扩展名/MIME 之外的兜底，拦 HTML/SVG/XML 可脚本内容 */
function looksLikeScriptableHead(absPath: string): boolean {
  const head = readHead(absPath, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<svg') || head.startsWith('<?xml')
}

/**
 * 保存上传文件，截断时自动清理残留
 * P0-B: 路径穿越纵深防御 — 最终路径必须在 uploadDir 内
 */
async function saveUpload(data: MultipartFile, subDir: string, uploadDir: string): Promise<SaveResult | null> {
  const ext = safeExt(data.filename, ALLOWED_EXTENSIONS)
  if (!ext) throw new AppError(E.ILLEGAL_FILE_TYPE)
  const fileName = `${nanoid(12)}${ext}`
  const fullPath = join(uploadDir, subDir)

  if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true })

  const filePath = join(subDir, fileName)
  const absPath = resolve(join(uploadDir, filePath))
  const resolvedRoot = resolve(uploadDir)

  // P0-B: 纵深防御 — 最终绝对路径必须在 uploadDir 子树内
  if (!absPath.startsWith(resolvedRoot + sep)) {
    throw new AppError(E.ILLEGAL_PATH)
  }

  try {
    await pipeline(data.file, createWriteStream(absPath))
  } catch (err) {
    // d3 P2: 写盘失败（ENOSPC/IO）清掉半文件，避免反复上传制造垃圾
    try { unlinkSync(absPath) } catch { /* 文件可能未创建 */ }
    throw err
  }

  if (data.file.truncated) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    return null
  }

  // d3 P2: MIME 头可由客户端伪造——真实内容魔数不符即拒绝并清理，HTML 不能以图片身份进公开目录
  if (!sniffImageMagic(absPath)) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    throw new AppError(E.ILLEGAL_FILE_TYPE)
  }

  const size = statSync(absPath).size
  // Windows 兼容：统一返回正斜杠路径（前端/校验均用 / 分隔）
  return { filePath: filePath.split(sep).join('/'), absPath, size }
}

/**
 * 交付文件专用保存（允许更多格式）
 */
async function saveDeliverable(data: MultipartFile, subDir: string, uploadDir: string): Promise<SaveResult | null> {
  const ext = safeExt(data.filename, DELIVER_ALLOWED)
  if (!ext) throw new AppError(E.UNSUPPORTED_FORMAT)
  const fileName = `${nanoid(12)}${ext}`
  const fullPath = join(uploadDir, subDir)

  if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true })

  const filePath = join(subDir, fileName)
  const absPath = resolve(join(uploadDir, filePath))

  if (!absPath.startsWith(resolve(uploadDir) + sep)) {
    throw new AppError(E.ILLEGAL_PATH)
  }

  try {
    await pipeline(data.file, createWriteStream(absPath))
  } catch (err) {
    // d3 P2: 同 saveUpload——失败清理半文件
    try { unlinkSync(absPath) } catch { /* 文件可能未创建 */ }
    throw err
  }

  if (data.file.truncated) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    return null
  }

  // d3 P2: 交付文件内容黑名单——绕过 MIME 头伪造的 HTML/SVG 内容同样拒绝
  if (looksLikeScriptableHead(absPath)) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    throw new AppError(E.UNSUPPORTED_FORMAT, 400, '不支持此文件格式（SVG/HTML 不允许上传）')
  }

  const size = statSync(absPath).size
  // Windows 兼容：统一返回正斜杠路径（前端/校验均用 / 分隔）
  return { filePath: filePath.split(sep).join('/'), absPath, size }
}

export default async function uploadRoutes(fastify: FastifyInstance, opts: { uploadDir?: string }) {
  const UPLOAD_DIR = opts.uploadDir || resolve(process.env.UPLOAD_DIR || './uploads')

  await fastify.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_FILE_SIZE, files: 5 }
  })

  /**
   * POST /api/upload/image — 作品图/档位示例图（需登录）
   * P0-B: 加限流（50次/10分钟，画师批量传图场景放宽；2026-08-07 用户反馈调高）
   */
  fastify.post('/api/upload/image', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(`upload-img:${request.ip}`, 50, 10 * 60_000)) {
      return reply.code(429).send({ error: '上传过于频繁，请稍后再试' })
    }

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    if (safeExt(data.filename, ALLOWED_EXTENSIONS) === null || !ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.code(400).send({ error: '仅支持 JPG / PNG / WebP / GIF 格式的图片' })
    }

    try {
      const result = await saveUpload(data, join('images', String(request.artist.id)), UPLOAD_DIR)
      if (!result) return reply.code(400).send({ error: '文件大小超过10MB限制' })

      const typeCheck = checkFileType(data.mimetype, data.filename)

      return {
        filePath: result.filePath,
        url: `/uploads/${result.filePath}`,
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size,
        typeWarning: typeCheck.recommended ? null : typeCheck.message
      }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /**
   * POST /api/upload/reference — 参考图（客户下单用，公开）
   * P0-B: 加限流（10次/10分钟，公开接口需更严格）
   * F-10（P2-13 后端侧）: 要求 x-anon-token（复用匿名凭证机制）——有效则登记
   * (anon_id, file_path) 供下单归属校验；无 token/无效 → 拒绝上传（前端由批 G 接 token，两端同步上线）
   * GHSA-6pf3-g4xq-854w（Wave1·高）: 写盘前加两道闸——磁盘水位（507）+ 未绑定累计字节配额（429）。
   * 次数限流只压速率不压总量，磁盘耗尽的根因是「未绑定行永不删除」，故配额按未绑定字节累计。
   */
  fastify.post('/api/upload/reference', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(`upload-ref:${request.ip}`, 10, 10 * 60_000)) {
      return reply.code(429).send({ error: '上传过于频繁，请稍后再试' })
    }

    // F-10: 凭证先行——无效凭证不落盘不登记（限流不变，仍按 IP 计数）
    const anonToken = request.headers['x-anon-token']
    const anonId = typeof anonToken === 'string' ? trackingService.resolveAnonToken(anonToken) : null
    if (anonId == null) {
      return reply.code(400).send({ code: 'INVALID_ANON_TOKEN', error: '缺少有效匿名凭证（x-anon-token）' })
    }

    // 闸①：磁盘水位——可用空间低于阈值时拒绝公开上传（此前 checkDisk 只报表不阻断，恒 'ok'）。
    // statfs 探针自身异常时 getDiskHeadroom 返回 ok=true（开发机/非常规文件系统不吃 statfs），
    // 只记 warn 不阻断——水位未知不等于水位告急，误伤真实客户上传的代价由配额与 TTL 兜住。
    const headroom = await getDiskHeadroom(UPLOAD_DIR)
    if (headroom.probeError) {
      request.log.warn(`参考图上传前磁盘水位探针不可用（不阻断）: ${headroom.probeError}`)
    }
    if (!headroom.ok) {
      return rejectDisk(reply, headroom.freeMb, headroom.minFreeMb)
    }

    // 闸②：未绑定累计字节配额（per-anon 与 per-IP 各算一份，任一超限即拒）
    // 预留本请求的最坏用量（单文件上限 10MB）：写盘前拒，避免「先落盘再回滚」留下半文件与额外 IO
    const maxBytes = referenceUnboundMaxBytes()
    if (maxBytes > 0) {
      const usedByAnon = unboundBytesByAnon(anonId)
      if (usedByAnon + MAX_FILE_SIZE > maxBytes) {
        return rejectQuota(reply, usedByAnon, maxBytes, 'anon')
      }
      const usedByIp = unboundBytesByIp(request.ip)
      if (usedByIp + MAX_FILE_SIZE > maxBytes) {
        return rejectQuota(reply, usedByIp, maxBytes, 'ip')
      }
    }

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    if (safeExt(data.filename, ALLOWED_EXTENSIONS) === null || !ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.code(400).send({ error: '仅支持 JPG / PNG / WebP / GIF 格式的图片' })
    }

    try {
      const result = await saveUpload(data, 'references', UPLOAD_DIR)
      if (!result) return reply.code(400).send({ error: '文件大小超过10MB限制' })

      const typeCheck = checkFileType(data.mimetype, data.filename)

      // F-10: 登记归属（文件名为随机 nanoid，同路径重复登记实际不会发生；
      // file_path UNIQUE 兜底防手写路径投毒，冲突即 500 由全局兜底）
      // v77（GHSA-6pf3-g4xq-854w）：一并登记 request.ip 与落盘真实字节数，供配额 SUM 使用
      db.prepare('INSERT INTO reference_uploads (anon_id, file_path, ip, file_size) VALUES (?, ?, ?, ?)')
        .run(anonId, result.filePath, request.ip, result.size)

      return {
        filePath: result.filePath,
        url: signedUrl(result.filePath),
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size,
        typeWarning: typeCheck.recommended ? null : typeCheck.message
      }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /**
   * POST /api/upload/deliverable — 交付文件（需登录，允许更多格式）
   * P0-B: 加限流（30次/10分钟；2026-08-07 用户反馈画师多文件交付场景放宽）
   */
  fastify.post('/api/upload/deliverable', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(`upload-deliver:${request.ip}`, 30, 10 * 60_000)) {
      return reply.code(429).send({ error: '上传过于频繁，请稍后再试' })
    }

    // P2-A: 交付文件限额 50MB，覆盖全局 10MB
    const data = await request.file({ limits: { fileSize: DELIVER_MAX_SIZE } })
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    // MIME 黑名单校验（拒绝 SVG/HTML 等可执行脚本类型）
    if (DELIVER_BLOCKED_MIME.includes(data.mimetype)) {
      return reply.code(400).send({ error: '不支持此文件格式（SVG/HTML 不允许上传）' })
    }

    try {
      const result = await saveDeliverable(data, join('deliverables', String(request.artist.id)), UPLOAD_DIR)
      if (!result) return reply.code(400).send({ error: '文件大小超过限制' })

      // 260830 审计 H-4：上传时 deliverables 账本行尚未创建（交付时才建），无法带载荷签发；
      // 交付目录裸签名在访问层会被 403，故不再下发误导性直链（前端消费的是 filePath，
      // 交付后预览/下载分别走预览载荷与 download-start 链路）。字段保留空串兼容响应形状。
      return {
        filePath: result.filePath,
        url: '',
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size
      }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /**
   * POST /api/upload/note-image — 备注附图（R19，需登录）
   * 存入 notes/{artistId}/ 目录，签名 URL 返回
   * 白名单：图片格式（同 references，JPG/PNG/WebP/GIF，10MB）
   */
  fastify.post('/api/upload/note-image', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(`upload-note:${request.ip}`, 20, 10 * 60_000)) {
      return reply.code(429).send({ error: '上传过于频繁，请稍后再试' })
    }

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    if (safeExt(data.filename, ALLOWED_EXTENSIONS) === null || !ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.code(400).send({ error: '仅支持 JPG / PNG / WebP / GIF 格式的图片' })
    }

    try {
      // R19: 用 artistId 分目录（上传时备注尚未创建，无 orderId 可用）
      const result = await saveUpload(data, join('notes', String(request.artist.id)), UPLOAD_DIR)
      if (!result) return reply.code(400).send({ error: '文件大小超过10MB限制' })

      return {
        filePath: result.filePath,
        url: signedUrl(result.filePath),
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size
      }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })
}
