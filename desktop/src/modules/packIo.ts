// 模块包 IO 层（v0.4）：弹框取包 / 另存为 / 落模块目录，全部经 desktop-bridge 逃生门。
// zip 编解码在 packZip.ts，判定在 pack.ts；本文件只做「人机交界」与路径收口。
// 落盘口径沿 F1 哲学：模块目录即本体，壳只写「包内三件」，不碰画师的其它文件。
import {
  exportSaveB64, importReadB64, saveFile, shihuiHome
} from '../bridge'
import { listModuleDirs, readModuleEntry, readModuleManifest } from '../bridge/modules'
import {
  PACK_ENTRY_NAME, PACK_MANIFEST_NAME, PACK_META_NAME,
  buildPack, isSafeModuleDirName, utf8Encode
} from './pack'
import { buildPackZip, readPackZip } from './packZip'

/** 读包体积上限：合法包是「两份小文本 + 一份清单」，8MB 已是宽松天花板 */
const MAX_PACK_ZIP_BYTES = 8 * 1024 * 1024
/** 包内条目数上限：只认三件，多出来的直接判多余（不逐个解压，防压缩炸弹） */
const MAX_PACK_ENTRIES = 6

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function joinWin(...parts: string[]): string {
  return parts.map(p => p.replace(/[\\/]+$/, '')).join('\\')
}

export interface LoadedPack {
  fileName: string
  /** 只含包内三件（多余条目以空字节占位，交给 verifyPack 判「多余」） */
  files: Record<string, Uint8Array>
}

/** 弹系统「打开文件」选一个模块包，解出条目；取消返 null */
export async function pickPackFile(): Promise<LoadedPack | null> {
  const picked = await importReadB64([{ name: '拾绘模块包', extensions: ['zip'] }], '选择模块包')
  if (!picked) return null
  if (picked.dataB64.length > MAX_PACK_ZIP_BYTES * 1.4) {
    throw new Error('模块包超过 8MB 上限（模块包只该装 manifest.json / panel.js / pack.json 三件）')
  }
  const bytes = bytesFromBase64(picked.dataB64)
  if (bytes.length > MAX_PACK_ZIP_BYTES) throw new Error('模块包超过 8MB 上限')
  const { files, names } = await readPackZip(bytes)
  if (names.length > MAX_PACK_ENTRIES) {
    throw new Error('模块包条目过多（只允许 manifest.json / panel.js / pack.json 三件）')
  }
  return { fileName: picked.path.split(/[\\/]/).pop() ?? '模块包.zip', files }
}

/** 导出模块为包：读当前两件 → 组清单 → 打 zip → 壳侧「另存为」。返回落盘路径；取消返 null */
export async function exportModulePack(dirName: string): Promise<string | null> {
  if (!isSafeModuleDirName(dirName)) throw new Error('模块目录名非法')
  const manifestText = await readModuleManifest(dirName)
  const entryCode = await readModuleEntry(dirName)
  const meta = buildPack(manifestText, entryCode)
  if (!meta) throw new Error('manifest 不是合法 JSON，无法组包')
  const bytes = await buildPackZip(manifestText, entryCode, meta)
  const stem = (meta.module.id || dirName).replace(/[^A-Za-z0-9_\-\u4e00-\u9fff]/g, '_')
  const fileName = stem + '-v' + (meta.module.version || '0.0.0') + '.zip'
  const { savedPath } = await exportSaveB64(fileName, bytes, '导出模块包')
  return savedPath
}

/** 装包落盘：只写三件；同名目录已存在则拒（不覆盖画师改过的版本）。
 *  前置：调用方已用 verifyPack 验过（本函数不重复判定）。 */
export async function installModulePack(
  dirName: string,
  files: { manifestText: string; entryCode: string; packText: string }
): Promise<void> {
  if (!isSafeModuleDirName(dirName)) throw new Error('模块 id 不合法：' + dirName)
  const existing = await listModuleDirs()
  if (existing.includes(dirName)) {
    throw new Error('同名模块已存在（不覆盖；请先到「我的文档\\拾绘\\modules」删掉旧文件夹）')
  }
  const home = await shihuiHome()
  const dir = joinWin(home, 'modules', dirName)
  await saveFile(joinWin(dir, PACK_MANIFEST_NAME), utf8Encode(files.manifestText))
  await saveFile(joinWin(dir, PACK_ENTRY_NAME), utf8Encode(files.entryCode))
  await saveFile(joinWin(dir, PACK_META_NAME), utf8Encode(files.packText))
}
