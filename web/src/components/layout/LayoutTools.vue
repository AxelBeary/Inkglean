<template>
  <!-- F-09 巨型文件拆分：自 ArtistLayout.vue 原样搬入（侧栏展开态 footer-tools、侧栏折叠态 collapsed-tools、
       移动端顶栏 topbar-actions 三处共用）。纯展示子块：不持有状态与生命周期；
       公告数据加载与「点开即已读」的本地写入仍留在 ArtistLayout（props 注入）；
       语言切换是零状态动作，随语言按钮一起搬入（口径对齐同款按钮组件 ThemePicker.vue：自己 useI18n 取 locale）。 -->
  <ThemeToggle />
  <!-- REQ-043 I4: 平台公告入口（零主动打扰；有未读才显示圆点） -->
  <button
    v-if="announcement"
    class="announce-btn" :class="{ 'announce-btn--unread': announcementUnread }"
    :title="$t('announcement.entry')" :aria-label="$t('announcement.entry')"
    @click="openAnnouncement"
  >
    <el-icon><Bell /></el-icon>
  </button>
  <button
    class="lang-btn" @click="toggleLang"
    :title="locale === 'zh-CN' ? $t('menu.langToEn') : $t('menu.langToZh')"
    :aria-label="locale === 'zh-CN' ? $t('menu.langAriaToEn') : $t('menu.langAriaToZh')"
  >
    {{ locale === 'zh-CN' ? 'EN' : '中' }}
  </button>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlatformAnnouncement } from '../../api/types'
import { setLocale } from '../../i18n/index'
import { Bell } from '@element-plus/icons-vue'
import ThemeToggle from '../ThemeToggle.vue'

defineProps({
  /** 公告数据（null = 不渲染入口）；加载与已读写入均在 ArtistLayout */
  announcement: { type: Object as PropType<PlatformAnnouncement | null>, default: null },
  /** 未读圆点（ArtistLayout 按本地已读时间戳判定） */
  announcementUnread: { type: Boolean, default: false },
  /** 点开公告（父页动作：置显弹窗 + 记本地已读时间戳） */
  openAnnouncement: { type: Function as PropType<() => void>, required: true }
})

// 自 ArtistLayout.vue 逐字搬入：语言切换
const { locale } = useI18n()
function toggleLang() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}
</script>

<style scoped>
/* 样式随元素搬迁：<style scoped> 不跨组件生效，ArtistLayout.vue 里对应的
   .lang-btn / .announce-btn / .artist-scope .lang-btn 规则已逐字搬到本文件（父页同步删除，不留死样式）。 */
.lang-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink2);
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600;
  cursor: pointer;
  /* K1（波2，灰沼教训）：背景/边框随主题即时切换，不插值；仅 hover/按压微交互保留 */
  transition: color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}
.lang-btn:hover { color: var(--ink); box-shadow: var(--sh-1); }

/* ─── REQ-043 I4: 公告入口（小铃铛；未读时右上角朱砂圆点） ─── */
.announce-btn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink2);
  cursor: pointer;
  flex: none;
  /* K1（波2，灰沼教训）：背景/边框随主题即时切换，不插值；仅 hover/按压微交互保留 */
  transition: color var(--dur-fast), box-shadow var(--dur-fast), transform var(--dur-fast) ease-out;
}
.announce-btn:hover { color: var(--ink); box-shadow: var(--sh-1); }
.announce-btn:active { transform: scale(0.98); }
.announce-btn--unread::after {
  content: '';
  position: absolute;
  top: 6px; right: 6px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--zs);
  border: 1px solid var(--card);
}
/* 克制动效批（2026-08-07 用户反馈批：按钮按压 ≤0.2s ease-out；自 ArtistLayout.vue 逐字复制） */
.artist-scope .lang-btn { transition: color var(--dur-fast), transform var(--dur-fast) ease-out, box-shadow var(--dur-fast); }
.artist-scope .lang-btn:active { transform: scale(0.98); }
</style>
