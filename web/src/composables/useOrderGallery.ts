import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi, type ApiError } from '../api/index'
import { useDropGuard } from './useDropGuard'
import { uploadReferenceWithAnonToken, AnonTokenUnavailableError } from '../utils/anonUpload'
import { MAX_IMAGE_BYTES } from '../constants/upload'
import type { EnrichedOrderDetail } from '../api/types'

/**
 * 订单图库（从 OrderDetail.vue 拆分，纯搬移零行为变化）
 *
 * ⚠️ 归属说明（与施工图骨架的差异，见交付报告自修节）：
 * - validateImageFile / uploadGalleryFiles 被父组件其他区块使用
 *   （备注附图 uploadNoteImage 校验、usePasteUpload 粘贴回调），因此额外返回。
 * - usePasteUpload 挂载留在父组件（焦点路由含备注区块 uploadNoteImage，不拆）；
 *   本 composable 不挂载 usePasteUpload、不返回 pasteError。
 *
 * @param ctx
 * @param ctx.routeId
 * @param ctx.onRefresh - 刷新回调（loadOrder；gallery 部分失败时用）
 * @param ctx.applyOrder - M-9 补漏（审计 260830 收口）：统一写入口——响应 version 单调不回退，
 *        防本处写回与 loadOrder 并发时晚到旧快照覆盖新状态（同其余 composable 口径）
 */
export function useOrderGallery({ routeId, onRefresh, applyOrder }: {
  routeId: number
  onRefresh: () => Promise<void> | void
  applyOrder: (next: EnrichedOrderDetail | null) => void
}) {
  const { t } = useI18n()

  // ─── R18: 订单图库（上传 + 来源角标 + 点击设焦点） ───
  const galleryInputEl = ref<HTMLInputElement | null>(null)
  const galleryUploading = ref(false)
  const isGalleryDragOver = ref(false)
  const galleryViewerVisible = ref(false)
  const galleryViewerIndex = ref(0)

  function openGalleryViewer(index: number) {
    galleryViewerIndex.value = index
    galleryViewerVisible.value = true
  }

  /** 图片文件前端校验（格式 + 10MB） */
  function validateImageFile(file: File): boolean {
    if (!file.type.startsWith('image/')) {
      ElMessage.error(t('orderDetail.galleryNotImage'))
      return false
    }
    if (file.size > MAX_IMAGE_BYTES) {
      ElMessage.error(t('orderDetail.galleryTooBig'))
      return false
    }
    return true
  }

  /** 上传单张图并关联到订单（画师加图，后端自动标 source='artist'） */
  async function uploadAndAttachReference(file: File) {
    if (!validateImageFile(file)) return
    // G-7（P2-13 前端侧）: 与下单/手动录单同口径——上传前 await 凭证，
    // 失效凭证由 anonUpload 换新重试一次（815 起参考图接口强制要求 x-anon-token）
    const { uploaded } = await uploadReferenceWithAnonToken(file)
    applyOrder(await artistApi.addReference(routeId, {
      filePath: uploaded.filePath,
      fileName: uploaded.originalName,
      fileSize: uploaded.size
    }))
  }

  /** 批量上传（拖拽/多选/粘贴共用） */
  async function uploadGalleryFiles(files: File[]) {
    if (!files.length || galleryUploading.value) return // a3: busy 互斥——拖拽+粘贴并发时第二批直接忽略
    galleryUploading.value = true
    try {
      for (const file of files) {
        await uploadAndAttachReference(file)
      }
      ElMessage.success(t('orderDetail.galleryUploadSuccess'))
    } catch (err) {
      ElMessage.error(err instanceof AnonTokenUnavailableError ? t('orderDetail.anonTokenRequired') : (err as ApiError).message)
      await onRefresh() // 部分成功时刷新到最新状态
    } finally {
      galleryUploading.value = false
    }
  }

  function triggerGalleryUpload() {
    galleryInputEl.value?.click()
  }

  function handleGalleryFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    const files = [...target.files!]
    target.value = ''
    uploadGalleryFiles(files)
  }

  // G1: 页内拖拽守卫——捕获阶段拦 dragenter/dragover（模板已挂），drop 兜底判断在 handler 开头
  const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

  function handleGalleryDrop(event: DragEvent) {
    isGalleryDragOver.value = false
    if (!guardDrop(event)) return // 页内图拖入 → 拒绝 + 警告（dragover 已拦，此处兜底）
    const files = [...event.dataTransfer!.files].filter(f => f.type.startsWith('image/'))
    if (files.length) uploadGalleryFiles(files)
  }

  // R44: 设焦点改由 ✓ 小钩按钮触发（单击图片 = 放大预览）
  async function selectFocusImage(reference: { file_path: string }) {
    try {
      // mode 仅为满足后端 schema；实际显示尺寸由看板 queue_focus_display 决定
      applyOrder(await artistApi.setFocusImage(routeId, { imagePath: reference.file_path, mode: 'small' }))
      ElMessage.success(t('orderDetail.focusUpdated'))
    } catch (err) {
      ElMessage.error((err as ApiError).message)
    }
  }

  return {
    galleryInputEl, galleryUploading, isGalleryDragOver, galleryViewerVisible, galleryViewerIndex,
    openGalleryViewer, validateImageFile, uploadGalleryFiles, triggerGalleryUpload, handleGalleryFileSelect,
    handleGalleryDrop, guardDragEnter, guardDragOver, guardDrop, selectFocusImage
  }
}
