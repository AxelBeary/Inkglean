<template>
  <div class="track-page">
    <div class="track-container">
      <el-page-header @back="$router.push(`/artist/${subdomain}`)" :title="$t('track.backHome')" :content="$t('track.title')" />

      <!-- 查询输入 -->
      <el-card style="margin-top: 16px">
        <div class="search-bar">
          <el-input v-model="orderNo" :placeholder="$t('track.inputPlaceholder')" size="large"
            @keyup.enter="search" clearable />
          <el-button type="primary" size="large" @click="search" :loading="searching">
            {{ $t('track.search') }}
          </el-button>
        </div>
      </el-card>

      <!-- 查询结果 -->
      <el-card style="margin-top: 16px" v-if="order">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="$t('track.orderNo')">{{ order.orderNo }}</el-descriptions-item>
          <el-descriptions-item :label="$t('track.artist')">{{ order.artistName }}</el-descriptions-item>
          <el-descriptions-item :label="$t('track.type')">{{ order.tierName || $t('common.custom') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('track.status')">
            <el-tag :type="statusType(order.status)" size="small">
              {{ $t(`common.orderStatus.${order.status}`) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('track.position')" v-if="order.position">
            {{ $t('track.positionText', { pos: order.position, total: order.total }) }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('track.orderTime')">{{ formatDate(order.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 进度步骤 -->
        <el-steps :active="stepActive" finish-status="success" simple style="margin-top: 24px">
          <el-step :title="$t('track.stepSubmitted')" />
          <el-step :title="$t('track.stepConfirmed')" />
          <el-step :title="$t('track.stepWip')" />
          <el-step :title="$t('track.stepDone')" />
          <el-step :title="$t('track.stepDelivered')" />
        </el-steps>

        <!-- 交付文件 -->
        <div v-if="order.deliverables?.length" style="margin-top: 24px">
          <h4>{{ $t('track.deliverables') }}</h4>
          <div v-for="d in order.deliverables" :key="d.id" class="file-item">
            <span>📄 {{ d.fileName }}</span>
            <el-button size="small" @click="openFile(d.url)">{{ $t('common.download') }}</el-button>
          </div>
        </div>
      </el-card>

      <!-- 查询其他 -->
      <div style="text-align: center; margin-top: 16px" v-if="order">
        <el-button text @click="resetSearch">{{ $t('track.otherOrder') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const route = useRoute()
const subdomain = route.params.subdomain

const orderNo = ref('')
const order = ref(null)
const searching = ref(false)

const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')

const stepActive = computed(() => {
  const map = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status] ?? 0
})

function formatDate(str) {
  if (!str) return ''
  const loc = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Date(str).toLocaleString(loc)
}

async function search() {
  if (!orderNo.value.trim()) {
    ElMessage.warning(t('track.enterOrderNo'))
    return
  }
  searching.value = true
  try {
    order.value = await orderApi.track(orderNo.value.trim())
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    searching.value = false
  }
}

function resetSearch() {
  order.value = null
  orderNo.value = ''
}

function openFile(url) {
  window.open(url, '_blank')
}

onMounted(() => {
  if (route.query.no) {
    orderNo.value = route.query.no
    search()
  }
})
</script>

<style scoped>
.track-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 16px;
  transition: background 0.3s;
}
.track-container { max-width: 600px; margin: 0 auto; }
.search-bar { display: flex; gap: 12px; }
.search-bar .el-input { flex: 1; }
.file-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px solid var(--border-color);
}
</style>
