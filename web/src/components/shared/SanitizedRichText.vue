<template>
  <!-- 渲染契约：入参必须已经 sanitizeHtml 消毒（REQ-042）；本组件是已消毒富文本的唯一统一渲染入口（战役留账清收） -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-html="html"></div>
</template>

<script setup lang="ts">
defineProps<{
  /** 已经过 sanitizeHtml 消毒的富文本 HTML */
  html: string
}>()
</script>
