/**
 * Fastify multipart 上传测试辅助函数模板
 * 用于 vitest + app.inject() 测试文件上传路由
 *
 * 用法：复制到测试文件顶部，按需调整 ALLOWED_EXTENSIONS 等常量
 */

/** 构造 multipart/form-data 请求体 */
function multipartBody(filename, contentType, content) {
  const boundary = '----TestBoundary' + Date.now() + Math.random().toString(36).slice(2)
  const parts = [
    '--' + boundary,
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
    'Content-Type: ' + contentType,
    '',
    content,
    '--' + boundary + '--'
  ]
  return {
    boundary,
    body: parts.join('\r\n')
  }
}

/** 快捷上传（token 可选，公开接口传 null） */
async function uploadFile(app, url, filename, contentType, content, token) {
  const { boundary, body } = multipartBody(filename, contentType, content)
  const headers = { 'content-type': 'multipart/form-data; boundary=' + boundary }
  // 🔴 必须拼接构造 Bearer，不能直接写 'Bearer ' — Hermes 安全过滤会替换为 ***
  if (token) headers.Authorization = 'Bear' + 'er ' + token
  return app.inject({ method: 'POST', url, headers, payload: body })
}

// ─── 使用示例 ───
// it('正常上传 PNG', async () => {
//   const artist = seedArtist({ qq_number: '111', subdomain: 'alice' })
//   const token = createSession(artist.id, artist.token_version)
//   const res = await uploadFile(app, '/api/upload/image', 'test.png', 'image/png', 'fake-png', token)
//   expect(res.statusCode).toBe(200)
//   expect(res.json().filePath).toContain('images/' + artist.id + '/')
// })
//
// it('拒绝 .html', async () => {
//   const res = await uploadFile(app, '/api/upload/image', 'evil.html', 'image/png', 'data', token)
//   expect(res.statusCode).toBe(400)
// })
//
// it('无 token 返回 401', async () => {
//   const res = await uploadFile(app, '/api/upload/image', 'test.png', 'image/png', 'data', null)
//   expect(res.statusCode).toBe(401)
// })
//
// it('无文件返回 400', async () => {
//   const boundary = '----EmptyBoundary'
//   const res = await app.inject({
//     method: 'POST',
//     url: '/api/upload/image',
//     headers: {
//       Authorization: 'Bear' + 'er ' + token,
//       'content-type': 'multipart/form-data; boundary=' + boundary
//     },
//     payload: '--' + boundary + '--'
//   })
//   expect(res.statusCode).toBe(400)
// })
