<template>
  <div class="delivery-page">
    <el-card class="delivery-card" v-if="data">
      <el-result :icon="data.status === 'delivered' ? 'success' : 'info'"
        :title="data.status === 'delivered' ? '作品已交付' : '作品尚未交付'">
        <template #sub-title>
          <p>订单号：{{ data.orderNo }} | 画师：{{ data.artistName }}</p>
        </template>
      </el-result>

      <div v-if="data.deliverables?.length" class="file-list">
        <el-card v-for="d in data.deliverables" :key="d.id" shadow="hover" class="file-item">
          <div class="file-info">
            <span class="file-name">📄 {{ d.fileName }}</span>
            <span class="file-size">{{ formatSize(d.fileSize) }}</span>
          </div>
          <el-button type="primary" @click="download(d.url)">⬇ 下载</el-button>
        </el-card>
      </div>

      <el-empty v-else description="暂无交付文件" />
    </el-card>

    <el-card v-else class="delivery-card">
      <el-skeleton :rows="4" animated />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const route = useRoute()
const data = ref(null)

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function download(url) {
  window.open(url, '_blank')
}

onMounted(async () => {
  try {
    data.value = await orderApi.delivery(route.params.orderNo)
  } catch (err) {
    ElMessage.error(err.message)
  }
})
</script>

<style scoped>
.delivery-page { max-width: 600px; margin: 40px auto; padding: 16px; }
.file-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.file-item { display: flex; justify-content: space-between; align-items: center; }
.file-info { display: flex; flex-direction: column; }
.file-name { font-weight: 500; }
.file-size { color: #999; font-size: 13px; }
</style>
