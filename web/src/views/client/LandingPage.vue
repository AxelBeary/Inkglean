<template>
  <div class="landing">
    <header class="hero">
      <h1>🎨 画师约稿平台</h1>
      <p>找到你喜欢的画师，开始约稿</p>
    </header>

    <div class="artist-grid" v-loading="loading">
      <el-card
        v-for="a in artists" :key="a.id"
        class="artist-card" shadow="hover"
        @click="$router.push(`/home?artist=${a.subdomain}`)"
      >
        <div class="card-top">
          <el-avatar :size="64" :src="a.avatar ? `/uploads/${a.avatar}` : undefined">
            {{ a.name?.charAt(0) }}
          </el-avatar>
          <div class="card-info">
            <h3>{{ a.name }}</h3>
            <el-tag :type="statusType(a.status)" size="small" effect="dark">
              {{ statusText(a.status) }}
            </el-tag>
          </div>
        </div>
        <p class="bio">{{ a.bio || '这位画师还没有写简介' }}</p>
        <div class="card-links" v-if="a.weiboUrl || a.bilibiliUrl">
          <el-button v-if="a.weiboUrl" size="small" text @click.stop="openLink(a.weiboUrl)">微博</el-button>
          <el-button v-if="a.bilibiliUrl" size="small" text @click.stop="openLink(a.bilibiliUrl)">B站</el-button>
        </div>
        <el-button type="primary" class="enter-btn" round>进入主页 →</el-button>
      </el-card>
    </div>

    <el-empty v-if="!loading && artists.length === 0" description="还没有画师入驻" />

    <footer class="footer">Powered by 画师约稿平台</footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { artistPublicApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'

const artists = ref([])
const loading = ref(true)

const statusType = (s) => ({ open: 'success', full: 'warning', break: 'danger' }[s] || 'info')
const statusText = (s) => ({ open: '可约稿', full: '已排满', break: '休息中' }[s] || '未知')

function openLink(url) { window.open(url, '_blank') }

onMounted(async () => {
  try {
    artists.value = await artistPublicApi.getAll()
  } catch (err) {
    ElMessage.error('加载画师列表失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.landing { max-width: 900px; margin: 0 auto; padding-bottom: 40px; }

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 48px 20px; text-align: center; color: white;
}
.hero h1 { font-size: 32px; margin-bottom: 8px; }
.hero p { opacity: 0.9; font-size: 16px; }

.artist-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px; padding: 24px 16px;
}
.artist-card { cursor: pointer; transition: transform 0.2s; }
.artist-card:hover { transform: translateY(-4px); }

.card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.card-info h3 { margin: 0 0 4px; font-size: 18px; }
.bio { color: #666; font-size: 14px; line-height: 1.6; min-height: 44px; }
.card-links { margin: 8px 0; }
.enter-btn { width: 100%; margin-top: 12px; }

.footer { text-align: center; padding: 24px; color: #999; font-size: 13px; }

@media (max-width: 480px) {
  .hero { padding: 32px 16px; }
  .hero h1 { font-size: 24px; }
  .artist-grid { grid-template-columns: 1fr; padding: 16px 12px; }
}
</style>
