// 模块包的 zip 编解码（v0.4）：单独一层，便于在 vitest 里做「组包 → 解包 → 验包」往返测试。
// 只搬字节与条目白名单，不落盘、不弹框（那些在 packIo.ts）。
import {
  PACK_ALLOWED_NAMES, PACK_ENTRY_NAME, PACK_MANIFEST_NAME, PACK_META_NAME, utf8Decode,
  PACK_MAX_MANIFEST_BYTES, PACK_MAX_ENTRY_BYTES, PACK_MAX_META_BYTES
} from './pack'
import type { PackMeta } from './pack'

/** F0019: 逐件体积上限（与 pack.ts/验包同口径）。F0019 复核返工：上限必须在**解压前**按 zip 中央目录
 *  声明的 uncompressedSize 判，否则压缩炸弹已解压进内存/OOM 后才抛，检查形同虚设。 */
const UNPACKED_CAPS: Record<string, number> = {
  [PACK_MANIFEST_NAME]: PACK_MAX_MANIFEST_BYTES,
  [PACK_ENTRY_NAME]: PACK_MAX_ENTRY_BYTES,
  [PACK_META_NAME]: PACK_MAX_META_BYTES
}

interface ZipEntryLike {
  dir: boolean
  async: (type: 'uint8array') => Promise<Uint8Array>
  /** F0019 复核返工：JSZip 从中央目录读出的声明解压后字节数（私有 _data，d.ts 已说明其形状） */
  _data?: { uncompressedSize?: number }
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
    const cap = UNPACKED_CAPS[name] ?? 0
    // F0019 复核返工：解压**前**先读中央目录声明的 uncompressedSize 卡上限——
    // 8MB 压缩炸弹声明膨胀到百 MB 时在此就拒，不调用 entry.async，避免先把炸弹解压进内存再 OOM。
    // 声明值缺失（JSZip 版本差异/构造路径）时 defensive 回落到解压后复核，不因读不到声明就放行。
    const declared = entry._data?.uncompressedSize
    if (typeof declared === 'number' && declared > cap) {
      throw new Error(`${name} 声明解压后体积超限（${declared} 字节），疑似压缩炸弹，已在解压前拒绝`)
    }
    const bytes = await entry.async('uint8array')
    // F0019: 解压后再核一次实际字节——防声明值被伪造（头里写小、实际炸开），双保险
    if (bytes.length > cap) {
      throw new Error(`${name} 解压后实际体积超限（${bytes.length} 字节），疑似压缩炸弹，已拒绝`)
    }
    files[name] = bytes
  }
  return { files, names }
}

/** 诊断用：包内 pack.json 原文（读不到返 null），仅在排障文案里用 */
export function packMetaText(files: Record<string, Uint8Array>): string | null {
  const bytes = files[PACK_META_NAME]
  if (!bytes) return null
  return utf8Decode(bytes)
}
