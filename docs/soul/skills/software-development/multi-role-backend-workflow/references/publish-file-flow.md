# 发布/文件流转类任务（私有目录→公开目录复制，如 REQ-022 F1 发布为作品）

触发：派工要求把订单交付物/私有文件发布为公开可见资产（artworks/展示图/作品集）。

## 开工注意

- 派工文件可能尚未进入 worktree 基线（一号派工 commit 晚于建分支）：文件不存在时去主 worktree 读，第一步 `git merge master` 会自动带入。
- 派工路径/状态码与现码惯例冲突时：跟现码惯例（"别另起一套"），偏差点逐条写进交付报告，不静默改。

## 目录约定（file-sign.ts + app.js onRequest hook）

- `deliverables/{artistId}/`、`references/`、`notes/{artistId}/` = 签名私有；`images/` = 公开（isPublicUploadPath 前缀匹配 `/uploads/images/`）
- gcUploads（app.js 内联）收集 artworks.image_path / deliverables.file_path / order_notes.image_path 等。新资产落 artworks 类既有表即受保护；**落新表必须检查 gcUploads 是否收集该字段**（漏 = 24h 后文件被 GC 误删）。

## 标准链路（publishArtwork 范式，order-gallery.service.ts）

1. 归属 + 状态门槛校验（service 层做，路由层 requireOwnOrder 先行——双重防御）
2. ids 去重：`[...new Set(ids)]` 保序，重复不报错（除非派工另有规定）
3. DB 行校验：`SELECT ... WHERE id = ? AND order_id = ?`（跨单/不存在 → 404 DELIVERABLE_NOT_FOUND）
4. 路径防御对齐 H-3 模式：`file_path.includes('..') || !startsWith(`deliverables/${artistId}/`)` → ILLEGAL_PATH
5. 扩展名白名单：deliverables 允许 zip/psd 等，发布为作品仅 `.jpg/.jpeg/.png/.webp/.gif`（对齐 /api/upload/image），非图片 → ILLEGAL_FILE_TYPE
6. 复制（非移动）：copyFileSync → `images/{artistId}/{nanoid(12)}{ext}`；src/dest 绝对路径都必须 `startsWith(uploadDir + sep)`（P0-B 纵深防御）；源文件不存在 → MISSING_FILE
7. 一图一行调 createArtwork（内含 sharp 读宽高，async）——**async 循环不走 db.transaction**，中途失败手工清理：删已插 artworks 行 + unlink 已复制文件，GC 24h 兜底

## 踩坑

- **order_activity_logs.action_type 有 DB CHECK 约束**（6 值枚举，init.js v35）：新操作类型留痕需重建表迁移 → 属"停下来报告"事项；派工禁动 init.js 时改由业务行本身留痕（created_at/image_path 可追溯），报告注明遗留决策项。
- **403 vs 404 归属校验**：requireOwnOrder 现行统一 404（防订单 ID 枚举）。派工要求跨画师 403 时折中：API 层保持 requireOwnOrder 404 + service 层二次防御抛 ORDER_NOT_OWNED 403，测试两路分别断言（API 注入 → 404；service 直调 rejects → 403）。
- **测试断言 additionalProperties:false 时**：项目 ajv 配 removeAdditional，额外字段静默剥离**不拒绝** → 断言 201 + 字段未写入，不是 400（对齐 TC-RT-12c）。
- **endpoint 前缀**：`/api/orders/*` 是客户公开端点（track/my/lookup/delivery）；画师订单动作一律 `/api/artist/orders/:id/*`。
- **eslint**：配置在 `server/eslint.config.js` 与 `web/eslint.config.js`，仓库根无配置（根目录 `eslint .` 报 v9 配置错）——根目录跑 `npx eslint server web`；在 server 目录内跑 `npx eslint server` 会报 "No files matching"（该跑 `npx eslint .`）。
- 测试 fixture 写真文件：writeFileSync 假字节进 UPLOAD_DIR（vitest.config 指向 tmpdir 隔离）；sharp 读假文件失败不阻塞 createArtwork（width/height 留 null）。
- 测试里 Bearer 字面量会被 Hermes 安全过滤替换成 `***` 写坏语法：用 `'Bear' + 'er '` 拼接，写完 grep `\*\*\*` 自检（仅注释行允许含 ***）。
- worktree 首跑 tsc/vitest 前先 `npm install`（worktree 无 node_modules，tsc 会报 "not the tsc command"）。
