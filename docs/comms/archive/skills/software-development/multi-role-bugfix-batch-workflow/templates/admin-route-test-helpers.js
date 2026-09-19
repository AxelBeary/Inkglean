/**
 * admin 路由测试辅助模式（从 admin.routes.test.js 提取）
 *
 * 核心：管理员身份由 platform_config 表的 admin_qq 行决定，
 * 不是环境变量。测试中直接 UPDATE 该行即可切换管理员。
 */
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession, generateLoginCode } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

/** 设置管理员：写 platform_config + 创建管理员画师行 */
function setAdmin(qqNumber) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 构造管理员 Bearer token */
function adminToken(artist) {
  return createSession(artist.id, artist.token_version)
}

// 使用示例：
// beforeEach(async () => {
//   cleanDb()
//   app = await buildApp({ logger: false })
//   await app.ready()
// })
//
// it('管理员路由', async () => {
//   const admin = setAdmin('10001')
//   const res = await app.inject({
//     method: 'GET',
//     url: '/api/admin/artists',
//     headers: { Authorization: `Bearer ${adminToken(admin)}` }
//   })
//   expect(res.statusCode).toBe(200)
// })

// transfer 测试需要 generateLoginCode：
// const { code: code1 } = generateLoginCode('10001')  // 当前管理员码
// const { code: code2 } = generateLoginCode('20002')  // 新管理员码
// payload: { newQq: '20002', currentCode: code1, newCode: code2 }

// 回收站测试需要文件系统（admin.service.test.js 模式）：
// import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
// const binRoot = join(resolve(process.env.UPLOAD_DIR), '.recycle-bin')
// afterEach(() => { if (existsSync(binRoot)) rmSync(binRoot, { recursive: true, force: true }) })
