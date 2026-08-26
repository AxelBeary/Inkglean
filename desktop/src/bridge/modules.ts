// 模块机制桥（档②波17 二件）：模块目录扫描与文件读取的前端逃生门。
// 纪律同既有桥：纯浏览器环境抛 BridgeUnavailableError；扫描失败由注册表归一为失效态。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

/** 列出模块目录名（我的文档\拾绘\modules\ 下合法目录） */
export async function listModuleDirs(): Promise<string[]> {
  if (!isDesktop()) throw new BridgeUnavailableError('listModuleDirs')
  return await invoke<string[]>('desktop_list_module_dirs')
}

/** 读模块 manifest.json 原文（校验归 modules/registry） */
export async function readModuleManifest(dirName: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('readModuleManifest')
  return await invoke<string>('desktop_read_module_manifest', { dirName })
}

/** 读模块入口文件原文（panel.js；沙箱帧渲染件用，本件备用） */
export async function readModuleEntry(dirName: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('readModuleEntry')
  return await invoke<string>('desktop_read_module_entry', { dirName })
}

/** 模块私有存储路径（write.own 独立文件；配额核校验归注册表） */
export async function moduleStoragePath(dirName: string): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('moduleStoragePath')
  return await invoke<string>('desktop_module_storage_path', { dirName })
}

/** 一键安装示例模块「稿情气象台」（随壳内嵌；已存在报错不覆盖） */
export async function installSampleModule(): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('installSampleModule')
  await invoke('desktop_install_sample_module')
}
