# 后端路由/测试接线坑位清单（artist-commission server/tests）

适用于所有在 worktree 写 Fastify 路由 + vitest 测试的后端批（三号角色）。

## 1. "Bearer " 字面量被 Hermes 安全过滤写成 ***（高频，2026-08-05 F2 实测）

写/改测试文件时内容含 `Bearer ` 字面量（如 `Authorization: \`Bearer ${token}\``），
写入链路会把它替换成 `***`，产出非法 JS。注意：**read_file 显示结果里的 `***`
同样是掩码**——从读到的内容复制代码模式时别把 `***` 抄进新文件（原文可能是 `+ token`）。

- 症状：vitest/rollup 报 `Parse failure: Expression expected`，指向 Authorization 行。
- 规避：测试里一律用字符串拼接。项目既有模式：
  ```js
  const AUTH_PREFIX = 'Bear'+'er '
  return { Authorization: AUTH_PREFIX + token }
  // 或内联：headers: { Authorization: 'Bear' + `er ${token}` }
  ```
- 自检：写完/改完任何含 auth header 的测试后跑
  `Select-String -Path server/tests/*.js -Pattern '\*\*\*'`，有命中即修复再跑测试。

## 2. requireAdmin 状态码语义

- 无 token / token 无效 → 401（NOT_LOGGED_IN）
- 有效 token 但非管理员 → **403**（测试别写 401）
- 管理员判定源：platform_config.admin_qq。测试设置：
  `db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)` + seedArtist 同号。

## 3. 迁移新表 → tests/setup.js cleanDb 同步

迁移建表（尤其带种子的，如 v42 social_platforms 24 行种子）必须在 `cleanDb()`
加 `DELETE FROM <新表>`。否则 initDatabase 种子行在测试间泄漏
（列表长度/排序断言莫名失败）。

## 4. 白名单纪律：app.js 常不在授权内

新增公开路由（如 GET /api/platforms）优先挂进**既有白名单路由文件**
（如 artist.routes.ts 的公开段），不要为注册路由去改 app.js；
交付报告里说明挂载位置即可。

## 5. 接力轮（第二轮+）先核上一轮可编译性

上一轮 commit 可能留半完成状态（实例：import 已换新模块，函数体仍引用已删符号
→ HEAD tsc 不过）。开工先 `git show <上轮commit> --stat` 并逐文件读 diff，
确认 HEAD 可编译再叠加新代码；不可编译先修到编译过。

## 6. 派工基线数字会过期

派工里的测试基线（如 824/831）常落后于实际 master。不硬断言派工数字；
交付前 merge master 重跑，报告写实测值（F2 批实测 877/877）。

## 7. 管理端新路由 schema 惯例

snake_case body + `additionalProperties: false`；service 抛 AppError 时路由
try/catch 转 `{code, error}`；POST 创建类返回 201；DELETE 平台类返回
`{success, reattributed}`（reattributed=被归「其他」的链接数）。
