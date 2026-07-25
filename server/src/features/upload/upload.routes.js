import { requireAuth } from '../../shared/middleware/auth.js'
import { mkdirSync, existsSync, unlinkSync, statSync } from 'fs'
import { join, extname, resolve } from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { nanoid } from 'nanoid'

// ============================================
// 文件上传路由
// UPLOAD_DIR 优先由 app.js 通过插件选项传入，保证与静态服务路径一致
// ============================================
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const RECOMMENDED_TYPES = ['image/webp', 'image/jpeg', 'image/png']

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
 * @param {object} data - multipart file data
 * @param {string} subDir - 子目录（如 'images/1'）
 * @param {string} uploadDir - 上传根目录（由插件传入）
 */
async function saveUpload(data, subDir, uploadDir) {
  const ext = extname(data.filename) || '.png'
  const fileName = `${nanoid(12)}${ext}`
  const fullPath = join(uploadDir, subDir)

  if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true })

  const filePath = join(subDir, fileName)
  const absPath = join(uploadDir, filePath)

  await pipeline(data.file, createWriteStream(absPath))

  // 截断检查：超限则删除残留文件
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
   */
  fastify.post('/api/upload/image', { preHandler: requireAuth }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

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
  })

  /**
   * POST /api/upload/reference — 参考图（备用接口，客户下单用）
   */
  fastify.post('/api/upload/reference', async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    const result = await saveUpload(data, 'references', UPLOAD_DIR)
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
  })

  /**
   * POST /api/upload/deliverable — 交付文件（需登录）
   */
  fastify.post('/api/upload/deliverable', { preHandler: requireAuth }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: '未收到文件' })

    const result = await saveUpload(data, join('deliverables', String(request.artist.id)), UPLOAD_DIR)
    if (!result) return reply.code(400).send({ error: '文件大小超过限制' })

    return {
      filePath: result.filePath,
      url: `/uploads/${result.filePath}`,
      originalName: data.filename,
      mimeType: data.mimetype,
      size: result.size
    }
  })
}
