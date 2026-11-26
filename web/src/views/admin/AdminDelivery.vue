<template>
  <div class="admin-page admin-delivery">
    <div class="admin-page-head">
      <h1 class="admin-page-title font-display">{{ t('admin.delivery.title') }}</h1>
    </div>

    <form @submit.prevent="search">
      <label for="admin-delivery-order-no" class="delivery-search-label">{{ t('admin.delivery.orderNoLabel') }}</label>
      <div class="delivery-controls delivery-search">
        <el-input id="admin-delivery-order-no" v-model="orderNoInput" autocomplete="off" clearable />
        <el-button
          data-testid="delivery-search"
          native-type="submit"
          type="primary"
          :icon="Search"
          :loading="lookup.status === 'loading'"
          :disabled="!orderNoInput.trim() || !!stepUpRetry"
        >
          {{ t('admin.delivery.search') }}
        </el-button>
      </div>
    </form>

    <p v-if="lookup.status === 'missing'" class="delivery-feedback" role="status">{{ t('admin.delivery.lookupMissing') }}</p>
    <p v-else-if="lookup.status === 'error'" class="delivery-feedback" role="alert">{{ t('admin.delivery.lookupFailed') }}</p>

    <section v-if="order" class="delivery-result" aria-labelledby="admin-delivery-result-title">
      <h2 id="admin-delivery-result-title" class="delivery-result-title">{{ t('admin.delivery.orderTitle', { orderNo: order.orderNo }) }}</h2>
      <p v-if="!order.deliverables.length" class="delivery-feedback">{{ t('admin.delivery.noFiles') }}</p>
      <ul v-else class="delivery-files">
        <li v-for="file in order.deliverables" :key="file.id" :data-testid="'delivery-file-' + file.id">
          <div class="delivery-file-row">
            <div class="delivery-file-info">
              <div class="delivery-file-name">{{ displayFileName(file) }}</div>
              <div class="delivery-file-meta">
                <span>#{{ file.id }}</span>
                <span v-if="file.fileSize != null">{{ formatBytes(file.fileSize) }}</span>
                <el-tag size="small" class="delivery-lock-state" :type="file.downloadLocked ? 'warning' : 'info'">
                  {{ file.downloadLocked ? t('admin.delivery.locked') : t('admin.delivery.unlocked') }}
                </el-tag>
              </div>
            </div>
            <el-button
              data-testid="delivery-reissue"
              :icon="Link"
              :disabled="!!pendingIssue || !!stepUpRetry"
              :loading="pendingIssue?.context === contextVersion && pendingIssue.fileId === file.id"
              @click="confirmIssue(file)"
            >
              {{ t('admin.delivery.issue') }}
            </el-button>
          </div>

          <div v-if="receipt?.fileId === file.id && receipt.kind === 'active'" data-testid="delivery-receipt" class="delivery-receipt">
            <p role="status">{{ ttlLabel(receipt.expiresInSeconds) }}</p>
            <div class="delivery-controls">
              <el-input :model-value="receipt.url" :aria-label="t('admin.delivery.linkLabel')" readonly autocomplete="off" />
              <el-button data-testid="delivery-copy" :icon="CopyDocument" @click="copyReceipt">{{ t('admin.delivery.copy') }}</el-button>
            </div>
          </div>
          <p v-else-if="receipt?.fileId === file.id" class="delivery-receipt" role="status">{{ t('admin.delivery.expired') }}</p>
        </li>
      </ul>
    </section>

    <StepUpDialog :model-value="!!stepUpRetry" @verified="resumeVerified" @cancel="stepUpRetry = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Link, Search } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import StepUpDialog from '../../components/admin/StepUpDialog.vue'
import { adminApi, type ApiError } from '../../api/index'
import type { AdminDeliveryFile, AdminDeliveryLookupResult } from '../../api/types'
import { copyText } from '../../utils/clipboard'
import { formatBytes } from '../../utils/image-resize'

