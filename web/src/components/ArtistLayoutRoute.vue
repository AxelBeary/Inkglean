<script setup lang="ts">
// REQ-037 批2 A1: 画师后台嵌套路由布局载体——ArtistLayout 保持 slot API 不动
// （817 修复：/tiers 已归入嵌套，不再内嵌复用），本包装为嵌套子路由提供 router-view；
// 内容区过渡沿用 ArtistLayout 内部 keyed transition（02C 纪律：导航稳定只动内容区）
import ArtistLayout from './ArtistLayout.vue'
// 818-E 教训修正：TourOverlay 改挂 ArtistLayout 单根内——本组件若并列第二个根节点
// 会形成 fragment，被 App.vue 顶层 Transition（mode=out-in）包裹时渲染异常致白屏（e8 抓出）。
</script>

<template>
  <ArtistLayout>
    <router-view />
  </ArtistLayout>
</template>
