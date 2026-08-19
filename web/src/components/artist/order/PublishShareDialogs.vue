<template>
  <!-- REQ-022 F1 发布为作品 + REQ-031 B1 完稿分享：两弹窗整块搬自 OrderDetail.vue
       2026-08-10 拆分批：零行为变化；打开动作由父级经 expose 调用 -->
  <!-- REQ-022 F1: 发布为作品弹窗（仅 delivered；勾选图片默认全选，非图片置灰） -->
  <el-dialog v-model="publishDialogVisible" :title="$t('orderDetail.publishDialogTitle')" width="560px">
    <div v-if="!publishing">
      <div class="publish-hint">{{ $t('orderDetail.publishHint') }}</div>
      <el-checkbox-group v-model="publishForm.deliverableIds" class="publish-list">
        <div
          v-for="d in order.deliverables"
          :key="d.id"
          class="publish-item"
          :class="{ 'publish-item--disabled': !isPublishableImage(d) }"
        >
          <el-checkbox :value="d.id" :disabled="!isPublishableImage(d)">
            <span class="publish-file-name">{{ d.original_name }}</span>
          </el-checkbox>
          <el-tag v-if="!isPublishableImage(d)" size="small" type="info">{{ $t('orderDetail.publishNotImage') }}</el-tag>
        </div>
      </el-checkbox-group>
      <el-form label-position="top" style="margin-top: 12px">
        <el-form-item :label="$t('orderDetail.publishTitleLabel')" required>
          <el-input
            v-model="publishForm.title"
            :placeholder="$t('orderDetail.publishTitlePlaceholder')"
            maxlength="100" show-word-limit
          />
        </el-form-item>
        <el-form-item :label="$t('orderDetail.publishDescLabel')">
          <el-input
            v-model="publishForm.description"
            type="textarea" :rows="3"
            :placeholder="$t('orderDetail.publishDescPlaceholder')"
            maxlength="500" show-word-limit
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="publishDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :disabled="!publishForm.deliverableIds.length || !publishForm.title.trim()"
        :loading="publishing"
        @click="submitPublish"
      >
        {{ $t('orderDetail.publishSubmit') }}
      </el-button>
    </template>
  </el-dialog>

  <!-- REQ-031 B1: 完稿分享弹窗（平台 + 文案模板；发布动作在第三方平台完成） -->
  <el-dialog v-model="shareDialogVisible" :title="$t('orderDetail.shareDialogTitle')" width="520px">
    <div v-loading="shareLoading">
      <!-- 分享平台列表加载失败错误态 + 重试（不再静默显示空列表）；弹窗可关闭兜底 -->
      <div v-if="shareLoadFailed" class="module-error">
        <span>{{ $t('orderDetail.shareLoadFailed') }}</span>
        <el-button size="small" @click="openShareDialog">{{ $t('dashboard.retry') }}</el-button>
      </div>
      <template v-else>
        <el-form label-position="top">
          <el-form-item :label="$t('orderDetail.sharePlatformLabel')" required>
            <el-select v-model="sharePlatformId" style="width: 100%">
              <el-option v-for="p in sharePlatforms" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('orderDetail.shareTextLabel')">
            <el-input
              v-model="shareText"
              type="textarea" :rows="5"
              maxlength="500" show-word-limit
              :placeholder="$t('orderDetail.shareTextPlaceholder')"
            />
            <div class="share-placeholders">{{ $t('orderDetail.sharePlaceholders') }}: {orderNo} {homepage}</div>
          </el-form-item>
        </el-form>
        <el-alert v-if="shareNoHomepage" type="warning" :closable="false" show-icon class="share-alert">
          {{ $t('orderDetail.shareNoHomepage') }}
        </el-alert>
      </template>
    </div>
    <template #footer>
      <el-button @click="shareDialogVisible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!sharePlatformId" :loading="shareOpening" @click="doShare">
        {{ $t('orderDetail.shareOpenBtn') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { artistApi, artistPublicApi } from '../../../api/index.js'
import type { ArtistProfileResult, CustomLink } from '../../../api/types.js'
// REQ-031 B1: F2 外链校验复用（域名防投毒，前端=后端子集的弱化版）
import { validateLink, matchDomain } from '../../../utils/linkValidation.js'
// P3-10: 分享模板读写走安全封装（隐私模式/存储禁用时静默降级，不打断发布流程）
import { safeGetItem, safeSetItem } from '../../../utils/storage.js'

/** 交付物（本弹窗消费字段） */
interface PublishDeliverable { id: number; original_name?: string | null; file_path?: string | null }

/** 订单（本弹窗消费字段） */
interface PublishOrderLite { deliverables?: PublishDeliverable[] | null; order_no?: string }

/** 分享平台（本弹窗消费字段；hostname 由运行时响应携带） */
interface SharePlatform { id: number; name: string; hostname?: string | null }

const props = defineProps({
  order: { type: Object as PropType<PublishOrderLite>, required: true },
  routeId: { type: [String, Number], required: true }
})

const { t } = useI18n()
const router = useRouter()

// ─── REQ-022 F1: 发布为作品（delivered 门槛，一图一作品，发布不锁订单可重复） ───
const publishDialogVisible = ref(false)
const publishing = ref(false)
const publishForm = reactive({ deliverableIds: [] as number[], title: '', description: '' })

/** 可发布的图片扩展名（对齐后端 PUBLISH_ALLOWED_EXTS；zip/psd 等不可发布） */
const PUBLISH_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

function isPublishableImage(d: PublishDeliverable) {
  const name = d?.original_name || d?.file_path || ''
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return PUBLISH_IMAGE_EXTS.includes(name.slice(dot).toLowerCase())
}

function openPublishDialog() {
  // 默认全选图片交付物（非图片置灰不可勾）
  publishForm.deliverableIds = (props.order?.deliverables || []).filter(isPublishableImage).map((d: PublishDeliverable) => d.id)
  publishForm.title = ''
  publishForm.description = ''
  publishDialogVisible.value = true
}

async function submitPublish() {
  if (!publishForm.deliverableIds.length || !publishForm.title.trim()) return
  publishing.value = true
  try {
    const res = await artistApi.publishArtwork(props.routeId as number, {
      deliverableIds: publishForm.deliverableIds,
      title: publishForm.title.trim(),
      description: publishForm.description.trim() || null
    })
    publishDialogVisible.value = false
    // REQ-042: 命中敏感词 → 提示（不硬拦，先发后审）
    if (res?.warning?.sensitiveWords?.length) {
      ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
    }
    const n = res?.artworks?.length || 0
    ElMessage.success(t('orderDetail.publishSuccess', { n }))
    try {
      await ElMessageBox.confirm(
        t('orderDetail.publishGoManage', { n }),
        t('orderDetail.publishDoneTitle'),
        { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'success' }
      )
      router.push('/artworks')
    } catch { /* 用户取消跳转，留在本页 */ }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    publishing.value = false
  }
}

// ─── REQ-031 B1: 完稿分享（delivered；文案模板 localStorage 持久化） ───
const shareDialogVisible = ref(false)
const shareLoading = ref(false)
/** 分享平台列表加载失败（独立错误态 + 重试；弹窗仍可关闭兜底） */
const shareLoadFailed = ref(false)
const shareOpening = ref(false)
const sharePlatforms = ref<SharePlatform[]>([])
const sharePlatformId = ref<number | null>(null)
const shareText = ref('')
const shareNoHomepage = ref(false)
const shareProfile = ref<(ArtistProfileResult & { customLinks?: CustomLink[] | null }) | null>(null)
const SHARE_TEMPLATE_KEY = 'huiyue_share_template'

// 平台发布 intent URL（支持文案预填；B 站等无公开预填发布 URL → 复制文案方案）
const SHARE_INTENT_URLS = [
  { domain: 'weibo.com', intent: 'https://weibo.com/intent/post' }
]
function shareIntentUrl(platform: SharePlatform | null) {
  const hit = SHARE_INTENT_URLS.find(s => matchDomain(platform?.hostname || '', [s.domain]))
  return hit ? hit.intent : null
}

function defaultShareText() {
  return t('orderDetail.shareTemplate')
}

async function openShareDialog() {
  shareDialogVisible.value = true
  shareLoading.value = true
  shareLoadFailed.value = false
  shareNoHomepage.value = false
  try {
    const [plats, profile] = await Promise.all([
      artistPublicApi.getPlatforms(),
      artistApi.getProfile()
    ])
    sharePlatforms.value = Array.isArray(plats) ? (plats as SharePlatform[]) : []
    shareProfile.value = (profile || null) as (ArtistProfileResult & { customLinks?: CustomLink[] | null }) | null
    shareText.value = safeGetItem(SHARE_TEMPLATE_KEY) || defaultShareText()
    sharePlatformId.value = sharePlatforms.value[0]?.id ?? null
  } catch {
    sharePlatforms.value = []
    shareProfile.value = null
    shareLoadFailed.value = true
  } finally {
    shareLoading.value = false
  }
}

/** 画师在所选平台的主页链接（validateLink 校验通过才返回——F2 防投毒） */
function currentHomepage() {
  const p = sharePlatforms.value.find(x => x.id === sharePlatformId.value)
  if (!p) return null
  const links = shareProfile.value?.customLinks || []
  for (const l of links) {
    const url = typeof l === 'string' ? l : l.url
    if (!url) continue
    const chk = validateLink(url, sharePlatforms.value)
    if (chk.ok && chk.platformId === p.id) return chk.url
  }
  return null
}

async function doShare() {
  const p = sharePlatforms.value.find(x => x.id === sharePlatformId.value)
  if (!p || shareOpening.value) return
  const homepage = currentHomepage()
  if (shareText.value.includes('{homepage}') && !homepage) {
    shareNoHomepage.value = true
    return
  }
  const text = shareText.value
    .replace('{orderNo}', props.order?.order_no || '')
    .replace('{homepage}', homepage || '')
  // 模板持久化（下次打开沿用）
  safeSetItem(SHARE_TEMPLATE_KEY, shareText.value)
  shareOpening.value = true
  try {
    const intent = shareIntentUrl(p)
    if (intent) {
      // 支持文案预填：直接打开第三方发布页
      window.open(`${intent}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
      ElMessage.success(t('orderDetail.shareOpened'))
    } else {
      // 无预填机制：复制文案 + 打开平台发布主页，用户手动粘贴
      try {
        await navigator.clipboard.writeText(text)
        ElMessage.success(t('orderDetail.shareCopied'))
      } catch {
        ElMessage.warning(text)
      }
      if (homepage) window.open(homepage, '_blank', 'noopener')
      else if (p?.hostname) window.open(`https://${p.hostname}`, '_blank', 'noopener')
    }
    shareDialogVisible.value = false
  } finally {
    shareOpening.value = false
  }
}

defineExpose({ openPublish: openPublishDialog, openShare: openShareDialog })
</script>

<style scoped>
/* REQ-022 F1: 发布为作品弹窗 */
.publish-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin-bottom: 10px; }
.publish-list { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow-y: auto; }
.publish-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px 8px; border-radius: var(--r-s);
}
.publish-item:hover { background: var(--paper2); }
.publish-item--disabled { opacity: 0.55; }
.publish-file-name { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); word-break: break-all; }

/* ─── REQ-031 B1: 完稿分享 ─── */
.share-placeholders { margin-top: 6px; font-size: 12px; color: var(--ink3, #888); }
.share-alert { margin-top: 4px; }
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
