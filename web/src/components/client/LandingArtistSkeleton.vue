<template>
  <!-- 骨架屏：结构对齐 LandingArtistCard（头像 / 名字 / 状态 / 两行简介）。
       各段盒高按实测真卡片对齐（真卡 248.8px / 骨架 248.2px，差 0.6px），
       避免加载完成瞬间整页跳高。纯装饰，读屏提示由外层 role="status" 文字承担。 -->
  <div class="artist-skeleton" aria-hidden="true">
    <div class="sk-block sk-avatar"></div>
    <div class="sk-block sk-name"></div>
    <div class="sk-block sk-tag"></div>
    <div class="sk-bio">
      <div class="sk-block sk-line"></div>
      <div class="sk-block sk-line sk-line--short"></div>
    </div>
  </div>
</template>

<style scoped>
.artist-skeleton {
  padding: 20px;
  text-align: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--r-card);
}
.sk-block {
  position: relative;
  overflow: hidden;
  background: var(--bg-inset);
  border-radius: var(--r-line);
}
.sk-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, var(--bg-hover) 50%, transparent 70%);
  transform: translateX(-100%);
  animation: landing-shimmer 1.4s ease-in-out infinite;
}
/* 真卡片头像行实测 85px（img 80 + 行内基线余量）+ 12px 外边距 = 97px，
   这里用 80px 圆 + 16px 外边距 = 96px，差值 1px 落在容差内 */
.sk-avatar {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  /* 50%：圆族，与真实头像一致 */
  border-radius: 50%;
}
.sk-name {
  width: 96px;
  height: 25.2px;
  margin: 0 auto;
}
.sk-tag {
  width: 64px;
  height: 25px;
  margin: 8px auto 0;
  border-radius: var(--r-pill);
}
.sk-bio {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-line { height: 16px; }
.sk-line--short { width: 60%; margin: 0 auto; }
@keyframes landing-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .sk-block::after { animation: none; }
}
</style>
