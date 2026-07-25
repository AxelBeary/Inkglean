<template>
  <div class="delivery-page">
    <div class="delivery-container" v-loading="loading">
      <el-result v-if="delivered" icon="success" :title="$t('delivery.delivered')">
        <template #sub-title>
          {{ $t('delivery.orderInfo', { no: order?.orderNo, artist: order?.artistName }) }}
        </template>
        <template #extra>
          <div v-for="d in order?.deliverables" :key="d.id" class="file-item">
            <span>📄 {{ d.fileName }}</span>
            <el-button type="primary" @click="openFile(d.url)">{{ $t('delivery.download') }}</el-button>
          </div>
          <el-empty v-if="!order?.deliverables?.length" :description="$t('delivery.noFiles')" :image-size="60" />
        </template>
      </el-result>

      <el-result v-else-if="!loading" icon="info" :title="$t('delivery.notDelivered')">
        <template #sub-title>
          {{ $t('delivery.orderInfo', { no: order?.orderNo, artist: order?.artistName }) }}
        </template>
      </el-result>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { orderApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const route = useRoute()
const orderNo = route.params.orderNo

const order = ref(null)
const loading = ref(true)

const delivered = computed(() => order.value?.status === 'delivered')

function openFile(url) {
  window.open(url, '_blank')
}

onMounted(async () => {
  try {
    order.value = await orderApi.delivery(orderNo)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.delivery-page {
  min-height: 100vh;
  background: var(--bg-page);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  transition: background 0.3s;
}
.delivery-container { max-width: 500px; width: 100%; }
.file-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; gap: 16px;
}
</style>
