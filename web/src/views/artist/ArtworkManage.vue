<template>
  <ArtistLayout>
    <h2>{{ $t('artworks.title') }}</h2>

    <!-- 上传区 -->
    <el-card style="margin: 16px 0">
      <el-upload
        drag multiple :auto-upload="true" :http-request="handleUpload"
        accept="image/*" :show-file-list="false"
      >
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('artworks.dragUpload') }}</p>
        <template #tip>
          <p style="color: var(--text-secondary); font-size: 12px">{{ $t('artworks.tip') }}</p>
        </template>
      </el-upload>
    </el-card>

    <!-- 作品网格 -->
    <div class="artwork-grid" v-loading="loading">
      <div v-for="art in artworks" :key="art.id" class="artwork-item">
        <el-image :src="`/uploads/${art.image_path}`" fit="cover" class="artwork-img"
          :preview-src-list="artworks.map(a => `/uploads/${a.image_path}`)" />
        <div class="artwork-actions">
          <el-button size="small" type="danger" @click="remove(art)">{{ $t('common.delete') }}</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && artworks.length === 0" :description="$t('artworks.empty')" />
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const artworks = ref([])
const loading = ref(true)

async function handleUpload({ file }) {
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName })
    ElMessage.success(t('artworks.uploaded'))
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
  }
}

async function remove(art) {
  try {
    await ElMessageBox.confirm(t('artworks.confirmDelete'), t('common.confirmDeleteTitle'), { type: 'warning' })
    await artistApi.deleteArtwork(art.id)
    ElMessage.success(t('common.deleted'))
    await loadArtworks()
  } catch { /* cancelled */ }
}

async function loadArtworks() {
  loading.value = true
  try {
    artworks.value = await artistApi.getArtworks()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadArtworks)
</script>

<style scoped>
.artwork-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px; margin-top: 16px;
}
.artwork-item { position: relative; border-radius: 8px; overflow: hidden; }
.artwork-img { width: 100%; height: 180px; display: block; }
.artwork-actions {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.5); padding: 8px; text-align: center;
  opacity: 0; transition: opacity 0.2s;
}
.artwork-item:hover .artwork-actions { opacity: 1; }
</style>
