// 模块包的 zip 编解码（v0.4）：单独一层，便于在 vitest 里做「组包 → 解包 → 验包」往返测试。
// 只搬字节与条目白名单，不落盘、不弹框（那些在 packIo.ts）。
import {
  PACK_ALLOWED_NAMES, PACK_ENTRY_NAME, PACK_MANIFEST_NAME, PACK_META_NAME, utf8Decode
} from './pack'
import type { PackMeta } from './pack'

interface ZipEntryLike {
  dir: boolean
  async: (type: 'uint8array') => Promise<Uint8Array>
}
interface ZipLike {
  files: Record<string, ZipEntryLike>
}

export interface ReadPackZipResult {
  files: Record<string, Uint8Array>
  /** 包里的全部条目名（含目录与多余件），供上层提示/排障 */
  names: string[]
}

/** 组 zip：三件固定（manifest.json / panel.js / pack.json），明确 DEFLATE */
export async function buildPackZip(
  manifestText: string,
  entryCode: string,
  meta: PackMeta
): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file(PACK_MANIFEST_NAME, manifestText)
  zip.file(PACK_ENTRY_NAME, entryCode)
  zip.file(PACK_META_NAME, JSON.stringify(meta, null, 2) + '\n')
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** 解 zip：只解白名单三件；多余条目不解压（防压缩炸弹），以空字节占位交给验包判「多余」 */
export async function readPackZip(bytes: Uint8Array): Promise<ReadPackZipResult> {
  const { default: JSZip } = await import('jszip')
  const zip = (await JSZip.loadAsync(bytes, { checkCRC32: true })) as unknown as ZipLike
  const names = Object.keys(zip.files)
  const files: Record<string, Uint8Array> = {}
  for (const name of names) {
    const entry = zip.files[name]
    if (entry.dir) continue
    if (!PACK_ALLOWED_NAMES.includes(name)) {
      files[name] = new Uint8Array(0)
      continue
    }
    files[name] = await entry.async('uint8array')
  }
  return { files, names }
}

/** 诊断用：包内 pack.json 原文（读不到返 null），仅在排障文案里用 */
export function packMetaText(files: Record<string, Uint8Array>): string | null {
  const bytes = files[PACK_META_NAME]
  if (!bytes) return null
  return utf8Decode(bytes)
}
