<template>
  <!-- 登录页背景层：远山为幕 + 季节/自定义背景预留层。
       远山 = 低饱和远景天际线（山巅渐隐融入纸色，远雾感），
       入场一次性水墨晕染（洇开即静，全页唯一记忆点），reduced-motion 直出。 -->
  <div class="backdrop" aria-hidden="true">
    <div class="mountains">
      <div class="m-up">
        <svg class="mt-range" viewBox="0 0 1440 240" preserveAspectRatio="none">
          <defs>
            <!-- 垂直墨色渐变：峰顶淡如远雾、山脚浓如近石（stop-color 由 CSS 变量供，见 style 区注释） -->
            <linearGradient id="lgMtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-opacity="0.35" />
              <stop offset="1" stop-opacity="1" />
            </linearGradient>
            <linearGradient id="lgMtMid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-opacity="0.5" />
              <stop offset="1" stop-opacity="1" />
            </linearGradient>
            <linearGradient id="lgMtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-opacity="0.62" />
              <stop offset="1" stop-opacity="1" />
            </linearGradient>
          </defs>
          <!-- 三层山脊：峰距/峰高不等距，C 曲线左右不对称，去正弦波的均匀感 -->
          <path class="mt-layer mt-far" fill="url(#lgMtFar)" d="M0,148 C70,134 130,142 200,120 C268,99 310,128 380,114 C446,101 484,64 556,74 C622,83 660,118 736,108 C812,98 842,56 918,64 C992,72 1030,106 1102,96 C1166,88 1224,118 1296,104 C1348,94 1398,110 1440,100 L1440,240 L0,240 Z" />
          <path class="mt-layer mt-mid" fill="url(#lgMtMid)" d="M0,188 C64,172 104,180 166,154 C228,128 272,160 342,146 C412,132 452,96 522,106 C592,116 630,152 708,140 C786,128 828,94 898,102 C968,110 1008,148 1086,136 C1156,126 1198,146 1268,136 C1326,128 1384,146 1440,138 L1440,240 L0,240 Z" />
          <path class="mt-layer mt-near" fill="url(#lgMtNear)" d="M0,212 C86,198 148,206 228,188 C308,170 366,196 454,184 C542,172 596,148 686,158 C776,168 830,194 926,182 C1022,170 1076,150 1168,162 C1260,174 1330,190 1440,178 L1440,240 L0,240 Z" />
        </svg>
      </div>
      <!-- 水面倒影：同一份山的镜像渐隐，"水"由倒影成立，零新增元素 -->
      <div class="m-refl">
        <svg class="mt-range" viewBox="0 0 1440 240" preserveAspectRatio="none">
          <path class="mt-layer mt-refl-fill mt-far" fill="url(#lgMtFar)" d="M0,148 C70,134 130,142 200,120 C268,99 310,128 380,114 C446,101 484,64 556,74 C622,83 660,118 736,108 C812,98 842,56 918,64 C992,72 1030,106 1102,96 C1166,88 1224,118 1296,104 C1348,94 1398,110 1440,100 L1440,240 L0,240 Z" />
          <path class="mt-layer mt-refl-fill mt-mid" fill="url(#lgMtMid)" d="M0,188 C64,172 104,180 166,154 C228,128 272,160 342,146 C412,132 452,96 522,106 C592,116 630,152 708,140 C786,128 828,94 898,102 C968,110 1008,148 1086,136 C1156,126 1198,146 1268,136 C1326,128 1384,146 1440,138 L1440,240 L0,240 Z" />
          <path class="mt-layer mt-refl-fill mt-near" fill="url(#lgMtNear)" d="M0,212 C86,198 148,206 228,188 C308,170 366,196 454,184 C542,172 596,148 686,158 C776,168 830,194 926,182 C1022,170 1076,150 1168,162 C1260,174 1330,190 1440,178 L1440,240 L0,240 Z" />
        </svg>
      </div>
    </div>

    <!-- 季节/自定义背景预留层（useSeasonalBackdrop 数据源接通前恒 null，页面保持默认远山） -->
    <div v-if="backdropUrl" class="seasonal-backdrop">
      <img :src="backdropUrl" :alt="backdropAlt">
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSeasonalBackdrop } from '../../../composables/useSeasonalBackdrop'

/** 季节/自定义背景预留接口：数据源接通前恒 null，无行为差异 */
const { backdropUrl, backdropAlt } = useSeasonalBackdrop()
</script>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

/* ═══ 远山为幕：两层低饱和剪影 + 水面倒影（山巅渐隐 mask 融入纸色，大气透视） ═══ */
.mountains {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24vh;
  min-height: 160px;
  display: flex;
  flex-direction: column;
}

.m-up {
  height: 65%;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 55%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 55%);
}

.m-up svg { display: block; }

/* 倒影：镜像翻转 + 向下渐隐（水感，不抢戏；不加贯穿水线——细线贯穿页面有被点名的前科）
   入场用专属 refl-in（终值 = 静态 opacity 0.45）：此前误借用 fade-in（终值 0.92，
   季节背景图专用），播完瞬间从 0.92 跳回 0.45，用户实机拍到「先过深再瞬变淡」 */
