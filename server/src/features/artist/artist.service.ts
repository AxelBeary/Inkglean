// ============================================
// 画师服务（对外统一入口）
// ============================================
// F-09 巨型文件清偿（拆分批）：本文件按职责拆为五个子模块，自身保留为
// re-export 入口——下游 import 路径（'../artist/artist.service.js'）与导出
// 名称、签名、行为全部不变，纯搬移零逻辑变更。
//   1. artist-lookup.service.ts    查找/可见性/登录留痕/就绪判定/会话作废
//   2. artist-account.service.ts   建号、资料更新（白名单）、软删与恢复
//   3. artist-artwork.service.ts   作品 CRUD/分页、档位标注、封面、点赞
//   4. artist-settings.service.ts  约稿须知、外链、灵感标签、小公告
//   5. artist-quota.service.ts     SPEC-004 名额与缓冲、S5 月度额度池
// ============================================

export * from './artist-lookup.service.js'
export * from './artist-account.service.js'
export * from './artist-artwork.service.js'
export * from './artist-settings.service.js'
export * from './artist-quota.service.js'
