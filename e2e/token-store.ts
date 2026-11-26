import { readFileSync, renameSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const DEFAULT_TOKENS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '.tokens.json')

/**
 * XEND-10: 缓存文件路径惰性解析——默认 e2e/.tokens.json；E2E_TOKENS_FILE 可显式覆盖。
 * 定向回归（token-refresh.regression.ts）借此把缓存隔离到临时文件，既不污染真实 token 缓存，
 * 也消除与在途 E2E 的并发写碰撞。惰性（每次调用读 env）而非模块级常量，确保回归脚本
 * 先设 env 再调用写函数时能被识别（静态 import 在顶层代码之前求值）。
 */
const tokensFile = (): string => {
  const override = process.env.E2E_TOKENS_FILE
  return override ? resolve(override) : DEFAULT_TOKENS_FILE
}

/** global-setup 写出的共享 token 缓存结构（artist / admin 必备，其余键随写随存） */
interface TokenCache {
  artist: string
  admin: string
  [key: string]: string
}

/** 读取 global-setup 产出的共享 token 缓存（每次调用都重读，E8 写回后可立即生效） */
export function readTokens(): TokenCache {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(tokensFile(), 'utf8'))
  } catch (err) {
    // F0062: 文件缺失/半截/损坏时给带定位的明确错误，不再把晦涩的 JSON 语法错直接抛给 fixture
    throw new Error(`.tokens.json 读取或解析失败（global-setup 是否正常完成？）：${(err as Error).message}`)
  }
  // F0062: 强转前先做运行时形状校验——artist/admin 必须是非空字符串，坏缓存在读取口快速失败
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('.tokens.json 结构无效（非 JSON 对象），拒绝作为共享 token 缓存')
  }
  const obj = parsed as Record<string, unknown>
  for (const key of ['artist', 'admin'] as const) {
    const value = obj[key]
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`.tokens.json 缺少有效的 ${key} token，无法供 fixture 使用`)
    }
  }
  return obj as TokenCache
}

/** 按 global-setup 的原始格式（单行 JSON.stringify）写回，保持 .tokens.json 结构不变 */
export function writeTokens(tokens: TokenCache): void {
  // F0063: 临时文件 + rename 原子替换——fixture 每用例都重读该文件，
  // 直接覆盖写在写入中途被读到就是半截 JSON；rename 在同目录内原子生效。
  // 临时名带 PID，防多进程（手动跑脚本与 playwright worker）互踩。
  const target = tokensFile()
  const tmp = `${target}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(tokens))
  renameSync(tmp, target)
}

/** 只替换 artist 键，保留 admin 等其余键，写入格式与 global-setup 完全一致 */
export function writeArtistToken(artistToken: string): void {
  const tokens = readTokens()
  if (!tokens || typeof tokens !== 'object' || !('artist' in tokens)) {
    throw new Error('.tokens.json 缺少 artist 键，无法写回共享 token 缓存')
  }
  writeTokens({ ...tokens, artist: artistToken })
}
