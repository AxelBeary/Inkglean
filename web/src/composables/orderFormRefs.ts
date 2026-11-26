/**
 * orderFormRefs — 约稿表单「参考图」单元（自 useOrderForm 拆出，巨型文件防阀 800 行上限拆分批）
 *
 * 两个具名 composable 分别在 useOrderForm 原代码位置调用，保持 watch 注册顺序与行为完全不变：
 * - useOrderFormRefUpload：唯一参考图数组、凭证锁定、文件选择上传（原「参考图上传」块）
 * - useOrderFormRefPaste：Ctrl+V 粘贴上传 + 粘贴错误提示（原「粘贴上传」块）
 * 纯结构搬移：数组引用交回 useOrderForm，草稿单元与提交逻辑仍指向同一份数据。
 */
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { usePasteUpload } from './usePasteUpload'
import { uploadReferenceWithAnonToken, AnonTokenUnavailableError } from '../utils/anonUpload'
import { generateId } from '../utils/id'
import { MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_IMAGE_MB } from '../constants/upload'
import type { ApiError } from '../api/index'
import type { RefFileItem } from '../views/client/order-form/types'

export function useOrderFormRefUpload() {
  const { t } = useI18n()

  // ─── 参考图上传 ───
  /**
   * 参考图条目唯一来源（el-upload 走 v-model:file-list）：展示、上限、token 判定、提交都读这一个数组。
   * issue #50-3：旧实现另存一份 uploadedRefs，而 EP 选文件时整组换数组、点选链路从不写 refFileList，
   * 两个数各算各的 → 上限双向失效（粘贴只看 refFileList、点选只写 uploadedRefs）。
   */
  const refFileList = ref<RefFileItem[]>([])
  /** 上传成功的存储路径（顺序即展示顺序；在途/失败条目无 filePath，不进提交） */
  const refFilePaths = computed(() => refFileList.value
    .map(item => item.filePath)
    .filter((p): p is string => typeof p === 'string' && p.length > 0))
  /** 本次会话成功上传参考图时实际使用的匿名凭证——下单提交必须与上传同源（F-10 归属校验） */
  let refUploadToken: string | null = null

  /**
   * issue #50-8：整表参考图必须同一凭证。服务端按 anon_id 逐条校验，混用会在提交时整体回滚且
   * 不给指向性提示。故凭证首次上传成功即锁定；后续上传若被 anonUpload 换新（旧凭证失效重试），
   * 旧批参考图已归属旧 anon_id，只能就地清空并明确要求重传，⛔ 不静默混提。
   */
  function lockRefUploadToken(token: string) {
    if (refUploadToken === token) return
    const rotated = refUploadToken !== null
    refUploadToken = token
    // 无已提交条目（用户已删除/从未传成）时无需打扰：没有旧批可混
    if (!rotated || !refFileList.value.some(item => item.filePath)) return
    // 原地 splice 而非换数组：el-upload 的 v-model:file-list 绑定同一个数组实例
    for (let i = refFileList.value.length - 1; i >= 0; i--) {
      if (refFileList.value[i].filePath) refFileList.value.splice(i, 1)
    }
    ElMessage.warning(t('orderForm.refTokenRotated'))
  }

  // ─── 参考图上传（文件选择） ───
  async function handleRefUpload({ file }: { file: File & { uid: string | number } }) {
    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      // #61-①：超限不得裸 return——http-request 按 resolve 收尾会让 EP 把文件误标成已上传。
      // 照 ManualOrderLeft.vue 的 a1 先例：先给可见提示，再 throw 让 EP 标记失败
      ElMessage.warning(t('orderForm.fileTooBig', { name: file.name, size: sizeMB }))
      throw new Error(t('orderForm.fileTooBig', { name: file.name, size: sizeMB }))
    }
    const ext = file.name.split('.').pop()!.toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      ElMessage.info(t('orderForm.typeWarning'))
    }
    try {
      // G-7（P2-13 前端侧）: 上传前 await 凭证；缓存凭证失效（INVALID_ANON_TOKEN）时
      // anonUpload 内部换新重试一次，避免公网用户被旧凭证卡死
      const { uploaded, token } = await uploadReferenceWithAnonToken(file)
      // issue #50-8：凭证换新会清空旧批已传条目（按 filePath 判），本条在途条目无路径，回填不受影响
      lockRefUploadToken(token)
      // 按 uid 回填 EP 已落进同一数组的条目（EP 的 onStart 先于 http-request）：
      // 回填而非追加，否则同一张图会出现两条，上限与提交都会多算
      const item = refFileList.value.find(f => String(f.uid) === String(file.uid))
      if (item) {
        // #61-③：EP 选文件时已给条目写 blob: 本地预览 URL，被服务端 URL 覆写前先 revoke，
        // 否则 blob 句柄随条目存活到下单页卸载，每次换图都泄漏一枚
        if (typeof item.url === 'string' && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url)
        item.filePath = uploaded.filePath
        item.url = uploaded.url
      }
    } catch (err) {
      if (err instanceof AnonTokenUnavailableError) {
        ElMessage.error(t('orderForm.anonTokenRequired'))
        throw new Error(t('orderForm.anonTokenRequired'), { cause: err })
      }
      ElMessage.error((err as ApiError).message || t('common.uploadFailed'))
      throw err
    }
  }

  /** 提交时取上传同源凭证（闭包读原变量，不复制值） */
  function getRefUploadToken() { return refUploadToken }

  return { refFileList, refFilePaths, getRefUploadToken, lockRefUploadToken, handleRefUpload }
}

export interface OrderFormRefPasteState {
  refFileList: Ref<RefFileItem[]>
  lockRefUploadToken: (token: string) => void
}

export function useOrderFormRefPaste(state: OrderFormRefPasteState) {
  const { t } = useI18n()
  const { refFileList, lockRefUploadToken } = state

  // ─── 粘贴上传（参考图） ───
  async function handlePasteRefFiles(files: File[]) {
    for (const file of files) {
      // 上限只在合并后的同一数组判一次：点选与粘贴共用 refFileList
      if (refFileList.value.length >= MAX_IMAGE_COUNT) {
        ElMessage.warning(t('orderForm.refExceed'))
        break // 已达上限提示后跳过剩余，不再中断已上传列表
      }
      const ext = (file.name || '').split('.').pop()!.toLowerCase()
      if (ext && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        ElMessage.info(t('orderForm.typeWarning'))
      }
      try {
        const { uploaded, token } = await uploadReferenceWithAnonToken(file)
        // issue #50-8：先结算凭证（换新时清掉旧批已传条目），再把本条推进同一数组
        lockRefUploadToken(token)
        // 与点选条目同形（含 filePath）：粘贴条目落进即带路径，无需回填
        refFileList.value.push({
          name: file.name || 'pasted-image.png',
          url: uploaded.url,
          uid: `paste-${generateId()}`,
          status: 'success',
          filePath: uploaded.filePath
        })
      } catch (err) {
        if (err instanceof AnonTokenUnavailableError) {
          ElMessage.error(t('orderForm.anonTokenRequired'))
        } else {
          ElMessage.error((err as ApiError).message || t('common.uploadFailed'))
        }
      }
    }
  }

  const { pasteError } = usePasteUpload({
    onFiles: handlePasteRefFiles,
    maxCount: MAX_IMAGE_COUNT,
    maxSizeMB: MAX_IMAGE_MB
  })
  watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })
}
