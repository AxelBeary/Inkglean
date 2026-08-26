// 工具箱宿主公共件（波2）：shared 哑组件的桌面宿主能力收口——
// 剪贴板 / 导出落盘（系统保存对话框）/ 草稿读写 / 内联轻提示。
// 纪律：哑组件不碰这些能力，全部经本层；纯浏览器环境一律留降级出口不留死按钮。
import { ref } from 'vue'
import { saveFile } from '../bridge/files'
import { isDesktop } from '../bridge'

// ─── 剪贴板 ───
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ─── 导出 PNG：桌面＝系统保存对话框+落盘；纯浏览器＝anchor 下载（逃生门降级） ───
/** 返回 'saved' | 'cancelled' | 'failed' */
export async function savePng(blob: Blob, filename: string): Promise<'saved' | 'cancelled' | 'failed'> {
  if (isDesktop()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const picked = await save({
        defaultPath: filename,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }]
      })
      if (!picked) return 'cancelled'
      await saveFile(picked, new Uint8Array(await blob.arrayBuffer()))
      return 'saved'
    } catch {
      return 'failed'
    }
  }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return 'saved'
  } catch {
    return 'failed'
  }
}

// ─── 草稿持久化：与 web 宿主同键口径（同机同浏览器内核各自存储，互不串） ───
export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw)
    return d && typeof d === 'object' ? (d as T) : null
  } catch {
    return null // 损坏 JSON 丢弃，按组件默认草稿继续
  }
}

export function writeDraft(key: string, draft: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    /* 草稿非关键路径 */
  }
}

// ─── 内联轻提示（桌面端无 ElMessage，宿主自持一枚纸签 toast） ───
export interface ToolToast {
  visible: ReturnType<typeof ref<boolean>>
  text: ReturnType<typeof ref<string>>
  kind: ReturnType<typeof ref<'ok' | 'err'>>
  show: (text: string, kind?: 'ok' | 'err') => void
}

export function useToolToast(): ToolToast {
  const visible = ref(false)
  const text = ref('')
  const kind = ref<'ok' | 'err'>('ok')
  let timer: ReturnType<typeof setTimeout> | null = null
  function show(msg: string, k: 'ok' | 'err' = 'ok') {
    text.value = msg
    kind.value = k
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { visible.value = false }, 2400)
  }
  return { visible, text, kind, show }
}
