<template>
  <!-- 偏好区：裸字 + 朱砂笔点（纸白/墨黑 与 中/EN），与后台同逻辑。
       主题直写 themeStore；语言切换交给页面（需锁卡片高度，见 useLocaleSwitch）。 -->
  <div class="prefs">
    <div class="pref-group" role="group" :aria-label="t('login.prefThemeGroup')">
      <button type="button" :aria-pressed="themeStore.artistTheme === 'paper'" @click="setTheme('paper')">{{ t('login.themePaper') }}</button>
      <button type="button" :aria-pressed="themeStore.artistTheme === 'ink'" @click="setTheme('ink')">{{ t('login.themeInk') }}</button>
    </div>
    <div class="pref-sep" aria-hidden="true"></div>
    <div class="pref-group" role="group" :aria-label="t('login.prefLangGroup')">
      <button type="button" :aria-pressed="locale === 'zh-CN'" @click="emit('switch-lang', 'zh-CN')">中</button>
      <button type="button" :aria-pressed="locale === 'en'" @click="emit('switch-lang', 'en')">EN</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../../../stores/theme.js'

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const emit = defineEmits(['switch-lang'])

/** 主题切换：直写 themeStore.artistTheme（持久化 + DOM 属性由 store watch 应用），
 *  550ms 统一 token 缓动见 artist-tokens.css「纸艺基线」节 */
function setTheme(name: string) {
  themeStore.artistTheme = name
}
</script>

<style scoped>
.prefs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.pref-group { display: flex; gap: 4px; }

.pref-sep {
  width: 1px;
  height: 16px;
  margin: 0 8px;
  background: var(--line2);
}

.pref-group button {
  position: relative;
  padding: 8px;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  color: var(--ink3);
  cursor: pointer;
  transition: color var(--dur-mid) var(--ease-out);
}

.pref-group button:hover { color: var(--ink); }

.pref-group button:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}

/* 选中 = 墨色加深 + 底下一枚朱砂笔点（宪法五.1 笔点语言） */
.pref-group button[aria-pressed='true'] { color: var(--ink); }

.pref-group button::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--zs);
  opacity: 0;
  transform: translateX(-50%) scale(0);
}

@keyframes dot-pop {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.2); }
  70%  { opacity: 1; transform: translateX(-50%) scale(1.35); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}

.pref-group button[aria-pressed='true']::after {
  animation: dot-pop var(--dur-slow) var(--ease-out);
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  .pref-group button::after { animation: none; }
}
</style>
