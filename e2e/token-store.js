import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const TOKENS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '.tokens.json')

/** 读取 global-setup 产出的共享 token 缓存（每次调用都重读，E8 写回后可立即生效） */
export function readTokens() {
  return JSON.parse(readFileSync(TOKENS_FILE, 'utf8'))
}

/** 按 global-setup 的原始格式（单行 JSON.stringify）写回，保持 .tokens.json 结构不变 */
export function writeTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens))
}

/** 只替换 artist 键，保留 admin 等其余键，写入格式与 global-setup 完全一致 */
export function writeArtistToken(artistToken) {
  const tokens = readTokens()
  if (!tokens || typeof tokens !== 'object' || !('artist' in tokens)) {
    throw new Error('.tokens.json 缺少 artist 键，无法写回共享 token 缓存')
  }
  writeTokens({ ...tokens, artist: artistToken })
}
