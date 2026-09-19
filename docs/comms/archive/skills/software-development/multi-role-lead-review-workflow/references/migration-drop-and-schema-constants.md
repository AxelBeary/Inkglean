# DROP 表迁移：三重防御 + schema 常量重建陷阱（v43 实例）

> v38 事故规则（事务外 + 关 FK）的完整工程化版本。2026-08-05 v43 DROP price_addons/addon_tiers 实录。

## DROP 前三件事（缺一不可）

1. **数据面冻结证据**写进迁移注释：零生产写路径 / 存量数据清点（几行、是否垃圾）/ 0 订单（0 业务）引用 / 无下游 FK
2. **用户拍板**（DROP 属高风险操作）+ **迁移前备份**：`data/commission.db.bak-pre-vN`（better-sqlite3 backup API，WAL 一致性），备份文件名写进交付报告；容器部署的备份由一号重建前另行执行
3. 版本号查证：别撞已占用版本号（v42 被占就用 v43）

## 迁移代码三重防御（审核逐条对照）

```js
{
  name: 'drop_xxx_tables',
  noTransaction: true,              // ① 事务外（事务内 PRAGMA foreign_keys 是 no-op，v38 事故根因）
  up(database) {
    database.pragma('foreign_keys = OFF')
    const fkState = database.pragma('foreign_keys', { simple: true })
    if (fkState !== 0) throw new Error('...未能关闭，中止 DROP 以防 CASCADE 清空子表')  // ② 关 FK 后回读校验，不为 0 即中止
    database.exec('DROP TABLE IF EXISTS 子表')   // 先子后父
    database.exec('DROP TABLE IF EXISTS 父表')
    const violations = database.pragma('foreign_key_check')
    if (violations.length) throw new Error('...悬空引用，中止: ' + JSON.stringify(violations.slice(0,3)))  // ③ DROP 后零悬空验证
    // finally 恢复 foreign_keys = ON
  }
}
```

## ⚠️ 独有陷阱：schema 常量重建（v43 实测抓出）

init.js 除迁移外还有一个 `schema` 常量，**initDatabase 每次重跑都执行**，内含 `CREATE TABLE IF NOT EXISTS <所有表>`。迁移 DROP 掉的表若不同步从 schema 常量删除定义 → **重跑 initDatabase 会把表静默重建回来**，DROP 白做。

- 同批删除 schema 常量中的表定义；已发布的历史迁移内容不动（全新库走历史迁移建表 → vN DROP，顺序正确）
- 必配幂等测试：重跑 initDatabase 不报错 **且两表仍不存在**（v43 的 TC-MV-02 就是这条抓出 bug 的）
- 另配：DROP 已应用断言 + 活表（如 price_tiers）不受影响断言

## 审核 checklist（一号用）

- [ ] noTransaction:true + FK 关闭回读校验 + foreign_key_check 三重防御齐
- [ ] schema 常量同步删定义（grep `CREATE TABLE IF NOT EXISTS <表名>` 全仓零命中）
- [ ] 幂等测试含"重跑后表仍不存在"断言
- [ ] 备份文件名在交付报告里
- [ ] 独立复跑全量测试（含 tsc/lint）