.m-refl {
  position: relative;
  height: 35%;
  overflow: hidden;
  opacity: 0.45;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 85%);
  mask-image: linear-gradient(to bottom, #000 0%, transparent 85%);
  animation: refl-in 1s ease 0.5s backwards;
}

@keyframes refl-in { from { opacity: 0; } to { opacity: 0.45; } }

/* 山:倒影 ≈ 65:35，故倒影 svg 高 186%，翻绕水线（容器顶缘），让山形轮廓落进可见窗 */
.m-refl svg {
  position: absolute;
  left: 0;
  top: 186%;
  width: 100%;
  height: 186%;
  transform: scaleY(-1);
  transform-origin: top;
}

.mt-range { width: 100%; height: 100%; }

/* 山墨阶：远淡近浓三档。颜色走 CSS 变量→stop-color，不用 currentColor——
   实测坑：渐变 stop 的 currentColor 沿 <defs> 所在 DOM 链取色（继承到页面的浅色 --ink），
   而不是取引用它的 path 的色，墨黑档山体会亮成浅色剪影。
   倒影用实色不走透明度：翻转后渐变方向反了会堆成亮带（墨黑档实机拍到），
   镜像本身已带山脚浓端颜色，实色 + 容器 opacity/mask 渐隐足够成水感 */
.mountains {
  --mt-far-c: color-mix(in srgb, var(--ink) 7%, transparent);
  --mt-mid-c: color-mix(in srgb, var(--ink) 12%, transparent);
  --mt-near-c: color-mix(in srgb, var(--ink) 18%, transparent);
  --mt-refl-far-c: color-mix(in srgb, var(--ink) 9%, transparent);
  --mt-refl-mid-c: color-mix(in srgb, var(--ink) 14%, transparent);
  --mt-refl-near-c: color-mix(in srgb, var(--ink) 20%, transparent);
}

#lgMtFar stop { stop-color: var(--mt-far-c); }
#lgMtMid stop { stop-color: var(--mt-mid-c); }
#lgMtNear stop { stop-color: var(--mt-near-c); }

.mt-refl-fill.mt-far { fill: var(--mt-refl-far-c); }
.mt-refl-fill.mt-mid { fill: var(--mt-refl-mid-c); }
.mt-refl-fill.mt-near { fill: var(--mt-refl-near-c); }

/* 墨黑档修正（用户反馈：亮剪影太亮）——夜山应比夜色更沉：
   黑混 paper token 压到底色之下，山读成墨色暗影而非亮雾，不加新色。
   注意：:global 必须整根选择器包进括号——:global(X) .y 混写会被编译器静默丢掉 .y
   （v0.49 起就潜伏的坑，本次重构一并修复，Login.vue/PaperCard.vue 同例） */
:global(html[data-artist-theme='ink'] .mountains) {
  --mt-far-c: color-mix(in srgb, #000 18%, var(--paper));
  --mt-mid-c: color-mix(in srgb, #000 30%, var(--paper));
  --mt-near-c: color-mix(in srgb, #000 44%, var(--paper));
  --mt-refl-far-c: color-mix(in srgb, #000 26%, var(--paper));
  --mt-refl-mid-c: color-mix(in srgb, #000 38%, var(--paper));
  --mt-refl-near-c: color-mix(in srgb, #000 52%, var(--paper));
}

/* 入场：水墨晕染——淡墨在宣纸上洇开浮现（一次性，演完即静） */
@keyframes mt-ink-in {
  from { opacity: 0; filter: blur(8px); transform: translateY(10px); }
  to { opacity: 1; filter: blur(0); transform: translateY(0); }
}

.mt-far { animation: mt-ink-in 0.9s var(--ease-out) 0.1s backwards; }
.mt-mid { animation: mt-ink-in 0.9s var(--ease-out) 0.22s backwards; }
.mt-near { animation: mt-ink-in 0.9s var(--ease-out) 0.34s backwards; }

/* 季节/自定义背景层：铺满视口，远山之上卡片之下；图片 cover 居中，边缘渐隐融入 */
.seasonal-backdrop { position: absolute; inset: 0; }

.seasonal-backdrop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: 0.92;
  -webkit-mask-image: radial-gradient(120% 100% at 50% 40%, #000 62%, transparent 100%);
  mask-image: radial-gradient(120% 100% at 50% 40%, #000 62%, transparent 100%);
  animation: fade-in 0.6s ease backwards;
}

@keyframes fade-in { from { opacity: 0; } to { opacity: 0.92; } }

/* ═══ 768 竖屏 ═══ */
@media (max-width: 768px) {
  .mountains { height: 17vh; min-height: 110px; }
}

/* ═══ 无障碍：尊重系统减少动态效果 ═══ */
@media (prefers-reduced-motion: reduce) {
  .mt-layer, .m-refl, .seasonal-backdrop img { animation: none; }
}
</style>
