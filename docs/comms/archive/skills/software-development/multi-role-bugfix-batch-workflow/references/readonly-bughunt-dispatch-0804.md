# 只读挖 Bug 派工（五号）——禁区规则 + 并行子代理 + 容器内对照脚本

> 来源：2026-08-04 一号派工「存量代码挖 Bug（只定位不修）」，5 方向 + 禁区，五号执行。
> 适用：一号派工的「挖 bug / 排查研究」任务，模式=只读审计，不改代码不建分支。

## 禁区规则（并行开发期必备）

派工常带**禁区**（其他角色正在重写的文件域，挖了也会被覆盖）：

1. 禁区内的发现**也记下来**，但标注「vXX 重构区，合入后复查」——不花时间深挖
2. 报告单列「禁区相关清单」段，每条写明文件 + 行号 + 复查时机
3. 非禁区照常深挖；修复方案照常写，但涉及禁区文件的修复注明「等合入后做」
4. 修复只动 locales/comms 等非禁区文件时可以先行（例：STYLE_* 错误码的 i18n 键缺失，修 locales 不碰 style.service）

## 并行策略：自己挖方向 + 子代理扫广度

- **自己**：按派工方向逐个深挖（每个方向一个专项脚本或逐路由核对），证据链闭合再下一个
- **子代理 ×2 并行**（leaf，只读指令写死在 goal 里）：
  - task-0：前端交互 bug（静默吞错/竞态/拖拽/回滚/三态/校验缺口，逐类给 file:line）
  - task-1：代码质量 + 授权（console.log/TODO/死代码/未用 import + admin 路由中间件核对 + i18n 键 diff）
- **子代理发现必须逐条回源码核实行号**后才并入报告，不直接采信
- **子代理"报错"≠失败**：先读 `cache/delegation/live/<id>/manifest.json` 的 status，再读 summary 文件——回传失败时成果在磁盘上（详见 codebase-audit skill 对应 pitfall）

## 三个高价值对照脚本（临时文件，跑完即删）

### 1. 后端错误码 vs locales 键 diff（tmp-keydiff.mjs）

找 i18n 缺键的确定性方法（比目测强）：

```js
// 从 errors.ts 提取 E 对象全部错误码（KEY: 'KEY' 形态）
const codes = [...src.matchAll(/^\s{2,4}([A-Z][A-Z0-9_]+):\s*'\1',?$/gm)].map(m => m[1])
// locale 文件是 ESM，用 pathToFileURL 动态 import
const zh = (await import(pathToFileURL(`${ROOT}/web/src/locales/zh-CN.js`))).default
// set diff：后端有/前端缺（前端拦截器回退显示后端原文）；孤儿键；空值；含 {占位符} 的键
```

一次找出 56 个缺失键（本项目 122 码 vs 68 键）。同时列出含 `{xxx}` 占位符的键——这些需要前端传参插值，是同类 bug 候选。

### 2. 种子数据 vs 真实表结构 diff（容器内跑 tmp-demodiff.cjs）

demo-data/seed 的 INSERT 列 vs 迁移后的真实表列——**必须在容器内跑**（宿主机的 schema 可能没跑全迁移）：

```js
// 正则解析脚本里所有 INSERT INTO xxx (col,...) 的列清单
const re = /INSERT INTO (\w+)\s*\(([^)]+)\)/gi
// 容器内连真实 DB：PRAGMA table_info(表) 拿全列
// 报三类：幻影列（demo 写了表没有→INSERT 崩）/ NOT NULL 无默认值漏写（硬伤）/ nullable 漏写（列出人工判断）
```

docker cp 进容器 → `docker exec -w /app/server <容器> node tmp-xxx.cjs`。

### 3. 公开路由守卫一致性（逐条核对表）

grep 出所有 `/api/public/*` 路由，逐条列成表：路由 | 有无 hidden 过滤 | 有无管理员账号过滤 | 对照范式文件行号。缺过滤的就是发现。注意：**服务层的点赞/计数类操作要追到 service 看**（路由层可能不查画师状态）。

## 报告结构（一号指定格式）

每个 bug：现象 → 根因（代码证据，行号）→ 修复方案 → 风险等级 → 涉及文件。末尾按风险分级汇总表。另加：

- ✅ 干净结论段（零发现的方向也要写，附验证方法，证明查过不是漏查）
- 禁区相关清单（标复查时机）
- 子代理说明段（若 UI 报错过：说明成果核实方式 + 发现归属）

## 纪律

- 临时脚本跑完即删（本地 + 容器内），git status 只剩报告一个未跟踪文件
- 报告写 docs/comms/05-to-01-挖bug报告-{日期}.md，docs-only 可直接 commit
- 转交一句话格式：「五号转交一号，文件：docs/comms/xxx.md，只定位不修，等授权。」
