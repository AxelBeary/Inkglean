# 技术成熟度评估框架（用户问"和投产项目比"时使用）

用户会问"我们的工作流怎么样？和真正投产项目比？"。这不是闲聊——结论影响下版本排期。

## 评估维度（按投入产出排序）

| 维度 | 检查方法 | 当前水平 | 投产标准 |
|------|----------|----------|----------|
| 类型安全 | 搜 `allowJs`/`tsconfig` | 纯 JS，运行时才炸 | TypeScript 编译期拦截 |
| E2E 测试 | 搜 `playwright`/`cypress` | 零，全靠用户手动点 | 5+ 关键路径自动覆盖 |
| CI 门控 | 读 `.github/workflows/ci.yml` | 存在但不阻塞合并 | PR 不过 CI 不能 merge |
| 视觉回归 | 搜 `chromatic`/`percy` | 无 | 截图对比 |
| 监控告警 | 搜 `sentry` | 无 | 前后端错误实时通知 |
| 部署 | 读 `docker-compose.yml` | 手动 `docker compose up` | CI/CD 自动 + 回滚 |
| 数据库 | 读 `init.js` | 单 SQLite 文件 | 主从/PostgreSQL |

## 判断原则

1. **当前规模决定优先级**：画师约稿平台日活几百，不需要 Kubernetes。SQLite 够用。
2. **收益最大的三件事**（v0.20-v0.22 逐步做）：
   - TypeScript 渐进迁移（`allowJs: true`，新文件 TS，旧文件逐步转）~8-12h
   - Playwright E2E 冒烟（5 条关键路径）~4h
   - Sentry 错误监控（前端 `@sentry/vue` + 后端 `@sentry/node`）~1h
3. **过度工程的信号**：用户量没起来就做灰度发布、服务网格、分布式追踪。
4. **一句话总结格式**：「工作流 X 分，项目结构 Y 分，瓶颈在 Z 不在 W。」

## 前端性能快速审计

```powershell
# 主包体积
Get-ChildItem web/dist/assets/*.js | Sort-Object Length -Descending | Select-Object -First 5 Name, @{N='KB';E={[math]::Round($_.Length/1KB)}}
# 懒加载覆盖
search_files pattern='loading="lazy"' path=web/src file_glob=*.vue output_mode=count
# EP 引入方式
search_files pattern='import ElementPlus' path=web/src
# 大型库动态引入
search_files pattern='vuedraggable' path=web/src
```
