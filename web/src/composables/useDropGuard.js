/**
 * useDropGuard — 页内拖拽守卫（G1）
 *
 * 需求：页面里已展示的图片（作品图/参考图等）不许直接拖进页内上传区。
 * 拖页内图拿到的是渲染后的图（可能压缩过/带水印），不是原文件；
 * 上传只应接受系统文件拖入和粘贴。
 *
 * 原理：区分拖拽来源看 e.dataTransfer.types——
 * 操作系统文件拖拽含 'Files'；页内元素（图片/文字）拖拽只有 text/html / text/plain。
 *
 * 用法：
 *   1. Element Plus el-upload drag 区：EP dragger 在冒泡阶段处理 drop 且不检查来源，
 *      守卫必须挂捕获阶段抢在它之前：
 *        <el-upload drag ...
 *          @dragenter.capture="guardDragEnter"
 *          @dragover.capture="guardDragOver"
 *          @drop.capture="guardDrop">
 *   2. 原生 drop 区（自绘上传瓦片）：捕获阶段拦 dragenter/dragover（阻止高亮），
 *      drop 处理器开头调 guardDrop(event)，返回 false 即页内拖拽，直接 return：
 *        function handleDrop(event) {
 *          if (!guardDrop(event)) return
 *          ...正常处理 event.dataTransfer.files
 *        }
 *
 * 注意：守卫用 stopImmediatePropagation 而非 stopPropagation——
 * 捕获监听与上传区自身的冒泡监听常挂在同一元素，DOM 规范下 target 阶段
 * 同元素监听按注册顺序全部执行，stopPropagation 拦不住同元素的冒泡监听。
 *
 * 返回值：
 *   isSystemFileDrag(event) — 纯判断：是否系统文件拖拽
 *   guardDragEnter(event)   — 捕获阶段：页内拖拽 → 禁止 drop + 警告一次（节流）
 *   guardDragOver(event)    — 捕获阶段：页内拖拽 → 禁止 drop（阻止上传区高亮）
 *   guardDrop(event)        — 页内拖拽 → preventDefault + 警告，返回 false；系统文件返回 true
 */
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

/** 同一次拖拽内的警告节流窗口（dragenter 在子元素间移动会重复触发） */
const WARN_THROTTLE_MS = 1500
let lastWarnAt = 0

/** 是否系统文件拖拽（dataTransfer.types 含 'Files'） */
export function isSystemFileDrag(event) {
  const types = event?.dataTransfer?.types
  return !!types && types.includes('Files')
}

export function useDropGuard() {
  const { t } = useI18n()

  function warnPageDrag() {
    const now = Date.now()
    if (now - lastWarnAt < WARN_THROTTLE_MS) return
    lastWarnAt = now
    ElMessage.warning(t('upload.dragFromPage'))
  }

  /** 捕获阶段 dragenter 守卫：页内拖拽 → 禁止 + 警告一次 */
  function guardDragEnter(event) {
    if (isSystemFileDrag(event)) return true
    event.preventDefault()
    event.stopImmediatePropagation()
    warnPageDrag()
    return false
  }

  /** 捕获阶段 dragover 守卫：页内拖拽 → 禁止（不警告，dragenter 已警告过） */
  function guardDragOver(event) {
    if (isSystemFileDrag(event)) return true
    event.preventDefault()
    event.stopImmediatePropagation()
    return false
  }

  /** drop 守卫（兜底）：页内拖拽 → preventDefault + 警告，返回 false */
  function guardDrop(event) {
    if (isSystemFileDrag(event)) return true
    event.preventDefault()
    event.stopImmediatePropagation()
    warnPageDrag()
    return false
  }

  return { isSystemFileDrag, guardDragEnter, guardDragOver, guardDrop }
}