const { t } = useI18n()
const orderNoInput = ref('')
type Lookup = { status: 'idle' | 'loading' | 'missing' | 'error' } | { status: 'found'; order: AdminDeliveryLookupResult }
const lookup = shallowRef<Lookup>({ status: 'idle' })
const order = computed(() => lookup.value.status === 'found' ? lookup.value.order : null)

type IssueTarget = { context: number; orderNo: string; fileId: number }
// B7-F0285：expiresInSeconds/expiresAt 允许 null——链接可用但回执 TTL 畸形时降级展示，
// 不再为整份收据一刀切抛错（此前会把服务端已生成的链接一并丢弃）
type Receipt = { kind: 'active'; fileId: number; url: string; expiresInSeconds: number | null; expiresAt: number | null }
  | { kind: 'expired'; fileId: number }
const pendingIssue = shallowRef<IssueTarget | null>(null)
const receipt = shallowRef<Receipt | null>(null)
const stepUpRetry = shallowRef<(() => Promise<void>) | null>(null)
const contextVersion = ref(0)
let expiryTimer: number | undefined

function clearReceipt() {
  window.clearTimeout(expiryTimer)
  expiryTimer = undefined
  receipt.value = null
}

// Editing and resubmitting both invalidate lookups, confirmations and late reissue responses.
function resetView() {
  contextVersion.value++
  lookup.value = { status: 'idle' }
  stepUpRetry.value = null
  clearReceipt()
}
watch(orderNoInput, resetView, { flush: 'sync' })
onBeforeUnmount(resetView)

function isStepUpRequired(error: unknown) {
  const e = error as ApiError | undefined
  return e?.status === 401 && e.code === 'STEP_UP_REQUIRED'
}

async function resumeVerified() {
  const retry = stepUpRetry.value
  stepUpRetry.value = null
  await retry?.()
}

async function search() {
  const orderNo = orderNoInput.value.trim()
  if (!orderNo || lookup.value.status === 'loading' || stepUpRetry.value) return
  resetView()
  await loadOrder(orderNo, contextVersion.value)
}

async function loadOrder(orderNo: string, context: number, allowStepUp = true) {
  if (context !== contextVersion.value) return
  lookup.value = { status: 'loading' }
  try {
    const found = await adminApi.lookupDelivery(orderNo)
    if (context === contextVersion.value) lookup.value = { status: 'found', order: found }
  } catch (error) {
    if (context !== contextVersion.value) return
    if (allowStepUp && isStepUpRequired(error)) {
      lookup.value = { status: 'idle' }
      stepUpRetry.value = () => loadOrder(orderNo, context, false)
    } else {
      lookup.value = { status: (error as ApiError | undefined)?.status === 404 ? 'missing' : 'error' }
    }
  }
}

function displayFileName(file: AdminDeliveryFile) {
  return file.fileName || t('admin.delivery.unnamedFile')
}

