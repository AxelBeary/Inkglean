<template>
  <div class="delivery-page">
    <div class="delivery-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}/track`)" :title="$t('track.backHome')" :content="$t('delivery.delivered')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('track.backHome') }}</span></template>
      </el-page-header>

      <!-- F1 围剿：凭追踪链接验证（令牌承载身份，QQ 验证已退役） -->
      <el-card style="margin-top: 16px" v-if="!verified">
        <el-form @submit.prevent="verify" label-position="top">
          <el-form-item :label="$t('track.linkLabel')">
            <el-input v-model="linkInput" :placeholder="$t('track.linkPlaceholder')" clearable @keyup.enter="verify" />
          </el-form-item>
          <p class="link-hint">{{ $t('track.pasteHint') }}</p>
          <el-button type="primary" @click="verify" :loading="verifying" style="width: 100%">
            {{ $t('track.search') }}
          </el-button>
        </el-form>
        <!-- 波 M：验证失败页内错误态（不再只弹 toast） -->
        <p v-if="verifyError" class="verify-error" role="alert">{{ $t('delivery.verifyFailed') }}</p>
      </el-card>

      <!-- 交付内容 -->
      <el-card style="margin-top: 16px" v-if="verified && delivery && delivery.deliverables?.length">
        <template #header>
          <span>{{ $t('delivery.orderInfo', { no: delivery.orderNo, artist: delivery.artistName }) }}</span>
        </template>

        <div v-if="delivery.deliverables?.length">
          <div v-for="d in delivery.deliverables" :key="d.id" class="file-item">
            <div class="file-info">
              <span class="file-name">{{ d.fileName }}</span>
              <span class="file-size" v-if="d.fileSize">{{ formatBytes(d.fileSize) }}</span>
            </div>
            <!-- 815 拍板 #4：一次性下载——已锁定显示提示，需画师再许可 -->
            <el-tag v-if="d.downloadLocked" type="info" size="small">{{ $t('delivery.downloadLocked') }}</el-tag>
            <el-button v-else type="primary" size="small" :loading="downloadingId === d.id" :disabled="downloadingId !== null && downloadingId !== d.id" @click="downloadFile(d)">{{ $t('delivery.download') }}</el-button>
          </div>
        </div>
      </el-card>

      <!-- 未交付 -->
      <el-card style="margin-top: 16px" v-if="verified && !delivery?.deliverables?.length && delivery">
        <el-result icon="info" :title="$t('delivery.notDelivered')" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index.js'
import { fetchArtistPublicProfile } from '../../composables/useArtistPublicProfile.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { usePalette } from '../../composables/usePalette.js'
import { formatBytes } from '../../utils/image-resize.js'
import { downloadAsset } from '../../utils/download.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain
const orderNo = route.params.orderNo

// M2: 流程页跟随画师 palette 配色（轻量拉画师信息；加载失败回落 paper，不影响交付主流程）
const artist = ref(null)
const paletteId = computed(() => artist.value?.paletteId || 'paper')
usePalette(paletteId)

const linkInput = ref('')
const token = ref('')
const verified = ref(false)
const verifying = ref(false)
const loading = ref(false)
const delivery = ref(null)
// 波 M：验证失败页内错误态
const verifyError = ref(false)
// 815 拍板 #4：一次性下载进行中文件 id（防连点）
const downloadingId = ref(null)

async function downloadFile(d) {
  if (downloadingId.value !== null) return
  downloadingId.value = d.id
  try {
    // 一次性下载链路：start 签发 → fetch 全量接收 → confirm 锁定（IP/时间留痕）
    const { url } = await orderApi.deliveryDownloadStart(delivery.value.orderNo, d.id, token.value)
    await downloadAsset(url, d.fileName)
    await orderApi.deliveryDownloadConfirm(delivery.value.orderNo, d.id, token.value)
    d.downloadLocked = true
  } catch (err) {
    if (err?.code === 'DOWNLOAD_LOCKED') {
      d.downloadLocked = true
      ElMessage.warning(t('delivery.downloadLockedMsg'))
    } else {
      ElMessage.error(t('delivery.downloadFailed'))
    }
  } finally {
    downloadingId.value = null
  }
}

async function verify() {
  // 支持直达（?token=）与粘贴完整链接两种入口
  let no = orderNo
  let tok = token.value
  if (route.query.token) {
    tok = route.query.token
  } else if (linkInput.value.trim()) {
    let url
    try {
      url = new URL(linkInput.value.trim(), window.location.origin)
    } catch {
      ElMessage.warning(t('track.linkInvalid'))
      return
    }
    no = url.searchParams.get('no') || no
    tok = url.searchParams.get('token') || tok
  }
  if (!tok) return ElMessage.warning(t('track.enterLink'))

  verifying.value = true
  verifyError.value = false
  try {
    delivery.value = await orderApi.delivery(no, tok)
    verified.value = true
  } catch (err) {
    ElMessage.error(err.message)
    verifyError.value = true
  } finally {
    verifying.value = false
  }
}

// 如果 URL 带了 token 参数，自动验证
onMounted(() => {
  if (route.query.token) verify()
  // M2: 轻量拉画师信息取 paletteId（失败静默回落 paper）；战役留账：in-flight 去重共享请求
  fetchArtistPublicProfile(subdomain).then((a) => { artist.value = a }).catch(() => {})
})
</script>

<style scoped>
.delivery-page {
  min-height: 100vh;
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  /* K1（波2，灰沼教训）：换肤即时切换，页面根不挂主题变量过渡 */
}
.delivery-container { max-width: 600px; margin: 0 auto; }
/* 波 M：验证失败页内错误态 */
.verify-error {
  margin: 12px 0 0; text-align: center;
  color: var(--el-color-danger); font-size: 13px;
}
.link-hint { margin: -6px 0 14px; font-size: 12px; color: var(--text-secondary); }
.file-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid var(--border-color);
}
.file-info { display: flex; flex-direction: column; gap: 4px; }
.file-name { color: var(--text-primary); font-weight: 500; }
.file-size { color: var(--text-secondary); font-size: 12px; }
</style>
