<template>
  <!-- v76 W4：主页被平台下架横幅（通知通道未接通下，这是唯一能送达被下架画师的手段）；
       画师是权利人，可读下架时间与原因；申诉渠道无专门公示入口，措辞保持中性不虚构。
       T-08 巨型文件防线：自 ArtistLayout.vue 原样搬入（标记与样式逐字不变，v-if 判定留在父页）。
       页宽对齐仍由父页 pageWidthStyle 内联下发（页宽唯一生效点口径不变，本件不自算宽度）。 -->
  <div class="home-takedown-banner" :style="pageWidthStyle" role="alert">
    <div class="home-takedown-banner-body">
      <div class="home-takedown-banner-title">{{ $t('homeTakedown.title') }}</div>
      <div class="home-takedown-banner-time">
        {{ $t('homeTakedown.takenDownAt', { time: formatDateTime(takedown.at) }) }}
      </div>
      <div class="home-takedown-banner-reason">
        {{ takedown.reason
          ? $t('homeTakedown.reasonLabel', { reason: takedown.reason })
          : $t('homeTakedown.reasonNone') }}
      </div>
      <div class="home-takedown-banner-guidance">{{ $t('homeTakedown.guidance') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 样式随元素搬迁：ArtistLayout.vue 中 .home-takedown-banner 系列规则逐字搬入本文件（scoped 不跨组件边界）。
import { type PropType } from 'vue'
import { formatDateTime } from '../../utils/datetime'

defineProps({
  /** 下架事实（时间 + 原因）；未下架时由父页 v-if 挡住，本件不渲染 */
  takedown: {
    type: Object as PropType<{ at: string; reason: string | null }>,
    required: true
  },
  /** 父页下发的页宽内联样式（center / left / full 三档） */
  pageWidthStyle: { type: Object as PropType<Record<string, string>>, default: undefined }
})
</script>

<style scoped>
/* v76 W4：主页被平台下架横幅（朱砂告警色，与页宽对齐；不走 transition 免随路由切换闪烁） */
.home-takedown-banner {
  margin: 0 0 16px;
  width: 100%;
}
.home-takedown-banner-body {
  padding: 14px 18px;
  background: var(--zs-t, #fdecec);
  border: 1px solid var(--zs, #c0392b);
  border-left-width: 4px;
  border-radius: var(--r-m, 8px);
  color: var(--ink, #222);
  display: flex; flex-direction: column; gap: 4px;
}
.home-takedown-banner-title { font-size: 15px; font-weight: 700; color: var(--zs, #c0392b); }
.home-takedown-banner-time { font-size: 13px; color: var(--ink2, #555); }
.home-takedown-banner-reason { font-size: 13px; color: var(--ink, #222); }
.home-takedown-banner-guidance { font-size: 13px; color: var(--ink2, #555); margin-top: 2px; }
</style>
