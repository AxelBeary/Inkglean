/**
 * 备份路径事实源（U044）
 *
 * 事故：健康检查 checkBackup() 自己算「备份在哪」（从 DB_PATH 推出 DATA_DIR，且 readdirSync 非递归），
 * 而正式备份写在 BACKUP_DIR（默认 <数据目录>/backups，见 scripts/backup-db.ts）——两处各写一份口径就漂了：
 * 子目录里的新备份永远扫不到，健康页恒显示「备份正常」；只挂 BACKUP_DIR 的部署反倒误报「未找到备份」。
 * 故「备份写在哪 / 健康检查看哪」只在这里定义一次，scripts/backup-db.ts 与
 * features/admin/health.service.ts 都必须取这份，不允许再各自写一套。
 *
 * 边界：本文件只管路径口径与「哪些文件算备份产物」的识别口径，不含保留策略/档位；
 * 轮转删除仍只认 backup-db.ts 的 officialBackupRe 窄口径（只删本档位正式命名）。
 */
import { join, resolve } from 'path'

/**
 * 备份目录：BACKUP_DIR 优先，默认 <数据目录>/backups（与 scripts/backup-db.ts 同一口径）。
 *
 * 读环境变量放在调用时而非模块加载时：健康检查要按运行时环境取值（测试也要能按用例切换目录），
 * 空串按未设置处理（与 backup-db.ts 原来的 `process.env.BACKUP_DIR || ...` 语义一致）。
 *
 * @param dataDir 数据库所在目录（由 DB_PATH 推出）
 */
export function resolveBackupDir(dataDir: string): string {
  const override = process.env.BACKUP_DIR
  return override ? resolve(override) : join(dataDir, 'backups')
}

/**
 * 备份产物文件名识别（宽口径：只要是本平台的 DB 备份就认，供健康检查判断「有没有备份」）。
 *
 * 覆盖三类实际命名（命名形状的权威定义在 backup-db.ts 的 officialBackupRe 与 db/migrate.ts）：
 * - 正式档位产物 commission.db.bak-<ISO> / .bak-deploy-<ISO> / .bak-weekly-<ISO>
 * - 迁移前自动备份 commission.db.bak.v<N>（落在数据目录根下）
 * - 事故留档 commission.db.bak.empty-<日期> 等人工产物
 *
 * 只用于「识别」，绝不用于删除：轮转必须继续走 officialBackupRe 的窄口径，
 * 宽口径一旦接上 unlink 就会把异名/异档备份一起删掉（backup-db.ts 明确承诺不删）。
 */
export function isDbBackupFile(name: string): boolean {
  return /\.bak[.-]/.test(name)
}
