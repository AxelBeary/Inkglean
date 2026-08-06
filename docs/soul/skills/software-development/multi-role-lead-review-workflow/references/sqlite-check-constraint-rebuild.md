# SQLite CHECK 约束漂移与重建表迁移（枚举合法化场景）

## 问题本质

CHECK 约束**焊死在存量表的建表语句里**：
- `ALTER TABLE ADD COLUMN` 只加列，**不更新**已有列的 CHECK
- init.js 顶部的 schema 字符串只用于**新库**建表；存量库的表结构由历史迁移决定
- 结果：代码里 schema 写了 `CHECK(status IN ('open','full','break','hidden'))`，但存量库 artists 表实际约束可能仍是三值——**两边漂移**

v0.35 实例：hidden 状态 v0.13 就加了，应用层白名单（artist.service updateArtist）一直支持，但存量 artists 表 CHECK 三值焊死。画师自己设 hidden 也会 500（SQLITE_CONSTRAINT_CHECK），只是从未有人走过这条路所以从未暴露。用户拍板给管理员补 hidden 能力时才炸出来。

**诊断第一步**（改任何枚举合法化前必查）：
```sql
SELECT sql FROM sqlite_master WHERE type='table' AND name='artists';
```
看存量表**真实**约束。容器内用 python sqlite3 从宿主机查或写临时脚本 docker cp 进去跑（WAL 锁注意）。

## 枚举合法化 4 层检查（缺一层 = 功能断）

1. **sqlite_master CHECK**（存量表真实约束）——需要重建表迁移
2. **前端实际调用的路由的枚举/白名单**——同一字段常有多个路由各自硬编码（本项目：`PUT /artists/:id/status` 路由内硬编码 vs `PUT /artists/:id/profile` schema enum；前端 ArtistManage 下拉调的是前者）。先 grep 前端调哪个 API 方法 → 对应哪个路由
3. **service 层白名单**（updateArtist 的 `['open','full','break','hidden'].includes` 校验）
4. **前端 UI options + i18n**（el-option 加值 + 状态标签色映射 + zh/en 文案）

## 重建表迁移模式（v38 定稿版）

SQLite 修改 CHECK 只能重建表。关键原则：**不手抄列清单**（手抄漏了 quick_actions 列，迁移当场失败，容器进入 crash loop）——用原表 CREATE 语句做字符串替换：

```js
{
  version: 38,
  name: 'artists_status_check_add_hidden',
  up(database) {
    const tableSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'"
    ).get()
    // 幂等守卫：已含 hidden 则跳过（新库建表即带 hidden 也跳过）
    if (tableSql && tableSql.sql.includes("'hidden'")) return

    // 备份（与 v37 同模式，失败不阻塞）
    // ...copyFileSync(dbPath, dbPath + '.bak.v38')...

    const cols = database.prepare('PRAGMA table_info(artists)').all().map(c => c.name)
    const colList = cols.join(', ')

    // 用原表 CREATE 语句重建，只替换 status 的 CHECK——永不漏列
    const newSql = tableSql.sql
      .replace(/^CREATE TABLE artists\b/i, 'CREATE TABLE artists_new')
      .replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i,
        "CHECK(status IN ('open', 'full', 'break', 'hidden'))")
    if (newSql === tableSql.sql) return // 没找到 CHECK，跳过

    database.pragma('foreign_keys = OFF')
    try {
      // ⚠️ 索引定义必须在 DROP 前抓取（DROP TABLE 连索引一起删，之后查 sqlite_master 就没了）
      // sql IS NULL 的是 UNIQUE 约束自动索引，建表语句已包含，不重建
      const indexes = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='artists' AND sql IS NOT NULL"
      ).all()
      database.transaction(() => {
        database.exec(newSql)
        database.exec(`INSERT INTO artists_new (${colList}) SELECT ${colList} FROM artists`)
        database.exec('DROP TABLE artists')
        database.exec('ALTER TABLE artists_new RENAME TO artists')
        for (const idx of indexes) database.exec(idx.sql)
      })()
    } finally {
      // ⚠️ 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续所有 CASCADE 失效）
      database.pragma('foreign_keys = ON')
    }
  }
}
```

## 血泪点清单（本次全踩过）

1. **手抄列清单漏列** → INSERT 报 `table artists_new has no column named X`，迁移失败容器 crash loop（restart_policy 反复重试）。用原表 sql 字符串替换根治
2. **索引在 DROP 之后查就没了** → 必须在 DROP 前抓取索引定义
3. **FK pragma 不放 finally** → 迁移抛错时连接留在 foreign_keys=OFF，整个应用后续 CASCADE 全失效
4. **测试拿即将合法化的值当非法 fixture**（TC-AR-09 用 'hidden' 测拒绝）→ 合法化后套件挂；grep 该值在测试中的用法，fixture 换真正非法值（'bogus'）并补正向断言
5. **迁移失败时数据安全性**：事务保证 DROP 前的失败自动回滚（数据无损）；备份文件在迁移开头已生成，可整体恢复
6. **容器 crash loop 时**：先修代码再 `docker compose up -d --build`，不要对着重启中的容器 docker exec（报 "container is restarting"）

## 验证（ad-hoc，套件覆盖不到新路径）

容器内写临时脚本实测完整链路：admin 登录 → PUT 设新值 → 读回确认 → 公开接口可见性验证（hidden 画师不出现在公开列表）→ 非法值仍 400 → 恢复测试画师原状态不留痕。脚本跑完即删（本地 + 容器内）。
