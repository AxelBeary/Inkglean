# 自主扫描检查清单（Proactive Bug Scan Checklist）

用于五号"proactive scan mode"。每项给出搜索模式 + 判定标准。

## 后端（server/src/）

### 1. SQL 注入面
```
搜索: \$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)
搜索: (?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM).*\$\{
```
**判定**：模板字符串拼接 SQL 时，动态部分必须来自硬编码白名单（如 `allowed` 数组）或常量（如 `ACTIVE_ORDER_SQL`）。若动态部分来自用户输入且无白名单门控 → 真 Bug。
**已知安全模式**：`updates.push('column = ?')` + `values.push(value)` 参数化；`allowed.includes(key)` 门控。

### 2. JSON.parse 无 try-catch
```
搜索: JSON\.parse
```
**判定**：DB 来源的 JSON 字符串（TEXT 列）可能损坏。每处 `JSON.parse` 必须有 try-catch + 降级返回值（`[]`、`null`、`{}`）。`package.json` 读取（构建时确定存在）和 HMAC 签名验证后的 payload（已验签）可豁免。

### 3. eval / new Function
```
搜索: eval\(|new Function\(
```
**判定**：零容忍。任何匹配 = 真 Bug（本项目应为 0 匹配）。

### 4. 事务保护
```
搜索: db\.transaction
```
**判定**：多步写操作（INSERT + UPDATE、多表 UPDATE）必须包裹在 `db.transaction()` 中。逐个检查多步写操作是否有事务。

### 5. TODO/FIXME/HACK
```
搜索: TODO|FIXME|HACK|XXX|WORKAROUND
```
**判定**：记录但不算 Bug。已知计划项（如 Phase 2 QQ Bot）标注为"已知"。

## 前端（web/src/）

### 6. v-html XSS
```
搜索: v-html
```
**判定**：每处 `v-html` 的数据源必须经过 `sanitizeHtml()`（DOMPurify）处理。直接绑定原始数据 = 真 Bug。

### 7. 空 catch 吞错
```
搜索: \.catch\(\s*\)|catch\s*\{\s*\}
```
**判定**：前端零容忍（静默吞错导致用户无反馈）。后端 GC/清理类操作的空 catch 可接受（有注释说明）。

### 8. .toFixed() 空值崩溃
```
搜索: \.toFixed\(
```
**判定**：调用 `.toFixed()` 的值必须保证是数字。安全模式：`(x ?? 0).toFixed(2)`、`computed(() => ... ?? 0)`。若值来自 API 且无 `?? 0` 保护 → 潜在崩溃。

### 9. parseInt 无基数
```
搜索: parseInt\([^,)]+\)
```
**判定**：`parseInt(x)` 无第二参数在极端情况下可能误解析（如 `0x` 前缀）。路由参数 `parseInt(request.params.id)` 风险低（Fastify schema 已约束），但最佳实践是 `parseInt(x, 10)`。仅记录，不算 Bug。

## 通用

### 10. 路由鉴权覆盖
```
搜索: preHandler|onRequest.*auth|authenticate（在 *.routes.js 中）
```
**判定**：所有 `/api/admin/*` 路由必须有 `preHandler: requireAdmin`。所有画师数据修改路由必须有 auth 中间件。公开路由（health、客户查看）可豁免。

### 11. 测试套件 + lint + 构建
```
cd server && npx vitest run
cd web && npx eslint . && npm run build
```
**判定**：全绿 = 基线健康。任何失败先排除环境问题（stale node_modules），再判定为代码问题。

## 扫描效率提示

- 每轮 batch 3-4 个独立搜索（同一 turn 多个 search_files 调用）
- 命中后 read_file 看上下文 10-20 行即可判定，不必读全文件
- 本项目防御模式成熟（白名单、try-catch、sanitize），大部分命中是假阳性
- 最终输出：一张表（检查项 / 结果 / 证据），没问题就直说没问题
