<script setup lang="ts">
// REQ-037 批2 A1: 画师后台嵌套路由布局载体——ArtistLayout 保持 slot API 不动
// （817 修复：/tiers 已归入嵌套，不再内嵌复用），本包装为嵌套子路由提供 router-view；
// 内容区过渡沿用 ArtistLayout 内部 keyed transition（02C 纪律：导航稳定只动内容区）
import ArtistLayout from './ArtistLayout.vue'
// 818-E: 分步高亮导览浮层挂在后台布局载体（子路由切换常驻，不打断 tour）
import TourOverlay from './artist/tour/TourOverlay.vue'
</script>

<template>
  <ArtistLayout>
    <router-view />
  </ArtistLayout>
  <TourOverlay />
</template>
