<template>
  <!-- 主页首屏（A 批）：品牌 → 一句话定位 → 三条价值点 → 主行动。
       定位句走 landing.heroLead；副句沿用既有 landing.subtitle（原文未改）。 -->
  <header class="landing-hero">
    <h1 class="hero-title">{{ $t('landing.title') }}</h1>
    <p class="hero-lead">{{ $t('landing.heroLead') }}</p>
    <p class="hero-sub">{{ $t('landing.subtitle') }}</p>

    <ul class="hero-values">
      <li v-for="item in VALUES" :key="item.titleKey" class="hero-value">
        <span class="hero-value-mark" aria-hidden="true"></span>
        <span class="hero-value-body">
          <span class="hero-value-title">{{ $t(item.titleKey) }}</span>
          <span class="hero-value-desc">{{ $t(item.descKey) }}</span>
        </span>
      </li>
    </ul>

    <button type="button" class="hero-cta" @click="$emit('browse')">
      {{ $t('landing.browseArtists') }}
    </button>
  </header>
</template>

<script setup lang="ts">
defineEmits<{ (e: 'browse'): void }>()

// 价值点只列本平台已有能力（价目表/查单链接/下单流程），不写未上线的功能
// （REQ-044 拍板记录第 2 条：未发布能力不得写成现在时）
const VALUES = [
  { titleKey: 'landing.valuePriceTitle', descKey: 'landing.valuePriceDesc' },
  { titleKey: 'landing.valueTrackTitle', descKey: 'landing.valueTrackDesc' },
  { titleKey: 'landing.valueFlowTitle', descKey: 'landing.valueFlowDesc' }
] as const
</script>

<style scoped>
.landing-hero {
  text-align: center;
  padding: 56px 0 40px;
}
.hero-title {
  font-size: clamp(26px, 4vw, 32px);
  line-height: 1.3;
  color: var(--text-primary);
}
.hero-lead {
  margin: 16px auto 0;
  max-width: 32em;
  font-size: 17px;
  line-height: 1.7;
  color: var(--text-primary);
}
.hero-sub {
  margin: 8px auto 0;
  max-width: 32em;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.hero-values {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 16px;
  margin: 32px 0 0;
  padding: 0;
}
.hero-value {
  display: flex;
  gap: 12px;
  padding: 16px;
  text-align: left;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--r-card);
}
.hero-value-mark {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--color-primary);
}
.hero-value-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hero-value-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.hero-value-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.hero-cta {
  margin-top: 32px;
  padding: 12px 32px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--color-primary);
  /* 暗色下 --color-primary 提亮，文字同 NotFound 口径取 --pal-bg，两种主题都过 AA */
  color: var(--pal-bg);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  /* T 波：hover/active 禁位移——反馈换透明度与亮度 */
  transition: opacity var(--dur-mid), filter var(--dur-fast);
}
.hero-cta:hover { opacity: 0.88; }
.hero-cta:active { filter: brightness(0.92); }
@media (max-width: 768px) {
  .landing-hero { padding: 32px 0 24px; }
  .hero-cta { margin-top: 24px; }
}
</style>
