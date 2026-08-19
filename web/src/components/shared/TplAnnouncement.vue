<!--
  TplAnnouncement — 画师小公告（F3，共享逻辑组件）

  硬约束：只输出内容和状态，不写任何布局/装饰样式。
  视觉完全由各模板的 class 控制（classic 强调线 / gallery 展签 / folio 内联 / atelier 便签）。
  模板通过 :deep(.tpl-announcement-*) 选择内部元素定制样式。

  数据契约：artist.announcement = { text, expiresAt } | null
  过期判断后端已做（公开 API 过期返回 null），前端不重复判断。
-->
<template>
  <div v-if="artist?.announcement" class="tpl-announcement" role="note">
    <span class="tpl-announcement-text">{{ artist.announcement.text }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps({
  artist: { type: Object, default: () => ({}) }
})
</script>
