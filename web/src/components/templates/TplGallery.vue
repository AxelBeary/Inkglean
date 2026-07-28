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
        lazy
      />
      <p class="tpl-gallery-caption" v-if="art.title">{{ art.title }}</p>
    </div>
  </div>
</template>

<script setup>
import { useArtistData } from '../../composables/useArtistData.js'

const props = defineProps({
  artworks: { type: Array, default: () => [] },
  /** grid: 等高网格 | editorial: 大小交错 | masonry: 瀑布流 */
  layout: { type: String, default: 'grid' }
})

const { imgUrl, previewList } = useArtistData(props)
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
.tpl-gallery-caption {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--pal-text-dim);
}
.tpl-gallery--masonry .tpl-gallery-caption {
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
