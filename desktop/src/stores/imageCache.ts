// 图缓存层（本地核心环波7 · F5）：REQ-014 §F5 口径——平台图片首拉后存本地，下次打开免流量。
// 流程：url 查登记表 → 命中即 convertFileSrc（asset 协议，scope 限 $APPDATA）；
// 未命中 → 网络拉 → 落盘 img-cache/<hash><ext> → 登记 → 返回 asset 地址。
// 并发去重（同 url 只拉一次）；一切失败返 null（调用方退为无图占位，不炸不吵）。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { openLocalDb } from '../bridge/db'
import { cacheDir, saveFile } from '../bridge/files'
import { isDesktop } from '../bridge'

/** url → 缓存文件名哈希（djb2，非加密用途，仅防重名） */
export function hashUrl(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

/** url 扩展名（剥 query；非白名单扩展名一律落 .png 兜底） */
export function extOfUrl(url: string): string {
  const clean = url.split('?')[0]
  const i = clean.lastIndexOf('.')
  const ext = i > 0 ? clean.slice(i).toLowerCase() : ''
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png'
}

export const useImageCacheStore = defineStore('desktop-image-cache', () => {
  /** url → 本地文件路径（登记表内存镜像） */
  const registry = ref<Record<string, string>>({})
  const loaded = ref(false)
  /** 并发去重：同 url 在途只拉一次 */
  const inflight = new Map<string, Promise<string | null>>()

  async function loadRegistry(): Promise<void> {
    if (!isDesktop() || loaded.value) return
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ url: string; file_path: string }[]>(
        'SELECT url, file_path FROM local_img_cache'
      )
      const map: Record<string, string> = {}
      for (const r of rows) {
        if (typeof r.url === 'string' && typeof r.file_path === 'string') map[r.url] = r.file_path
      }
      registry.value = map
    } catch {
      // 登记表读失败：退为「无缓存」行为（每次走网络），不影响显示
    } finally {
      loaded.value = true
    }
  }

  /** 解析可渲染地址：命中缓存→asset 地址；未命中→拉取+落盘+登记；失败返 null */
  function resolve(url: string): Promise<string | null> {
    if (!url || !isDesktop()) return Promise.resolve(null)
    const hit = registry.value[url]
    if (hit) return Promise.resolve(convertFileSrc(hit))
    const pending = inflight.get(url)
    if (pending) return pending
    const task = (async () => {
      try {
        await loadRegistry()
        const rehit = registry.value[url]
        if (rehit) return convertFileSrc(rehit)
        const res = await fetch(url)
        if (!res.ok) return null
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.length === 0) return null
        const dir = await cacheDir()
        const sep = dir.includes('\\') ? '\\' : '/'
        const filePath = `${dir}${sep}${hashUrl(url)}${extOfUrl(url)}`
        await saveFile(filePath, bytes)
        const db = await openLocalDb()
        await db.execute(
          `INSERT INTO local_img_cache (url, file_path, fetched_at) VALUES ($1, $2, $3)
           ON CONFLICT(url) DO UPDATE SET file_path=$2, fetched_at=$3`,
          [url, filePath, new Date().toISOString()]
        )
        registry.value = { ...registry.value, [url]: filePath }
        return convertFileSrc(filePath)
      } catch {
        return null // 网络/落盘任何环节失败：无图占位，不吵
      } finally {
        inflight.delete(url)
      }
    })()
    inflight.set(url, task)
    return task
  }

  return { registry, loaded, loadRegistry, resolve }
})
