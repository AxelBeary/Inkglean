<template>
  <div class="artist-home">
    <!-- 顶部信息 -->
    <header class="hero">
      <div class="hero-inner">
        <el-avatar :size="80" :src="artist.avatar" class="avatar">
          {{ artist.name?.charAt(0) }}
        </el-avatar>
        <h1 class="name">{{ artist.name }}</h1>
        <p class="bio">{{ artist.bio }}</p>
        <div class="status-badge">
          <el-tag :type="statusType" size="large" effect="dark">
            {{ statusText }}
          </el-tag>
        </div>
        <!-- 外链按钮 -->
        <div class="social-links" v-if="artist.weiboUrl || artist.bilibiliUrl">
          <el-button v-if="artist.weiboUrl" @click="openLink(artist.weiboUrl)" round>
            🔗 我的微博
          </el-button>
          <el-button v-if="artist.bilibiliUrl" @click="openLink(artist.bilibiliUrl)" round>
            📺 我的B站
          </el-button>
        </div>
      </div>
    </header>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button type="primary" size="large" @click="$router.push('/order')"
        :disabled="artist.status !== 'open'" round>
        🎨 我要约稿
      </el-button>
      <el-button size="large" @click="$router.push('/track')" round>
        📋 查询进度
      </el-button>
    </div>

    <!-- 价格表 -->
    <section class="section" v-if="artist.tiers?.length">
      <h2 class="section-title">💰 价格表</h2>
      <div class="tier-grid">
        <el-card v-for="tier in artist.tiers" :key="tier.id" class="tier-card" shadow="hover">
          <div class="tier-image" v-if="tier.example_image">
            <el-image :src="`/uploads/${tier.example_image}`" fit="cover" />
          </div>
          <h3>{{ tier.name }}</h3>
          <p class="price">¥{{ tier.price }}</p>
          <p class="desc">{{ tier.description }}</p>
          <p class="days" v-if="tier.work_days">⏱ 约 {{ tier.work_days }} 天</p>
        </el-card>
      </div>
    </section>

    <!-- 作品展示 -->
    <section class="section" v-if="artist.artworks?.length">
      <h2 class="section-title">🖼 作品展示</h2>
      <div class="artwork-grid">
        <el-image
          v-for="art in artist.artworks" :key="art.id"
          :src="`/uploads/${art.image_path}`"
          :preview-src-list="artworkUrls"
          fit="cover"
          class="artwork-item"
          lazy
        />
      </div>
    </section>

    <!-- 约稿须知 -->
    <section class="section" v-if="artist.rules">
      <h2 class="section-title">📜 约稿须知</h2>
      <el-card class="rules-card">
        <div v-html="artist.rules" class="rules-content"></div>
      </el-card>
    </section>

    <footer class="footer">
      <p>Powered by 画师约稿平台</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { artistPublicApi } from '../../api/index.js'

const artist = ref({})
const loading = ref(true)

// 从子域名或 URL 参数获取画师标识
// 生产环境通过子域名解析，开发环境用 ?artist=xxx
function getSubdomain() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('artist')) return params.get('artist')
  // 从子域名提取
  const host = window.location.hostname
  const parts = host.split('.')
  if (parts.length >= 3) return parts[0]
  return 'alice' // 开发默认
}

const statusType = computed(() => {
  const map = { open: 'success', full: 'warning', break: 'danger' }
  return map[artist.value.status] || 'info'
})

const statusText = computed(() => {
  const map = { open: '✅ 可约稿', full: '⏳ 已排满', break: '💤 休息中' }
  return map[artist.value.status] || '未知'
})

const artworkUrls = computed(() =>
  (artist.value.artworks || []).map(a => `/uploads/${a.image_path}`)
)

function openLink(url) {
  window.open(url, '_blank')
}

onMounted(async () => {
  try {
    artist.value = await artistPublicApi.getProfile(getSubdomain())
  } catch (err) {
    ElMessage.error('画师不存在或加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.artist-home { max-width: 800px; margin: 0 auto; padding-bottom: 40px; }

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px; text-align: center; color: white;
}
.hero .name { font-size: 28px; margin: 12px 0 8px; }
.hero .bio { opacity: 0.9; font-size: 15px; }
.status-badge { margin-top: 12px; }
.social-links { margin-top: 16px; display: flex; gap: 12px; justify-content: center; }

.action-bar {
  display: flex; gap: 12px; justify-content: center;
  padding: 20px; margin-top: -20px; position: relative; z-index: 1;
}

.section { padding: 0 16px; margin-top: 24px; }
.section-title { font-size: 20px; margin-bottom: 16px; }

.tier-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;
}
.tier-card h3 { margin: 8px 0 4px; }
.tier-card .price { font-size: 24px; color: #e6a23c; font-weight: bold; }
.tier-card .desc { color: #666; font-size: 14px; margin: 4px 0; }
.tier-card .days { color: #999; font-size: 13px; }
.tier-image { border-radius: 8px; overflow: hidden; height: 140px; }
.tier-image .el-image { width: 100%; height: 100%; }

.artwork-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;
}
.artwork-item { border-radius: 8px; height: 160px; width: 100%; }

.rules-card { margin-top: 8px; }
.rules-content { line-height: 1.8; font-size: 15px; }

.footer { text-align: center; padding: 24px; color: #999; font-size: 13px; }

@media (max-width: 480px) {
  .hero { padding: 24px 16px; }
  .hero .name { font-size: 22px; }
  .action-bar { flex-direction: column; align-items: center; }
  .tier-grid { grid-template-columns: 1fr; }
}
</style>
