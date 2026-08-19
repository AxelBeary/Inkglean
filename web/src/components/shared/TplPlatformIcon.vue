<template>
  <span class="tpl-platform-icon" aria-hidden="true">
    <svg
      v-if="iconPath"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      role="img"
    >
      <path :d="iconPath" />
    </svg>
    <span v-else>{{ fallbackChar }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { getIconPath } from '../../utils/simpleIcons.js'

const props = defineProps({
  /** 平台 iconKey（social_platforms.icon_key），null/未知 → 单字兜底 */
  iconKey: { type: String as PropType<string | null>, default: null },
  /** simple-icons 无图标时的单字兜底（如「米」「抖」） */
  fallbackChar: { type: String, default: '' }
})

const iconPath = computed(() => getIconPath(props.iconKey))
</script>
