<template>
  <div class="tpl-gallery" :class="`tpl-gallery--${layout}`">
    <div
      v-for="(art, index) in artworks"
      :key="art.id"
      class="tpl-gallery-item tpl-reveal"
    >
      <el-image
        :src="imgUrl(art.image_path)"
        fit="cover"
        class="tpl-gallery-img"
        :alt="art.title || $t('artistHome.artworks')"
        :preview-src-list="previewList"
        :initial-index="index"
        preview-teleported
        lazy
      />
      <div class="tpl-gallery-meta">
        <p class="tpl-gallery-caption" v-if="art.title">{{ art.title }}</p>
        <!-- F1: 点赞（颜色/大小由模板 class 覆盖） -->
        <ArtworkLikeButton
          class="tpl-gallery-like"
          :artwork-id="art.id"
          :initial-count="art.like_count || 0"
          :liked="isLiked(art.id)"
          :subdomain="subdomain"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useArtistData } from '../../composables/useArtistData.js'
import ArtworkLikeButton from '../shared/ArtworkLikeButton.vue'

const props = defineProps({
  artworks: { type: Array, default: () => [] },
  /** grid: 等高网格 | editorial: 大小交错 | masonry: 瀑布流（v0.19 默认） */
  layout: { type: String, default: 'masonry' },
  /** F1: 点赞 localStorage 按画师隔离（huiyue_liked_${subdomain}） */
  subdomain: { type: String, default: '' }
})

const { imgUrl, previewList } = useArtistData(props)

// F1: 初始已赞集合（localStorage，按画师隔离）
function readLikedIds() {
  try {
    const raw = localStorage.getItem(`huiyue_liked_${props.subdomain}`)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? new Set(ids) : new Set()
  } catch { return new Set() }
}
const likedIds = readLikedIds()
function isLiked(id) { return likedIds.has(id) }
</script>

<style scoped>
/* ===== grid：等高网格（classic）===== */
.tpl-gallery--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.tpl-gallery--grid .tpl-gallery-img {
  width: 100%;
  height: 200px;
  border-radius: 10px;
  cursor: zoom-in;
}

/* ===== editorial：大小交错（gallery）===== */
.tpl-gallery--editorial {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
}
.tpl-gallery--editorial .tpl-gallery-item {
  width: 82%;
  text-align: center;
}
.tpl-gallery--editorial .tpl-gallery-item:nth-child(even) {
  width: 56%;
  align-self: flex-end;
  margin-right: 6%;
}
.tpl-gallery--editorial .tpl-gallery-img {
  width: 100%;
  height: auto;
  cursor: zoom-in;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.tpl-gallery--editorial .tpl-gallery-item:hover .tpl-gallery-img {
  transform: scale(1.02);
}

/* ===== masonry：瀑布流（folio）===== */
.tpl-gallery--masonry {
  columns: 2;
  column-gap: 20px;
}
.tpl-gallery--masonry .tpl-gallery-item {
  break-inside: avoid;
  margin-bottom: 20px;
  background: var(--pal-surface);
  overflow: hidden;
  border-radius: 4px;
}
.tpl-gallery--masonry .tpl-gallery-img {
  width: 100%;
  display: block;
  cursor: zoom-in;
}

/* ===== 通用 ===== */
.tpl-gallery-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 12px 0 0;
}
.tpl-gallery-caption {
  margin: 0;
  font-size: 13px;
  color: var(--pal-text-dim);
  flex: 1;
  min-width: 0;
}
/* F1: 点赞按钮基线（颜色/大小由模板 class 覆盖） */
.tpl-gallery-like {
  font-size: 14px;
  color: var(--pal-text-dim);
  flex-shrink: 0;
  transition: color 0.2s;
}
.tpl-gallery-like:hover { color: var(--color-primary); }
.tpl-gallery--masonry .tpl-gallery-meta {
  padding: 12px 16px;
  margin: 0;
}

@media (max-width: 768px) {
  .tpl-gallery--editorial .tpl-gallery-item,
  .tpl-gallery--editorial .tpl-gallery-item:nth-child(even) {
    width: 100%;
    margin-right: 0;
  }
  .tpl-gallery--masonry {
    columns: 1;
  }
}
</style>
