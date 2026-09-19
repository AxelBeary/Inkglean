# 派工行号漂移侦察 + 开工前验证 + "零发现即交付"

## 行号会漂移，符号是永恒的
派工文件引用的行号是一号审计时刻的快照，开工时可能已完全错位（v0.36 实例：L5 旧行号 zh-CN.js:438/475/738 全部失效；同批 L200-205 却恰好还在原位）。纪律：
- 不要直接按行号 `read_file offset=`，先用 search_files 搜符号（TL_ZOOMS、tlZoom2m、getAddons…）定位真实位置。
- 派工文件自己标注"行号已漂移/已失效"的条目，一律视为需要全量重新扫描。

## "修复项"开工前先验证 —— 零发现是合法交付
条目可能早已被修掉或根本不存在（v0.36 L5"i18n 空字符串 3 处"：双轮扫描实测 0 处）。纪律：
- 跑可验证的扫描并保留证据（脚本输出/命令结果），交付报告写"扫描 N 处、发现 M 处、无需修改"。
- 绝不为了让条目"看起来被修了"去改无关代码。
- 建议双保险：regex 快扫（查漏）+ 确定性方法（定案）。i18n 空串的确定性方法见 scripts/scan-empty-i18n.mjs。

## i18n 空字符串审计
- Regex 只能抓单行 `key: ''`；漏数组元素、模板串、纯空白串、多行值。PowerShell 里写这类 regex 还要和反引号/引号转义搏斗，不值得。
- 定案方法：Node 里 `import()` locale 模块，深度遍历所有叶子字符串（含数组元素），报 `trim()===''` 的 path。脚本：`scripts/scan-empty-i18n.mjs`（exit code 1 = 有发现，可当门禁）。
- 用法（在仓库根）：`node <skill>/scripts/scan-empty-i18n.mjs web/src/locales/zh-CN.js web/src/locales/en.js`，或把脚本拷进 worktree 跑完删除。

## 删前端封装前先确认零调用点
L0 类任务（配合后端端点删除，删 api/index.js 封装）：先对每个符号 search_files `\b(name)\b` 全 web/src，确认除定义行外零消费方。注意排除同名干扰（定义文件本身、新模型的相似封装如 AddonTemplate vs 旧 Addon）。搜索结果留底，写进交付报告。

## 前端范围校验以服务端测试为语义依据
给后端 schema 补前端前置校验（L3 类任务）时，权威语义在服务端 service 测试里，不在派工一句话描述里。v0.36 实例：server/tests/quota-pool.test.js 证明 addPayment 拒绝零金额、负数必须带 note、超额收款后端不拦 → 前端"超剩余应付拦截"是纯 UX 增强，可安全实施。

## 工具注意（Windows + PowerShell 7）
- 递归内容搜索用 search_files 工具；PowerShell `Select-String` 没有 `-Recurse` 参数（直接抛 ParameterBindingException）。要递归只能 `Get-ChildItem -Recurse | Select-String`。
- 临时扫描脚本（.py/.mjs）用完必须删除，不进 commit。
