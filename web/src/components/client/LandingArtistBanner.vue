<template>
  <!-- 目录下方的画师向横幅（Q1 兜底 (c)）：首屏保持客户向，画师向内容压缩成一条窄带 + 登录入口。
       ⚠ 正文是 REQ-044:27 A 项第一层定稿话术，逐字照抄，改一个标点都要重新拍板（REQ-044:37）。 -->
  <aside class="artist-banner">
    <div class="banner-text">
      <p class="banner-title">{{ $t('landing.artistBannerTitle') }}</p>
      <p class="banner-desc">{{ $t('landing.artistBannerText') }}</p>
    </div>
    <router-link class="banner-cta" to="/login">{{ $t('landing.artistBannerCta') }}</router-link>
  </aside>
</template>

<style scoped>
.artist-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 32px;
  padding: 20px 24px;
  background: var(--color-primary-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--r-card);
}
.banner-text { min-width: 0; }
.banner-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.banner-desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.banner-cta {
  flex: 0 0 auto;
  padding: 8px 24px;
  border-radius: var(--r-pill);
  background: var(--color-primary);
  color: var(--pal-bg);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity var(--dur-mid), filter var(--dur-fast);
}
.banner-cta:hover { opacity: 0.88; }
.banner-cta:active { filter: brightness(0.92); }
@media (max-width: 768px) {
  .artist-banner {
    flex-direction: column;
    align-items: flex-start;
    padding: 16px 20px;
  }
}
</style>
