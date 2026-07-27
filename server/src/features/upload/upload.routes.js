import { requireAuth } from '../../shared/middleware/auth.js'
import { mkdirSync, existsSync, unlinkSync, statSync } from 'fs'
import { join, extname, basename, resolve, sep } from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { nanoid } from 'nanoid'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'

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

/**
 * P0-B: 安全扩展名提取 — basename 剥路径成分 + 正则限字符集
 */
function safeExt(filename, allowList) {
  const ext = extname(basename(String(filename || ''))).toLowerCase()
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return null
  return allowList.includes(ext) ? ext : null
}

function checkFileType(mimeType, fileName) {
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

/**
 * 保存上传文件，截断时自动清理残留
 * P0-B: 路径穿越纵深防御 — 最终路径必须在 uploadDir 内
 */
async function saveUpload(data, subDir, uploadDir) {
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

  await pipeline(data.file, createWriteStream(absPath))

  if (data.file.truncated) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    return null
  }

  const size = statSync(absPath).size
  return { filePath, absPath, size }
}

/**
 * 交付文件专用保存（允许更多格式）
 */
async function saveDeliverable(data, subDir, uploadDir) {
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

  await pipeline(data.file, createWriteStream(absPath))

  if (data.file.truncated) {
    try { unlinkSync(absPath) } catch { /* ignore */ }
    return null
  }

  const size = statSync(absPath).size
  return { filePath, absPath, size }
}

export default async function uploadRoutes(fastify, opts) {
  const UPLOAD_DIR = opts.uploadDir || resolve(process.env.UPLOAD_DIR || './uploads')

  await fastify.register(import('@fastify/multipart'), {
    limits: { fileSize: MAX_FILE_SIZE, files: 5 }
  })

  /**
   * POST /api/upload/image — 作品图/档位示例图（需登录）
   * P0-B: 加限流（20次/10分钟）
   */
  fastify.post('/api/upload/image', { preHandler: requireAuth }, async (request, reply) => {
    if (!rateLimit(`upload-img:${request.ip}`, 20, 10 * 60_000)) {
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
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/upload/reference — 参考图（客户下单用，公开）
   * P0-B: 加限流（10次/10分钟，公开接口需更严格）
   */
  fastify.post('/api/upload/reference', async (request, reply) => {
    if (!rateLimit(`upload-ref:${request.ip}`, 10, 10 * 60_000)) {
      return reply.code(429).send({ error: '上传过于频繁，请稍后再试' })
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

      return {
        filePath: result.filePath,
        url: signedUrl(result.filePath),
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size,
        typeWarning: typeCheck.recommended ? null : typeCheck.message
      }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/upload/deliverable — 交付文件（需登录，允许更多格式）
   * P0-B: 加限流（20次/10分钟）
   */
  fastify.post('/api/upload/deliverable', { preHandler: requireAuth }, async (request, reply) => {
    if (!rateLimit(`upload-deliver:${request.ip}`, 20, 10 * 60_000)) {
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

      return {
        filePath: result.filePath,
        url: signedUrl(result.filePath),
        originalName: data.filename,
        mimeType: data.mimetype,
        size: result.size
      }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
