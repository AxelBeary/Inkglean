<template>
  <!-- 纸叠卡壳：第三张撕毛边 + 第二张微斜 + 主纸（真纸纹理 + 噪点 + 下缘纸边）。
       内容经 slot 注入；纹理 URL 由页面根 --lg-tex 变量提供（DOM 继承）。
       材质机制（multiply/overlay 混合）与 v0.47 修复值保持一致，勿轻动——
       v0.50–v0.57 动 mix-blend 纹理层导致「蒙纱」已回滚，教训见 docs/comms/STATUS.md。 -->
  <div class="card-wrap">
    <!-- 撕毛边位移滤镜：把 clip-path 直边扰动成有机毛边 -->
    <svg class="svg-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <filter id="loginTornEdge" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>

    <div class="sheet-c" aria-hidden="true"><div class="sheet-c-cut"></div></div>
    <div class="sheet-b" aria-hidden="true"></div>

    <main ref="cardRef" class="card" aria-labelledby="login-title">
      <!-- 细粒噪点层（程序纹理，真纸纹理经 --lg-tex 变量进 background） -->
      <div class="grain-layer" aria-hidden="true"></div>
      <slot />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const cardRef = ref(null)

/* 语言切换动效需要锁卡片高度（useLocaleSwitch），以函数暴露避免 ref 解包歧义 */
defineExpose({ getCardEl: () => cardRef.value })
</script>

<style scoped>
.svg-defs { position: absolute; }

.card-wrap {
  position: relative;
  width: 100%;
  max-width: 420px;
}

/* ── 纸叠：三张手放的纸（入场同时落定：逐张错峰曾被用户反馈“纸底和框不是一起出来”，
     统一 0.45s/延迟 0.1s，旋转沉降保留但同步发生） ── */
@keyframes sheet-b { from { opacity: 0; transform: rotate(0deg); } to { opacity: 1; transform: rotate(0.9deg); } }
@keyframes sheet-c { from { opacity: 0; transform: rotate(0deg); } to { opacity: 1; transform: rotate(-1.1deg); } }

/* 第三张：底边撕毛（clip-path 粗撕 + feTurbulence 位移滤镜 = 真毛边） */
.sheet-c {
  position: absolute;
  left: 0;
  right: 16px;
  top: 16px;
  bottom: -12px;
  z-index: -2;
  filter: url(#loginTornEdge);
  transform: rotate(-1.1deg);
  animation: sheet-c 0.45s var(--ease-out) 0.1s backwards;
}

.sheet-c-cut {
  position: relative;
  width: 100%;
  height: 100%;
  /* 纸叠明度梯度：底张比页面底暗，边缘轮廓才立得住（color-mix 随主题自适应） */
  background: color-mix(in srgb, var(--ink) 7%, var(--paper));
  border-radius: var(--r-s-hand);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--ink) 18%, transparent);
  clip-path: polygon(0 0, 100% 0, 100% 88%, 95% 91%, 89% 87%, 82% 92%, 74% 88%, 66% 93%, 58% 89%, 49% 93%, 41% 88%, 33% 92%, 25% 88%, 17% 93%, 9% 89%, 4% 92%, 0 88%);
}

/* 第二张：微斜垫底（比页面底暗一档的混色） */
.sheet-b {
  position: absolute;
  left: 8px;
  right: 4px;
  top: 8px;
  bottom: -6px;
  z-index: -1;
  background: color-mix(in srgb, var(--ink) 3%, var(--paper));
  border-radius: var(--r-s-hand);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ink) 11%, transparent);
  transform: rotate(0.9deg);
  animation: sheet-b 0.45s var(--ease-out) 0.1s backwards;
}

/* 底层两张纸的纹理（入场/窄屏会露出，素纸会穿帮） */
.sheet-c-cut::after,
.sheet-b::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--lg-tex);
  background-size: 512px 512px;
  opacity: var(--lg-sheet-tex-op);
  mix-blend-mode: var(--lg-tex-blend);
  pointer-events: none;
}

/* 主纸：手剪圆角 + 真纸纹理 + 噪点 + 下缘纸边 */
.card {
  position: relative;
  background: var(--card);
  border-radius: var(--r-paper);
  padding: 40px 44px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent),
    0 3px 8px color-mix(in srgb, var(--ink) 10%, transparent),
    0 10px 24px color-mix(in srgb, var(--ink) 15%, transparent),
    0 28px 64px color-mix(in srgb, var(--ink) 24%, transparent);
  animation: fade-in 0.45s ease 0.1s backwards;
}

:global(html[data-artist-theme='ink'] .card) {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent),
    0 2px 6px color-mix(in srgb, var(--ink) 7%, transparent),
    0 6px 16px color-mix(in srgb, var(--ink) 11%, transparent),
    0 20px 48px color-mix(in srgb, var(--ink) 16%, transparent);
}

/* 卡面真纸纹理（ambientCG Paper001，CC0，经 --lg-tex 注入）+ 混合模式随主题 */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: var(--lg-tex);
  background-size: 512px 512px;
  opacity: var(--lg-tex-op);
  mix-blend-mode: var(--lg-tex-blend);
  pointer-events: none;
}

/* 细粒噪点单独一层（程序纹理） */
.grain-layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.04;
  mix-blend-mode: multiply;
  pointer-events: none;
}

:global(html[data-artist-theme='ink'] .grain-layer) { mix-blend-mode: screen; }

/* 下缘纸边（厚度） */
.card::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  border-radius: var(--r-s-hand);
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 5%, transparent), color-mix(in srgb, var(--ink) 16%, transparent));
  pointer-events: none;
}

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

/* ═══ 768 竖屏 ═══ */
@media (max-width: 768px) {
  .card { padding: 28px 24px 32px; }
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  .card, .sheet-b, .sheet-c { animation: none; }
}
</style>
