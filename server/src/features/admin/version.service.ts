/**
 * 系统版本与更新检查（0818 用户拍板方案 A：只读信息面板，不做自更新）
 *
 * 设计边界（拍板记录见 STATUS v123）：
 * - 当前版本：server/package.json 的 version + 部署脚本写入的 data/version.json（commit/deployedAt）；
 *   容器镜像不含 .git，commit 无法自读，故由 post-merge-deploy.ps1 落盘标记，VERSION_FILE env 可覆盖（测试用）
 * - 最新版本：GitHub 公开仓 master 最新 commit；内存缓存 15 分钟（GitHub 未认证限流 60 次/小时，缓存防打爆）；
 *   失败一律降级 ok:false（面板显示「连接不上」，绝不抛错打扰管理端）
 * - 只读：本服务不执行任何更新动作——容器无法重建自己，且挂 docker.sock 等于交出服务器最高权限（方案 B 已否决）
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { REPO_ROOT } from '../../db/connection.js'

export const REPO_URL = 'https://github.com/AxelBeary/Inkglean'
const GITHUB_API_LATEST = 'https://api.github.com/repos/AxelBeary/Inkglean/commits/master'
const CACHE_TTL_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

/** 部署标记文件结构（post-merge-deploy.ps1 写入） */
interface DeployMarker {
  commit?: string
  deployedAt?: string
}

/** 当前运行版本：version 必有兜底，commit 缺失时 'unknown'（手动部署的服务器可能无标记文件） */
export function getCurrentVersion(): { version: string; commit: string; deployedAt: string | null } {
  let version = 'unknown'
  try {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'server/package.json'), 'utf8')) as { version?: string }
    if (typeof pkg.version === 'string' && pkg.version) version = pkg.version
  } catch { /* package.json 不可读 → unknown 兜底 */ }
  const markerFile = process.env.VERSION_FILE || resolve(REPO_ROOT, 'data/version.json')
  let marker: DeployMarker = {}
  try {
    if (existsSync(markerFile)) marker = JSON.parse(readFileSync(markerFile, 'utf8')) as DeployMarker
  } catch { /* 标记文件损坏按无标记处理 */ }
  return {
    version,
    commit: (typeof marker.commit === 'string' && marker.commit) || process.env.APP_COMMIT || 'unknown',
    deployedAt: typeof marker.deployedAt === 'string' ? marker.deployedAt : null
  }
}

interface LatestCache { at: number; sha: string | null; date: string | null }
let latestCache: LatestCache | null = null

/**
 * 拉取 GitHub master 最新 commit（15 分钟缓存，失败也缓存防网络差时反复打）。
 * @param force 绕过缓存（前端「重新检查」用）
 */
export async function getLatestCommit(force = false): Promise<{ ok: boolean; sha: string | null; date: string | null }> {
  if (!force && latestCache && Date.now() - latestCache.at < CACHE_TTL_MS) {
    return { ok: latestCache.sha !== null, sha: latestCache.sha, date: latestCache.date }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(GITHUB_API_LATEST, {
      headers: { 'User-Agent': 'inkglean-admin', Accept: 'application/vnd.github+json' },
      signal: controller.signal
    })
    if (!res.ok) {
      latestCache = { at: Date.now(), sha: null, date: null }
      return { ok: false, sha: null, date: null }
    }
    const data = await res.json() as { sha?: string; commit?: { committer?: { date?: string } } }
    const sha = typeof data.sha === 'string' ? data.sha : null
    const date = typeof data.commit?.committer?.date === 'string' ? data.commit.committer.date : null
    latestCache = { at: Date.now(), sha, date }
    return { ok: sha !== null, sha, date }
  } catch {
    latestCache = { at: Date.now(), sha: null, date: null }
    return { ok: false, sha: null, date: null }
  } finally {
    clearTimeout(timer)
  }
}

/** 测试钩子：清缓存 */
export function _resetLatestCache(): void {
  latestCache = null
}
