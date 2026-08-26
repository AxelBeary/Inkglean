// 画师本地档案（本地核心环波4 · F6）：REQ-014 §F6 口径——昵称/头像/简介/风格标签，
// 免登录阶段画师手动创建/编辑；F3 约稿条（价目分享卡署名/印章）与 F4 小票复用此档案。
// 存储：local_profile 单行表（id 恒 1）；头像自含 data URL 存库（渲染不依赖路径）。
// 归一化纪律同款：坏数据落默认、纯浏览器静默降级。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { openLocalDb } from '../bridge/db'
import { isDesktop } from '../bridge'

export interface LocalProfile {
  nickname: string
  avatar_b64: string
  intro: string
  tags: string
  updated_at: string
}

export function emptyProfile(): LocalProfile {
  return { nickname: '', avatar_b64: '', intro: '', tags: '', updated_at: '' }
}

/** 行归一化：坏形状落空档案（渲染永不因脏数据炸） */
export function normalizeProfile(raw: Record<string, unknown> | null): LocalProfile {
  const d = emptyProfile()
  if (!raw) return d
  if (typeof raw.nickname === 'string') d.nickname = raw.nickname
  if (typeof raw.avatar_b64 === 'string') d.avatar_b64 = raw.avatar_b64
  if (typeof raw.intro === 'string') d.intro = raw.intro
  if (typeof raw.tags === 'string') d.tags = raw.tags
  if (typeof raw.updated_at === 'string') d.updated_at = raw.updated_at
  return d
}

/** 风格标签拆数组（逗号/顿号/空格分隔，去空去重；纯函数可测） */
export function splitTags(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of raw.split(/[,，、\s]+/)) {
    const t = piece.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

export const useLocalProfileStore = defineStore('desktop-local-profile', () => {
  const profile = ref<LocalProfile>(emptyProfile())
  const loaded = ref(false)
  const unavailable = ref(false)

  async function load(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM local_profile WHERE id = 1'
      )
      profile.value = normalizeProfile(rows[0] ?? null)
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 保存档案（UPSERT 单行）；昵称与简介限长由页面把关，此处宽进 */
  async function save(p: Omit<LocalProfile, 'updated_at'>): Promise<boolean> {
    try {
      const db = await openLocalDb()
      const ts = new Date().toISOString()
      await db.execute(
        `INSERT INTO local_profile (id, nickname, avatar_b64, intro, tags, updated_at)
         VALUES (1, $1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET nickname=$1, avatar_b64=$2, intro=$3, tags=$4, updated_at=$5`,
        [p.nickname.trim(), p.avatar_b64, p.intro.trim(), p.tags.trim(), ts]
      )
      profile.value = { nickname: p.nickname.trim(), avatar_b64: p.avatar_b64, intro: p.intro.trim(), tags: p.tags.trim(), updated_at: ts }
      return true
    } catch {
      return false
    }
  }

  /** 头像 data URL（渲染直接用；无头像为空串） */
  function avatarDataUrl(): string {
    const b = profile.value.avatar_b64
    if (!b) return ''
    return b.startsWith('data:') ? b : `data:image/png;base64,${b}`
  }

  return { profile, loaded, unavailable, load, save, avatarDataUrl }
})
