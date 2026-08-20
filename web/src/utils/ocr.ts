/**
 * ocr.ts — 本地图片文字识别（820 第二批：粘贴截图录单）
 *
 * recognizeImageText(file) → 识别出的纯文字（随后走 message-parser 的解析/清洗管线）
 *
 * 设计口径（用户拍板 2026-08-20）：
 *   - 浏览器本地识别：识别在访问者自己的浏览器里跑，图片不出本机（隐私）；
 *     三种部署形态（安装包/自部署/展示端）行为一致，展示端无需特殊处理。
 *   - 懒加载：tesseract.js 走动态 import 独立分包，只有真正点「识别图片」才下载；
 *     引擎/worker/语言文件默认走公共 CDN（免费），浏览器缓存后不再重复下载。
 *   - CDN 可切换：若公共 CDN 不通畅，给 createWorker 传 corePath/workerPath/langPath
 *     指向自托管静态文件即可，本模块逻辑不变。
 *   - 识别不出不猜：校验/识别失败一律抛错由 UI 层明示 + 重试，
 *     文字粘贴主链路不受牵连（本函数只被图片入口调用）。
 */
import type TesseractNS from 'tesseract.js'

/** 图片大小上限（MB，对齐站内图片上传统一口径） */
export const OCR_MAX_SIZE_MB = 10
/** 识别语言：简体中文 + 英文（QQ 聊天记录截图常混排） */
const OCR_LANGS = ['chi_sim', 'eng'] as const
/** 接受的图片类型（tesseract.js 可解码的常见形态） */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif']

/** OCR 失败类型：UI 层据此出人话提示（不泄漏底层堆栈） */
export type OcrFailureKind = 'not-image' | 'too-big' | 'recognize-failed'

export class OcrError extends Error {
  kind: OcrFailureKind
  constructor(kind: OcrFailureKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** CJS interop：tesseract.js 为 CommonJS 导出，个别打包配置下命名导出挂在 default 上 */
type TesseractModule = typeof import('tesseract.js')
async function loadTesseract(): Promise<TesseractModule> {
  const mod = await import('tesseract.js')
  const withDefault = mod as TesseractModule & { default?: TesseractModule }
  return withDefault.default ?? mod
}

/** worker 单例：首次识别时创建（含识别库下载），后续复用免重复初始化 */
let workerPromise: Promise<TesseractNS.Worker> | null = null

function getWorker(): Promise<TesseractNS.Worker> {
  if (!workerPromise) {
    workerPromise = loadTesseract()
      .then(t => t.createWorker([...OCR_LANGS]))
      .catch((e) => {
        // 创建失败（多为识别库下载失败）→ 释放单例，允许下次重试
        workerPromise = null
        throw e
      })
  }
  return workerPromise
}

/**
 * 识别图片中的文字。
 * @param {File} file 用户选择/粘贴的图片文件
 * @returns {Promise<string>} 识别文本（trim 后）；识别不出文字时为空串
 * @throws {OcrError} not-image / too-big / recognize-failed
 */
export async function recognizeImageText(file: File): Promise<string> {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) {
    throw new OcrError('not-image', 'not an accepted image type')
  }
  if (file.size > OCR_MAX_SIZE_MB * 1024 * 1024) {
    throw new OcrError('too-big', `image exceeds ${OCR_MAX_SIZE_MB}MB`)
  }
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(file)
    return (data.text || '').trim()
  } catch (e) {
    if (e instanceof OcrError) throw e
    throw new OcrError('recognize-failed', e instanceof Error ? e.message : String(e))
  }
}

/** 测试用：重置 worker 单例（生产代码不调用） */
export function __resetOcrWorkerForTest(): void {
  workerPromise = null
}
