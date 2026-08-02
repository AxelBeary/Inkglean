<template>
  <div class="tpl-gallery" :class="`tpl-gallery--${layout}`">
    <div
      v-for="(art, index) in artworks"
      :key="art.id"
      class="tpl-gallery-item tpl-reveal"
    >
      <!-- #15: aspect-ratio 占位——后端返回 width/height 时精确预留高度，lazy 加载零 reflow；缺失时骨架兜底 -->
      <div class="tpl-gallery-img-wrap" :style="ratioStyle(art)">
        <el-image
          :src="imgUrl(art.image_path)"
          fit="cover"
          class="tpl-gallery-img"
          :alt="art.title || $t('artistHome.artworks')"
          :preview-src-list="previewList"
          :initial-index="index"
          preview-teleported
          hide-on-click-modal
          lazy
        >
          <!-- #50: 加载占位——无 width/height 时兜底防跳动 -->
          <template #placeholder>
            <div class="tpl-gallery-skeleton" />
          </template>
        </el-image>
      </div>
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

// #15: 后端返回 width/height 时生成 aspect-ratio 样式，精确预留高度防 reflow；缺失时返回空对象，骨架兜底
function ratioStyle(art) {
  return art.width && art.height ? { aspectRatio: `${art.width} / ${art.height}` } : {}
}

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
  height: auto;
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
/* #15: aspect-ratio 占位容器——有 width/height 时撑出精确高度，el-image 填满；缺失时高度由内容决定，骨架兜底 */
.tpl-gallery-img-wrap {
  width: 100%;
}
.tpl-gallery-img-wrap .tpl-gallery-img {
  display: block;
  height: 100%;
}
/* #15: 有 aspect-ratio 时占位区填满容器（无 ratio 时高度链为 auto，由骨架 min-height 兜底） */
.tpl-gallery-img-wrap :deep(.el-image__placeholder) { height: 100%; }
/* #50: 加载骨架占位——无 width/height 时兜底防瀑布流跳动 */
.tpl-gallery-skeleton {
  width: 100%;
  height: 100%;
  min-height: 200px;
  background: linear-gradient(110deg, var(--pal-surface) 30%, var(--pal-border) 50%, var(--pal-surface) 70%);
  background-size: 200% 100%;
  animation: tpl-gallery-shimmer 1.5s ease-in-out infinite;
}
@keyframes tpl-gallery-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
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
