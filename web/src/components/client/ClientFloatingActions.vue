<template>
  <div ref="fabEl" class="client-fab" :class="{ 'client-fab--raised': raised, 'client-fab--open': open }">
    <!-- issue #73-2：移动端收成单个小圆钮，点开才展开主题/语言控件，避免常驻遮挡内容 -->
    <button
      class="fab-toggle" type="button"
      :aria-expanded="open" :aria-label="t('pref.theme')"
      @click="open = !open"
    >
      <el-icon><Brush /></el-icon>
    </button>
    <div class="fab-body">
      <ThemePicker />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Brush } from '@element-plus/icons-vue'
import ThemePicker from '../ThemePicker.vue'

defineProps({
  /** 吸底 CTA 可见时上移避让（Gallery/Folio/Atelier 模板触发） */
  raised: { type: Boolean, default: false }
})

const { t } = useI18n()
// issue #73-2：移动端浮窗收起态。桌面端圆钮由 CSS 隐藏、控件常显，open 仅驱动移动端展开。
const open = ref(false)
const fabEl = ref<HTMLElement | null>(null)
// 点击浮窗外部收起（移动端展开后点别处即关，避免长期遮挡）
function onDocClick(e: MouseEvent) {
  if (fabEl.value && !fabEl.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/* #55/61: 客户端统一浮窗——右下角固定悬浮 */
.client-fab {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 95;
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  transition: box-shadow var(--dur-mid), bottom var(--dur-slow);
}
.client-fab:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }
.client-fab--raised { bottom: calc(72px + env(safe-area-inset-bottom)); }
/* 桌面端：收合圆钮不显示，主题/语言控件常显（保持既有行为） */
.fab-toggle { display: none; }

/* P1-1 修复：移动端底部常驻 CTA（吸底条/约稿按钮）与悬浮件同垂直带——移动端悬浮件始终上移避让，
   避免遮挡主 CTA（Classic 无吸底 CTA 不触发 raised，此前被压；DOM 量化重叠 2714px²） */
/* issue #73-2：移动端进一步收成单个 44px 小圆钮（触控友好），点开才在圆钮上方展开控件，
   收起时不再常驻遮挡作品卡/筛选胶囊（此前实测压住 ~4000px²）。 */
@media (max-width: 768px) {
  .client-fab {
    bottom: calc(72px + env(safe-area-inset-bottom));
    padding: 0;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }
  .client-fab:hover { box-shadow: none; }
  .fab-toggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--bg-card); border: 1px solid var(--border-color);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    color: var(--color-primary); font-size: 20px; cursor: pointer;
    transition: box-shadow var(--dur-mid), color var(--dur-fast);
  }
  .fab-toggle:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); }
  /* 收起：只留圆钮；展开：圆钮上方浮出控件卡 */
  .fab-body { display: none; }
  .client-fab--open {
    display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 8px;
  }
  .client-fab--open .fab-body {
    display: block;
    padding: 10px 12px;
    background: var(--bg-card);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  }
}
</style>
