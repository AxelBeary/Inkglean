// 工程文件模板（本地核心环波5 · F1a）：REQ-014 §F1a 口径——
// 母版存「我的文档\拾绘\templates\」（画师选图即复制入库，母版永不被改动）；
// 绑定＝全局默认（title=''）+ 档位级覆盖（一个档位只绑一个文件）；
// 建单时：有模板→复制副本到委托文件夹「客户名-档位名.扩展名」并自动挂到该委托文件区；
// 没模板→什么都不建（诚实口径）；模板更换只影响之后的新单。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { openLocalDb } from '../bridge/db'
import { shihuiHome, copyFile } from '../bridge/files'
import { isDesktop } from '../bridge'
import { extractFileName } from './localFiles'
import type { LocalOrder } from './localLedger'

/** 全局默认绑定的键（空串作主键，SQLite TEXT PK 允许） */
export const GLOBAL_KEY = ''

/** 挑模板：档位绑定优先，回退全局默认，皆无返 null（纯函数可测） */
export function pickTemplate(bindings: Record<string, string>, title: string): string | null {
  const key = title.trim()
  if (key && bindings[key]) return bindings[key]
  return bindings[GLOBAL_KEY] || null
}

/** 清 Windows 非法文件名字符（含首尾点/空格防御；纯函数可测） */
export function sanitizeName(raw: string): string {
  // eslint-disable-next-line no-control-regex -- 刻意剔除 0x00~0x1f 控制字符：文件名里出现即非法/不可见坑
  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/[.\s]+$/, '')
  return cleaned
}

/** 取扩展名（含点；无扩展名返空串） */
export function extractExt(path: string): string {
  const name = extractFileName(path)
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i).toLowerCase() : ''
}

export const useLocalTemplatesStore = defineStore('desktop-local-templates', () => {
  /** title → 母版路径（GLOBAL_KEY 为全局默认） */
  const bindings = ref<Record<string, string>>({})
  const loaded = ref(false)
  const unavailable = ref(false)

  async function loadAll(): Promise<void> {
    if (!isDesktop()) { unavailable.value = true; loaded.value = true; return }
    try {
      const db = await openLocalDb()
      const rows = await db.select<{ title: string; template_path: string }[]>(
        'SELECT title, template_path FROM local_templates'
      )
      const map: Record<string, string> = {}
      for (const r of rows) {
        if (typeof r.title === 'string' && typeof r.template_path === 'string') {
          map[r.title] = r.template_path
        }
      }
      bindings.value = map
    } catch {
      unavailable.value = true
    } finally {
      loaded.value = true
    }
  }

  /** 绑定模板：复制选中文件为母版入库（templates/ 目录），再落绑定。
   *  同名母版直接覆盖（模板更换口径），已建订单各自持副本不受影响。 */
  async function bind(title: string, srcPath: string): Promise<boolean> {
    const key = title.trim()
    if (!srcPath) return false
    try {
      const home = await shihuiHome()
      const sep = home.includes('\\') ? '\\' : '/'
      const masterPath = `${home}${sep}templates${sep}${extractFileName(srcPath)}`
      await copyFile(srcPath, masterPath)
      const db = await openLocalDb()
      const ts = new Date().toISOString()
      await db.execute(
        `INSERT INTO local_templates (title, template_path, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(title) DO UPDATE SET template_path=$2, updated_at=$3`,
        [key, masterPath, ts]
      )
      bindings.value = { ...bindings.value, [key]: masterPath }
      return true
    } catch {
      return false
    }
  }

  /** 解绑（只删绑定记录，母版文件留在 templates/ 供重新绑定） */
  async function unbind(title: string): Promise<void> {
    const key = title.trim()
    try {
      const db = await openLocalDb()
      await db.execute('DELETE FROM local_templates WHERE title = $1', [key])
      const next = { ...bindings.value }
      delete next[key]
      bindings.value = next
    } catch {
      // 写失败静默，下次重开自愈
    }
  }

  /** 建单引擎：为这笔委托复制模板副本到委托文件夹，返回副本路径；无模板/失败返 null */
  async function createOrderFiles(order: LocalOrder): Promise<string | null> {
    const tpl = pickTemplate(bindings.value, order.title)
    if (!tpl) return null
    try {
      const home = await shihuiHome()
      const sep = home.includes('\\') ? '\\' : '/'
      const client = sanitizeName(order.client_name) || '客户'
      const title = sanitizeName(order.title) || '约稿'
      const folder = `${home}${sep}orders${sep}${client}-${title}`
      const dst = `${folder}${sep}${client}-${title}${extractExt(tpl)}`
      await copyFile(tpl, dst)
      return dst
    } catch {
      return null // 副本建失败不阻塞建单（账已记上，文件可后补）
    }
  }

  return { bindings, loaded, unavailable, loadAll, bind, unbind, createOrderFiles }
})
