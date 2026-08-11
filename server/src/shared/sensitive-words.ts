// ============================================
// 内置基础敏感词库（REQ-042）
// 说明：起步为占位基础库，仅覆盖常见违法/风险类别，不承诺穷尽；
//       命中只提示不硬拦（先发后审），管理员维护词库列为后置（P2）。
//       后续扩充/后台管理时保持本模块为唯一数据源。
// ============================================

/** 占位基础词库（小规模起步；词条按风险类别分组注释，便于后续人工扩充） */
export const SENSITIVE_WORDS: string[] = [
  // 违法交易 / 敏感服务
  '赌博',
  '博彩',
  '毒品',
  '代开发票',
  '办证',
  '枪支',
  '诈骗',
  // 色情与未成年
  '色情',
  '成人内容',
  // 政治敏感占位（避免误伤，仅收录明确违法表述类别）
  '颠覆国家政权',
  '分裂国家'
]

/** 文本归一化：转小写 + 去空白（中文词无大小写，兼容英文占位扩展） */
function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

/**
 * 扫描文本命中敏感词（不硬拦，仅提示）
 * @returns 命中的词条数组（去重，保持词库顺序）
 */
export function findSensitiveWords(text: string | null | undefined): string[] {
  if (!text) return []
  const normalized = normalize(String(text))
  if (!normalized) return []
  const hits: string[] = []
  for (const word of SENSITIVE_WORDS) {
    if (normalized.includes(normalize(word)) && !hits.includes(word)) {
      hits.push(word)
    }
  }
  return hits
}

/** 组合多个文本源的命中（作品标题+描述、留言等） */
export function collectSensitiveHits(...texts: Array<string | null | undefined>): string[] {
  const hits: string[] = []
  for (const text of texts) {
    for (const word of findSensitiveWords(text)) {
      if (!hits.includes(word)) hits.push(word)
    }
  }
  return hits
}
