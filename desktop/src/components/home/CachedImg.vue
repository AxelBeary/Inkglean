<script setup lang="ts">
// 缓存图（本地核心环波7 · F5）：经图缓存层解析后渲染——首拉走网络并落盘，之后读本地免流量。
// 一切失败静默不渲染（父级布局自带占位语义，不炸不吵）；等高纪律：定尺寸不撑布局。
import { ref, watch } from 'vue'
import { useImageCacheStore } from '../../stores/imageCache'

const props = defineProps<{
  /** 完整图片 URL（宿主组好，含 API 基址） */
  url: string
  alt?: string
}>()

const cache = useImageCacheStore()
const src = ref('')

watch(
  () => props.url,
  (u) => {
    src.value = ''
    if (!u) return
    void cache.resolve(u).then(s => {
      // 竞态自卫：url 已换时不回填旧图
      if (props.url === u && s) src.value = s
    })
  },
  { immediate: true }
)
</script>

<template>
  <img v-if="src" class="cached-img" :src="src" :alt="alt ?? ''" loading="lazy" />
</template>

<style scoped>
.cached-img {
  width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex: none;
  border: 1px solid rgba(38, 37, 32, .1);
}
</style>
