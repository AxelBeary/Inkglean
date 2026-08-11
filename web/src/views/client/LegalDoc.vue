<template>
  <!-- REQ-042: 隐私政策 / 服务条款 静态页（纸墨 token，i18n 中英双语） -->
  <div class="legal-page">
    <header class="legal-header">
      <router-link to="/" class="legal-back">{{ $t('compliance.common.backHome') }}</router-link>
      <h1 class="font-display legal-title">{{ $t(`compliance.${docType}.pageTitle`) }}</h1>
      <p class="legal-updated">{{ $t('compliance.common.updated') }}：{{ $t(`compliance.${docType}.updated`) }}</p>
    </header>

    <main class="legal-body">
      <section v-for="(section, index) in sections" :key="index" class="legal-section">
        <h2 class="font-display">{{ section.title }}</h2>
        <p v-for="(paragraph, pIndex) in section.paragraphs" :key="pIndex" class="legal-paragraph">
          {{ paragraph }}
        </p>
        <ul v-if="section.items && section.items.length" class="legal-list">
          <li v-for="(item, iIndex) in section.items" :key="iIndex">{{ item }}</li>
        </ul>
      </section>

      <p class="legal-note">{{ $t(`compliance.${docType}.note`) }}</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

/** i18n 段落结构（sections 数组元素） */
interface LegalSection {
  title: string
  paragraphs: string[]
  items?: string[]
}

const route = useRoute()
// tm() 返回消息结构（数组消息不能用 t()——t() 只处理字符串并回退 key；本页全数组消息故只用 tm）
const { tm } = useI18n()

/** 路由 meta 区分隐私/条款（router 中已配置 name） */
const docType = computed(() => (route.name === 'TermsOfService' ? 'terms' : 'privacy'))

/** i18n 数组字段运行时为数组，类型上按 LegalSection[] 断言（vue-i18n 泛型限制） */
const sections = computed(() =>
  (tm(`compliance.${docType.value}.sections`) as unknown as LegalSection[]) || []
)
</script>

<style scoped>
/* 纸墨：宣纸底 + 墨字 + 花青/朱砂点缀；间距统一 4px 倍数 */
.legal-page {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  transition: background 0.3s, color 0.3s;
}
.legal-header {
  padding: 48px 24px 32px;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  position: relative;
}
.legal-back {
  position: absolute;
  left: 24px;
  top: 32px;
  color: var(--text-footer, #606266);
  text-decoration: none;
  font-size: 13px;
  transition: color 0.2s;
}
.legal-back:hover { color: var(--color-primary); }
.legal-title {
  font-size: clamp(26px, 4vw, 32px);
  letter-spacing: 0.04em;
}
.legal-updated {
  margin-top: 12px;
  color: var(--text-footer, #606266);
  font-size: 13px;
}
.legal-body {
  flex: 1;
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
  padding: 40px 24px 64px;
}
.legal-section {
  padding: 28px 0;
  border-top: 1px solid var(--border-color);
}
.legal-section:first-child { border-top: none; padding-top: 0; }
.legal-section h2 {
  font-size: 20px;
  margin-bottom: 16px;
  color: var(--color-primary);
}
.legal-paragraph {
  line-height: 1.9;
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--text-primary);
}
.legal-list {
  margin: 8px 0 12px 20px;
  line-height: 1.9;
  font-size: 14px;
  color: var(--text-primary);
}
.legal-note {
  margin-top: 32px;
  padding: 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-footer, #606266);
  background: var(--bg-inset);
  border-left: 3px solid var(--color-primary);
}
@media (max-width: 640px) {
  .legal-back { position: static; display: inline-block; margin-bottom: 16px; }
}
</style>
