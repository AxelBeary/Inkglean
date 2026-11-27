import type { Migration } from './types.js'

/**
 * v86: 管理员事件流水表 activity_events（「事件流水幕布」步 1 事实源，2026-11-28 立项）
 *
 * 定位：**展示/排查用流水，不是处置事实源**。管理动作的法定账本仍是 admin_actions（REQ-042 §七
 * 验收 4），本表由写入侧同事务双写一份展示副本，按分级 TTL 滚动（到期丢的只是副本，不丢证据）。
 *
 * 隐私口径（用户 2026-11-28 拍板，见 AGENTS/eventfeed-20261128/SPEC.md §5 与本批任务书）：
 * - D1=B 只收「有后果的动作」（认证/管理动作/交易上传），**不采集访客浏览**；
 * - D2=A 管理员动作与认证事件记 **IP 原值**（与 admin_actions.admin_ip / reports.report_ip /
 *   artists.last_login_ip 完全同口径，45 字符上限）；因 D1=B 无访问类事件，故无脱敏档；
 * - D3=B **不记录未登录访客浏览**（actor_kind='anon' 只为「匿名但有后果」的动作保留，
 *   如匿名举报/留言，不含浏览）。
 *
 * 为何 v86（不是 v85）：master 链尾是 v84，PR #116 已占 v85，migrations/index.ts 末尾有升序
 * 唯一性断言（版本重复/乱序在模块加载期直接抛错）。v85→#116、v86→本批 是与合入顺序解耦的组合。
 *
 * 为何无外键：审计流水必须比被审计对象活得久——artworks 可被画师物理删、artists 有软删
 * deleted_at、留言可软删；建 FK 要么 CASCADE 掉证据，要么阻塞正常删除。admin_actions 同样无 FK。
 *
 * 为何 at 用 INTEGER 毫秒：本表由服务端单点写入（无客户端上报、无跨时区文本比较需求），
 * 整数毫秒既能做范围查询与索引，又能避免全仓 datetime('now') 文本与 JS ISO 串混比的老坑；
 * 分级 TTL 清理按 (now_ms - N*86400000) 直接比较，无格式假设。
 *
 * 为何 meta_json 走 JSON：事件形态差异大（login_fail 要 reason、order_create 要 orderNo），
 * 逐列会立刻长出 20 个恒为 NULL 的列。上限 2KB 沿 tracking.service.ts MAX_EVENT_PAYLOAD_BYTES 口径。
 *
 * 幂等：全部 IF NOT EXISTS —— 老库升级走本迁移、新装库由 schema.ts 直建，两路径终态一致
 * （双轨由 tests/audit-batch-f-ddl-consistency.test.ts 自动比对）。索引统一登记在
 * schema.ts 的 schemaIndexes（与 F0101 归口同口径），本迁移不建索引。
 */
export const migration: Migration = {
  version: 86,
  name: 'activity_events',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        actor_kind TEXT NOT NULL CHECK(actor_kind IN ('admin', 'artist', 'client', 'anon')),
        actor_id INTEGER,
        ip TEXT,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        meta_json TEXT NOT NULL DEFAULT '{}',
        outcome TEXT NOT NULL DEFAULT 'ok' CHECK(outcome IN ('ok', 'fail'))
      );
    `)
  }
}
