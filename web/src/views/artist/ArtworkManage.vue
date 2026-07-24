<template>
  <ArtistLayout>
    <h2>🖼 作品管理</h2>

    <!-- 上传区 -->
    <el-card style="margin: 16px 0">
      <el-upload
        drag multiple :auto-upload="true" :http-request="handleUpload"
        accept="image/*" :show-file-list="false"
      >
        <el-icon style="font-size: 40px; color: #999"><Upload /></el-icon>
        <p>拖拽图片到此处，或点击上传作品</p>
        <template #tip>
          <p style="color: #999; font-size: 12px">支持 JPG / PNG / WebP，建议尺寸 ≥ 800px</p>
        </template>
      </el-upload>
    </el-card>

    <!-- 作品网格 -->
    <div class="artwork-grid" v-loading="loading">
      <div v-for="art in artworks" :key="art.id" class="artwork-item">
        <el-image :src="`/uploads/${art.image_path}`" fit="cover" class="artwork-img"
          :preview-src-list="artworks.map(a => `/uploads/${a.image_path}`)" />
        <div class="artwork-actions">
          <el-button size="small" type="danger" @click="remove(art)">删除</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && artworks.length === 0" description="还没有作品，上传一些吧" />
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import ArtistLayout from '../../components/ArtistLayout.vue'

const artworks = ref([])
const loading = ref(true)

async function handleUpload({ file }) {
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName })
    ElMessage.success('上传成功')
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err.message || '上传失败')
  }
}

async function remove(art) {
  try {
    await ElMessageBox.confirm('确定删除这张作品？', '确认删除', { type: 'warning' })
    await artistApi.deleteArtwork(art.id)
    ElMessage.success('已删除')
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