async function confirmIssue(file: AdminDeliveryFile) {
  if (!order.value || pendingIssue.value || stepUpRetry.value) return
  const target = { context: contextVersion.value, orderNo: order.value.orderNo, fileId: file.id }
  pendingIssue.value = target
  try {
    await ElMessageBox.confirm(
      t('admin.delivery.confirmBody', { orderNo: target.orderNo, fileName: displayFileName(file), fileId: file.id }),
      t('admin.delivery.confirmTitle'),
      { type: 'warning', confirmButtonText: t('admin.delivery.issue'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  } finally {
    pendingIssue.value = null
  }
  await issue(target)
}

async function issue(target: IssueTarget, allowStepUp = true) {
  if (target.context !== contextVersion.value || pendingIssue.value) return
  pendingIssue.value = target
  clearReceipt()
  try {
    const result = await adminApi.reissueDeliveryFile(target.orderNo, target.fileId)
    if (target.context !== contextVersion.value) return
    const { url, expiresInSeconds } = result
    // B7-F0285：重签 HTTP 成功即意味着服务端已解锁该文件并生成了新链接——先同步本地解锁态，
    // 后续回执校验失败也不再把已发生的重签谎报成「未生效」
    const currentOrder = order.value
    if (currentOrder) {
      const deliverables = currentOrder.deliverables.map(file => file.id === target.fileId ? { ...file, downloadLocked: false } : file)
      lookup.value = { status: 'found', order: { ...currentOrder, deliverables } }
    }
    // 回执校验：链接本体必须可用（语法 + 同源，防恶意响应——语法异常直接抛给外层
    // catch 走既有失败分支）；TTL 畸形单独降级（B7-F0285）
    const absoluteUrl = new URL(url, window.location.origin)
    if (!url || absoluteUrl.origin !== window.location.origin) {
      throw new Error('Invalid delivery link receipt')
    }
    if (!Number.isInteger(expiresInSeconds) || (expiresInSeconds as number) <= 0) {
      // B7-F0285：链接可用但 TTL 畸形——降级收据：展示链接、不启倒计时（有效期未知，不虚构数字），
      // 此前这种响应整份丢弃，已生成的下载链接凭空消失
      receipt.value = { kind: 'active', fileId: target.fileId, url: absoluteUrl.href, expiresInSeconds: null, expiresAt: null }
      return
    }
    const ttlMs = (expiresInSeconds as number) * 1000
    receipt.value = {
      kind: 'active', fileId: target.fileId, url: absoluteUrl.href,
      expiresInSeconds, expiresAt: Date.now() + ttlMs
    }
    expiryTimer = window.setTimeout(() => expireReceipt(target.fileId), ttlMs)
  } catch (error) {
    if (target.context !== contextVersion.value) return
    if (allowStepUp && isStepUpRequired(error)) {
      stepUpRetry.value = () => issue(target, false)
    } else {
      const status = (error as ApiError | undefined)?.status
      if (isStepUpRequired(error)) ElMessage.error(t('errors.STEP_UP_REQUIRED'))
      else if (status === 404) ElMessage.error(t('admin.delivery.issueMissing'))
      else if (status === 409) ElMessage.warning(t('admin.delivery.issueBusy'))
      else ElMessage.error(t('admin.delivery.issueFailed'))
    }
  } finally {
    pendingIssue.value = null
  }
}

function ttlLabel(seconds: number | null) {
  // B7-F0285：TTL 畸形的降级收据——不虚构有效期数字，明示「有效期未知」
  if (seconds == null) return t('admin.delivery.ttlUnknown')
  return seconds % 60 === 0
    ? t('admin.delivery.ttlMinutes', { n: seconds / 60 })
    : t('admin.delivery.ttlSeconds', { n: seconds })
}

function expireReceipt(fileId: number) {
  clearReceipt()
  receipt.value = { kind: 'expired', fileId }
}

async function copyReceipt() {
  const current = receipt.value
  if (current?.kind !== 'active') return
  // B7-F0285：降级收据 expiresAt 为 null——没有可校验的过期时刻，跳过本地过期判定
  if (current.expiresAt != null && Date.now() >= current.expiresAt) {
    expireReceipt(current.fileId)
    return
  }
  const copied = await copyText(current.url)
  if (receipt.value !== current) return
  if (copied) ElMessage.success(t('admin.delivery.copied'))
  else ElMessage.warning(t('common.copyFailed'))
}
</script>

<style scoped>
.admin-delivery { padding: 8px 0 32px; }
.delivery-search-label { display: block; margin-bottom: 8px; font-weight: 600; }
.delivery-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.delivery-controls .el-input { flex: 1 1 240px; min-width: 0; }
.delivery-search { max-width: 480px; }
.delivery-result { max-width: 760px; margin-top: 24px; }
.delivery-result-title { margin: 0 0 12px; font-size: 16px; overflow-wrap: anywhere; }
.delivery-files { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.delivery-files > li { padding: 12px 0; border-bottom: 1px solid var(--line); }
.delivery-file-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.delivery-file-info { min-width: 0; flex: 1 1 160px; }
.delivery-file-name { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }
.delivery-file-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 4px; color: var(--ink2); }
.delivery-lock-state { --el-tag-text-color: var(--ink); }
.delivery-feedback, .delivery-receipt { margin: 12px 0 0; color: var(--ink2); }
.delivery-receipt > p { margin: 0 0 8px; }
</style>
