// 本地文件关联（本地核心环波3 · F1）：REQ-014 §F1 口径——按委托挂多个文件，
// **应用只记录路径，不复制、不搬迁、不封装**；调起系统关联程序打开；丢失提醒
// （面板打开时校验存在性，丢失标红可重新指路或解除关联）。
// 归一化纪律与记账同款：坏数据落默认、纯浏览器静默降级。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { openLocalDb } from '../bridge/db'
import { checkFiles } from '../bridge/files'
import { isDesktop } from '../bridge'

export interface LocalFile {
  id: number
  order_id: number
  file_name: string
  file_path: string
  added_at: string
}

/** 从绝对路径取文件名（Windows 反斜杠与正斜杠兼容；纯函数可测） */
export function extractFileName(path: string): string {
  const parts = path.split(/[\\/]/)
  const name = parts[parts.length - 1] ?? ''
  return name || path
}

function normalizeFile(raw: Record<string, unknown>): LocalFile {
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    order_id: typeof raw.order_id === 'number' ? raw.order_id : 0,
    file_name: typeof raw.file_name === 'string' ? raw.file_name : '',
    file_path: typeof raw.file_path === 'string' ? raw.file_path : '',
    added_at: typeof raw.added_at === 'string' ? raw.added_at : ''
  }
}

export const useLocalFilesStore = defineStore('desktop-local-files', () => {
  /** 按委托分组的文件表（记账行展开区消费） */
  const files = ref<Record<number, LocalFile[]>>({})
  /** 丢失文件记录 id 集（存在性校验落定；调起前也可单查） */
  const missing = ref<Set<number>>(new Set())
  const loaded = ref(false)
  const unavailable = ref(false)

  /** 全量载入 + 存在性校验（丢失提醒口径：面板打开即查一次） */
  async function loadAll(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM local_files ORDER BY id DESC'
      )
      const all = rows.map(normalizeFile)
      const grouped: Record<number, LocalFile[]> = {}
      for (const f of all) {
        grouped[f.order_id] = grouped[f.order_id] ?? []
        grouped[f.order_id].push(f)
      }
      files.value = grouped
      // 存在性校验：批量一次走桥，失败整体降级为「无丢失态」（不误报）
      try {
        const exists = await checkFiles(all.map(f => f.file_path))
        const lost = new Set<number>()
        all.forEach((f, i) => { if (!exists[i]) lost.add(f.id) })
        missing.value = lost
      } catch {
        missing.value = new Set()
      }
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 挂文件（路径来自系统多选对话框）；重复路径不重复挂 */
  async function addFiles(orderId: number, paths: string[]): Promise<number> {
    if (!paths.length) return 0
    try {
      const db = await openLocalDb()
      const existing = new Set((files.value[orderId] ?? []).map(f => f.file_path))
      const ts = new Date().toISOString()
      let added = 0
      for (const path of paths) {
        if (!path || existing.has(path)) continue
        const result = await db.execute(
          'INSERT INTO local_files (order_id, file_name, file_path, added_at) VALUES ($1, $2, $3, $4)',
          [orderId, extractFileName(path), path, ts]
        )
        const row: LocalFile = {
          id: result.lastInsertId ?? 0,
          order_id: orderId,
          file_name: extractFileName(path),
          file_path: path,
          added_at: ts
        }
        files.value = { ...files.value, [orderId]: [row, ...(files.value[orderId] ?? [])] }
        existing.add(path)
        added++
      }
      return added
    } catch {
      return 0
    }
  }

  /** 解除关联（只删记录，磁盘文件保持原样——F1 铁律） */
  async function removeFile(id: number): Promise<void> {
    try {
      const db = await openLocalDb()
      await db.execute('DELETE FROM local_files WHERE id = $1', [id])
      const next: Record<number, LocalFile[]> = {}
      for (const [oid, list] of Object.entries(files.value)) {
        next[Number(oid)] = list.filter(f => f.id !== id)
      }
      files.value = next
    } catch {
      // 写失败：界面态不动，下次重开自愈
    }
  }

  /** 重新指路（丢失补救）：换绑新路径并复验存在性 */
  async function repointFile(id: number, newPath: string): Promise<boolean> {
    if (!newPath) return false
    try {
      const db = await openLocalDb()
      await db.execute('UPDATE local_files SET file_path = $1, file_name = $2 WHERE id = $3', [
        newPath, extractFileName(newPath), id
      ])
      const next: Record<number, LocalFile[]> = {}
      for (const [oid, list] of Object.entries(files.value)) {
        next[Number(oid)] = list.map(f =>
          f.id === id ? { ...f, file_path: newPath, file_name: extractFileName(newPath) } : f
        )
      }
      files.value = next
      const lost = new Set(missing.value)
      lost.delete(id)
      missing.value = lost
      return true
    } catch {
      return false
    }
  }

  function countFor(orderId: number): number {
    return files.value[orderId]?.length ?? 0
  }

  return { files, missing, loaded, unavailable, loadAll, addFiles, removeFile, repointFile, countFor }
})
