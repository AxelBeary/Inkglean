import type { FkViolation, Migration } from './types.js'

export const migration: Migration = {
    version: 43,
    name: 'drop_addon_tables',
    // ⚠️ 必须事务外执行：DROP 父表触发子表 ON DELETE CASCADE（v38 事故同款陷阱），
    // PRAGMA foreign_keys 在事务内是 no-op——关 FK 后立即回读校验，值不为 0 直接中止，绝不 DROP
    noTransaction: true,
    up(database) {
      // 冻结依据（三号评估报告 §Q1.5，2026-08-05 用户拍板 DROP）：
      // ① 生产零写路径——旧增项 CRUD 已删（v0.36 C-1），算价读路径已移除（第一批 1b8a375），
      //    POST schema 已拒收 addons 字段（本批），前端已停传（13dd4e7）
      // ② 存量仅 1 行测试垃圾数据、0 订单引用
      // ③ 两表无下游 FK（orders 无列/FK 指向这两表）；price_addons 索引随表删除
      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v43: foreign_keys 未能关闭（值=' + String(fkState) + '），中止 DROP 以防 CASCADE 清空子表')
      }
      try {
        database.exec('DROP TABLE IF EXISTS addon_tiers')
        database.exec('DROP TABLE IF EXISTS price_addons')
        // DROP 后恢复 FK 前验证无悬空外键引用（零悬空才安全）
        const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
        if (fkViolations.length > 0) {
          throw new Error('迁移 v43: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
      } finally {
        // 失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
    }
  }
