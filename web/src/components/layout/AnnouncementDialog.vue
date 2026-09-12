<template>
  <!-- REQ-043 I4: 平台公告弹窗（点开即已读；本地记录已读时间戳，新公告重新标点）
       F-09 巨型文件拆分：自 ArtistLayout.vue 原样搬入；公告数据由父页加载并下发，
       显隐 v-model 与「点开即已读」的本地写入仍全部留在 ArtistLayout；正文走文本插值（禁 v-html）。 -->
  <el-dialog v-model="announcementOpen" :title="$t('announcement.dialogTitle')" width="min(560px, calc(100vw - 32px))" class="announcement-dialog">
    <template v-if="announcement">
      <h3 class="announcement-title">{{ announcement.title }}</h3>
      <p v-if="announcement.updatedAt" class="announcement-time">{{ $t('announcement.updatedAt', { time: announcement.updatedAt }) }}</p>
      <div class="announcement-content">{{ announcement.content }}</div>
    </template>
    <p v-else class="announcement-empty">{{ $t('announcement.empty') }}</p>
  </el-dialog>
</template>

<script setup lang="ts">
// 样式随元素搬迁：ArtistLayout.vue 中 .announcement-dialog/.announcement-title/.announcement-time/
// .announcement-content/.announcement-empty 规则逐字搬入本文件（el-dialog 是本组件单根，
// :deep 的作用域归属随之从「父=ArtistLayout」变为「父=本组件」，口径不变）。
import type { PropType } from 'vue'
import type { PlatformAnnouncement } from '../../api/types'

/** 弹窗显隐（沿用拆分前父页变量名，模板逐字不变） */
const announcementOpen = defineModel({ type: Boolean, default: false })

defineProps({
  /** 公告数据；null 时渲染空态文案 */
  announcement: { type: Object as PropType<PlatformAnnouncement | null>, default: null }
})

</script>

<style scoped>
.announcement-dialog :deep(.el-dialog__body) { padding-top: 8px; }
.announcement-title {
  margin: 0 0 6px;
  font-size: calc(var(--font-scale, 1) * 16px);
  font-weight: 700;
  color: var(--ink);
  font-family: var(--f-d);
}
.announcement-time {
  margin: 0 0 10px;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
}
.announcement-content {
  font-size: calc(var(--font-scale, 1) * 13.5px);
  color: var(--ink2);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  /* 0817 报障：长公告撑爆弹窗挤作一团——内容区限高内滚，弹窗本身不超屏 */
  max-height: min(52vh, 460px);
  overflow-y: auto;
  padding-right: 4px;
}
.announcement-empty { margin: 0; color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); }
</style>
