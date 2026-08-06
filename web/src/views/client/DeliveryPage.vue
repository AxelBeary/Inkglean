<template>
  <div class="delivery-page">
    <div class="delivery-container" v-loading="loading">
      <el-page-header @back="$router.push(`/artist/${subdomain}/track`)" :title="$t('track.backHome')" :content="$t('delivery.delivered')">
        <!-- 打磨批 E：title 文本 aria-hidden——EP page-header icon 自带 aria-label=title，叠加读两遍；视觉不变 -->
        <template #title><span aria-hidden="true">{{ $t('track.backHome') }}</span></template>
      </el-page-header>

      <!-- 需要输入 QQ 验证 -->
      <el-card style="margin-top: 16px" v-if="!verified">
        <el-form @submit.prevent="verify" label-position="top">
          <el-form-item :label="$t('track.qqLabel')">
            <el-input v-model="qq" :placeholder="$t('track.qqPlaceholder')" clearable @keyup.enter="verify" />
          </el-form-item>
          <el-button type="primary" @click="verify" :loading="verifying" style="width: 100%">
            {{ $t('track.search') }}
          </el-button>
        </el-form>
      </el-card>

      <!-- 交付内容 -->
      <el-card style="margin-top: 16px" v-if="verified && delivery">
        <template #header>
          <span>{{ $t('delivery.orderInfo', { no: delivery.orderNo, artist: delivery.artistName }) }}</span>
        </template>

        <div v-if="delivery.deliverables?.length">
          <div v-for="d in delivery.deliverables" :key="d.id" class="file-item">
            <div class="file-info">
              <span class="file-name">{{ d.fileName }}</span>
              <span class="file-size" v-if="d.fileSize">{{ formatSize(d.fileSize) }}</span>
            </div>
            <el-button type="primary" size="small" @click="downloadFile(d.url, d.fileName)">{{ $t('delivery.download') }}</el-button>
          </div>
        </div>
        <el-empty v-else :description="$t('delivery.noFiles')" :image-size="60" />
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
import { orderApi, artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { usePalette } from '../../composables/usePalette.js'

const { t } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain
const orderNo = route.params.orderNo

// M2: 流程页跟随画师 palette 配色（轻量拉画师信息；加载失败回落 paper，不影响交付主流程）
const artist = ref(null)
const paletteId = computed(() => artist.value?.paletteId || 'paper')
usePalette(paletteId)

const qq = ref('')
const verified = ref(false)
const verifying = ref(false)
const loading = ref(false)
const delivery = ref(null)

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function downloadFile(url, fileName) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName || 'download'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    ElMessage.error(t('delivery.downloadFailed'))
  }
}

async function verify() {
  if (!qq.value.trim()) return ElMessage.warning(t('track.enterQq'))

  verifying.value = true
  try {
    delivery.value = await orderApi.delivery(orderNo, qq.value.trim())
    verified.value = true
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    verifying.value = false
  }
}

// 如果 URL 带了 qq 参数（从 track 页跳转），自动验证
onMounted(() => {
  if (route.query.qq) {
    qq.value = route.query.qq
    verify()
  }
  // M2: 轻量拉画师信息取 paletteId（失败静默回落 paper）
  artistPublicApi.getProfile(subdomain).then((a) => { artist.value = a }).catch(() => {})
})
</script>

<style scoped>
.delivery-page {
  min-height: 100vh;
  background: var(--pal-bg, var(--bg-page));
  padding: 16px;
  transition: background 0.3s;
}
.delivery-container { max-width: 600px; margin: 0 auto; }
.file-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid var(--border-color);
}
.file-info { display: flex; flex-direction: column; gap: 4px; }
.file-name { color: var(--text-primary); font-weight: 500; }
.file-size { color: var(--text-secondary); font-size: 12px; }
</style>
