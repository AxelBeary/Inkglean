# F5 留言筛选（2026-08-05）：approve-scripts 污染 package.json + worktree 核验器盲区

## 任务概要
REQ-022 F5 管理后台留言三维筛选（画师/审核状态/是否已回复）：后端 WHERE 动态参数化 + 路由 query 透传（status 白名单非法值忽略）+ 前端三个 clearable 下拉（变更即重请求后端）+ el-tag 英文枚举 i18n 化。低风险零 schema 变更。分支 f5-guestbook-filter，commit b42a0fd，server 845（基线 831 + 新增 14）/ web 192 / tsc 0 / eslint 0。

## 坑 1：npm approve-scripts 静默写 package.json（授权外污染）
worktree 装依赖时 allow-scripts 插件拦 esbuild postinstall，放行命令：
```
npm approve-scripts --allow-scripts-pending   # 看 pending 列表
npm approve-scripts esbuild                    # 放行并补装
```
**副作用**：该命令会往所在目录 package.json 写入 `"allowScripts": { "esbuild@x.y.z": true }` 块。package.json 几乎永远不在授权文件列表 → 直接构成越权改动。
**处置**：提交前 `git status --short` + `git diff --stat` 必查；发现后 `git checkout -- server/package.json web/package.json` 还原，再逐个 `git add <授权文件>`。本批就是在提交纪律核对步骤逮住的，未入库。

## 坑 2：核验器只认工作区根（主仓）的 canonical 命令
Hermes 核验器在会话 workspace 根 = 主仓 `artist-commission` 下检测 canonical 命令（vitest/tsc/eslint/build）；**worktree（如 artist-commission-f5）内跑的全套不被识别**，即使全部通过仍提示"未检测到已验证的命令"。
**处置**：按核验器指引在系统 Temp 下建 `hermes-verify-` 前缀的临时 ad-hoc 脚本跑聚焦检查（改动相关测试文件 + tsc + 仅改动文件 eslint + build），跑完清理。
**同意超时**：临时脚本执行时用户同意弹窗超时未确认 → 系统返回 BLOCKED 且明令禁止重试/换写法绕过。此时如实汇报"正式套件已验证全绿 + ad-hoc 脚本未跑"，把重跑选择权交回用户，绝不伪造验证结果。

## 可复用模式
- 后端筛选 WHERE 动态拼装 + `?` 参数占位 + 枚举白名单（非法值忽略，与全站列表惯例一致）——通用，可移植到其他列表端点。
- HTTP 层管理员测试惯例：`setAdmin()` 写 platform_config + `createSession(artist.id, artist.token_version)` 取 token + `app.inject()`，照 `admin.routes.test.js` 抄。
- service 层筛选用共享 `seedFilterFixture()` 造数函数覆盖多例（approved+已回复 / pending 未回复 / 他人 rejected 三条正交样本）。
