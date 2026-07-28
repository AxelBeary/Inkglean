/**
 * usePasteUpload — 粘贴上传 composable
 *
 * 监听 document 级 paste 事件，提取剪贴板中的图片文件，
 * 交给调用方的 onFiles 回调处理（走与拖拽/文件选择相同的后端校验）。
 *
 * 硬规则：
 * - 只处理 image/* 类型，非图片文件提示「仅支持粘贴图片」
 * - 单张 ≤ maxSizeMB（默认 10MB）
 * - 单次粘贴 ≤ maxCount（默认 5 张）
 * - 纯文本粘贴不拦截（不影响输入框正常使用）
 *
 * 用法：
 *   const { isPasteUploading, pasteError } = usePasteUpload({
 *     onFiles: async (files) => { ... },   // 接收 File[] 的回调
 *     maxCount: 5,                          // 可选，默认 5
 *     maxSizeMB: 10,                        // 可选，默认 10
 *     enabled: someRef,                     // 可选，默认 true；为 false 时不响应粘贴
 *   })
 *
 * 返回值：
 *   isPasteUploading — ref<boolean>，上传进行中
 *   pasteError       — ref<string>，最近一次粘贴错误提示（成功后清空）
 */
import { ref, onMounted, onUnmounted, unref } from 'vue'
import { useI18n } from 'vue-i18n'

export function usePasteUpload({ onFiles, maxCount = 5, maxSizeMB = 10, enabled = true }) {
  const { t } = useI18n()
  const isPasteUploading = ref(false)
  const pasteError = ref('')

  async function handlePaste(event) {
    // enabled 为 false 时不响应（如对话框未打开）
    if (!unref(enabled)) return

    const items = event.clipboardData?.items
    if (!items) return

    const imageFiles = []
    let hasNonImageFile = false

    for (const item of items) {
      if (item.kind !== 'file') continue
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      } else {
        hasNonImageFile = true
      }
    }

    // 剪贴板无文件类内容 → 普通文本粘贴，不拦截
    if (imageFiles.length === 0 && !hasNonImageFile) return

    // 有文件类内容 → 拦截默认行为（防止浏览器打开图片等）
    event.preventDefault()

    // 有文件但无图片 → 提示仅支持图片
    if (imageFiles.length === 0) {
      pasteError.value = t('upload.pasteNotImage')
      return
    }

    // 数量检查
    if (imageFiles.length > maxCount) {
      pasteError.value = t('upload.pasteTooMany', { max: maxCount })
      return
    }

    // 大小检查（逐张）
    for (const file of imageFiles) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1)
        pasteError.value = t('upload.pasteTooBig', { name: file.name, size: sizeMB, max: maxSizeMB })
        return
      }
    }

    // 校验通过 → 交给调用方上传
    isPasteUploading.value = true
    pasteError.value = ''
    try {
      await onFiles(imageFiles)
    } catch (err) {
      pasteError.value = err.message || t('common.uploadFailed')
    } finally {
      isPasteUploading.value = false
    }
  }

  onMounted(() => document.addEventListener('paste', handlePaste))
  onUnmounted(() => document.removeEventListener('paste', handlePaste))

  return { isPasteUploading, pasteError }
}
