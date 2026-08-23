<template>
  <!-- banner：代表作横幅，名字叠在画上（classic） -->
  <header v-if="variant === 'banner'" class="tpl-hero tpl-hero--banner" :class="{ 'tpl-hero--no-art': !heroArtwork }" ref="sentinelEl">
    <div class="tpl-hero-bg">
      <img v-if="heroArtwork" :src="imgUrl(heroArtwork.image_path)" alt="" class="tpl-hero-bg-img" />
      <div class="tpl-hero-shade"></div>
    </div>
    <div class="tpl-hero-banner-content">
      <TplStatusBadge :status="artist.status" :slot-display="artist.slotDisplay" class="tpl-hero-banner-status" />
      <h1 class="tpl-hero-name tpl-hero-name--banner">{{ artist.name }}</h1>
      <p class="tpl-hero-bio" v-if="artist.bio">{{ artist.bio }}</p>
      <div class="tpl-hero-actions">
        <button
          class="tpl-btn tpl-btn--primary" :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.commission') }}
        </button>
        <button class="tpl-btn tpl-btn--ghost" @click="$router.push(`/artist/${subdomain}/track`)">
          {{ $t('artistHome.track') }}
        </button>
      </div>
    </div>
  </header>

  <!-- fullscreen：全屏画作 + 角落展签（gallery） -->
  <header v-else-if="variant === 'fullscreen'" class="tpl-hero tpl-hero--fullscreen" ref="sentinelEl">
    <img v-if="heroArtwork" :src="imgUrl(heroArtwork.image_path)" alt="" class="tpl-hero-full-img" />
    <div class="tpl-hero-full-shade"></div>
    <div class="tpl-hero-plaque">
      <h1 class="tpl-hero-name tpl-hero-name--plaque">{{ artist.name }}</h1>
      <p class="tpl-hero-bio tpl-hero-bio--plaque" v-if="artist.bio">{{ artist.bio }}</p>
      <TplStatusBadge :status="artist.status" :slot-display="artist.slotDisplay" />
      <div class="tpl-hero-actions tpl-hero-actions--plaque">
        <button
          class="tpl-btn tpl-btn--primary" :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.commission') }}
        </button>
        <button class="tpl-btn tpl-btn--ghost" @click="$router.push(`/artist/${subdomain}/track`)">
          {{ $t('artistHome.track') }}
        </button>
      </div>
    </div>
  </header>

  <!-- split：左文右图分屏（folio） -->
  <header v-else class="tpl-hero tpl-hero--split" ref="sentinelEl">
    <div class="tpl-hero-split-text">
      <TplStatusBadge :status="artist.status" :slot-display="artist.slotDisplay" />
      <h1 class="tpl-hero-name tpl-hero-name--split">{{ artist.name }}</h1>
      <p class="tpl-hero-bio" v-if="artist.bio">{{ artist.bio }}</p>
      <div class="tpl-hero-actions">
        <button
          class="tpl-btn tpl-btn--primary" :disabled="artist.status !== 'open'"
          @click="$router.push(`/artist/${subdomain}/order`)"
        >
          {{ $t('artistHome.startCommission') }}
        </button>
        <button class="tpl-btn tpl-btn--ghost" @click="$router.push(`/artist/${subdomain}/track`)">
          {{ $t('artistHome.trackOrder') }}
        </button>
      </div>
      <div class="tpl-hero-links" v-if="footerLinks.length">
        <template v-for="(link, i) in footerLinks" :key="link.key">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
          <span v-if="i < footerLinks.length - 1" class="tpl-hero-sep">·</span>
        </template>
      </div>
    </div>
    <div class="tpl-hero-split-art" v-if="artworks.length">
      <img
        v-for="(art, i) in artworks.slice(0, 2)"
        :key="art.id"
        :src="imgUrl(art.image_path)"
        :alt="art.title || ''"
        class="tpl-hero-split-img"
        :style="{ zIndex: 2 - i, transform: `rotate(${i * 2.5 - 1.25}deg)` }"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PropType } from 'vue'
import { useArtistData } from '../../composables/useArtistData'
import TplStatusBadge from './TplStatusBadge.vue'
import type { PlatformDTO } from '../../api/types'

/** 代表作/作品行的宽松形状（与 useArtistData 的 ArtistArtworkLike 结构兼容） */
interface HeroArtwork {
  id: number
  title?: string | null
  image_path?: string | null
  is_cover?: number | null
  cover_order?: number | null
  size_tags?: Array<{ style_size_id?: number | null }> | null
}

const props = defineProps({
  artist: { type: Object, default: () => ({}) },
  artworks: { type: Array as PropType<HeroArtwork[]>, default: () => [] },
  subdomain: { type: String, default: '' },
  /** banner: 横幅 | fullscreen: 全屏展签 | split: 分屏 */
  variant: { type: String, default: 'banner' },
  // REQ-022 F2: 社交平台列表（hero 链接平台名渲染）
  platforms: { type: Array as PropType<PlatformDTO[]>, default: () => [] }
})

const { imgUrl, heroArtwork, footerLinks } = useArtistData(props)

// 暴露哨兵元素，供 useStickyCta 监听
const sentinelEl = ref<HTMLElement | null>(null)
defineExpose({ sentinelEl })
</script>

<style scoped>
/* ===== 通用按钮 ===== */
.tpl-btn {
  padding: 12px 30px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  /* T 波移交 M：内联 cubic-bezier(0.22,1,0.36,1) → --ease-out（同值 token） */
  transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
  border: 1px solid transparent;
}
.tpl-btn--primary {
  background: var(--color-primary);
  color: var(--pal-bg);
}
.tpl-btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  /* T 波：hover 禁位移——保留背景加深反馈 */
}
.tpl-btn--primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tpl-btn--ghost {
  /* v0.34 任务D：hero 背景图上原 border 对比不足（用户反馈按钮框看不见）——
     半透明底 + 可见边框，亮暗主题、亮部/暗部背景均可辨识 */
  background: color-mix(in srgb, var(--pal-surface) 70%, transparent);
  color: var(--pal-text);
  border-color: var(--pal-text-dim);
  backdrop-filter: blur(4px);
}
.tpl-btn--ghost:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--pal-surface) 85%, transparent);
}
.tpl-hero-actions {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

/* ===== banner（classic）===== */
.tpl-hero--banner {
  position: relative;
  min-height: 62vh;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.tpl-hero-bg {
  position: absolute;
  inset: 0;
}
.tpl-hero-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tpl-hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, color-mix(in srgb, var(--pal-bg) 92%, transparent) 8%, transparent 60%);
}
.tpl-hero-banner-content {
  position: relative;
  z-index: 1;
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px 56px;
  width: 100%;
}
.tpl-hero-banner-status {
  margin-bottom: 14px;
}
.tpl-hero-name--banner {
  font-family: var(--font-display);
  font-size: clamp(40px, 7vw, 64px);
  font-weight: 700;
  line-height: 1.05;
  color: var(--pal-text);
  margin: 0 0 14px;
}
.tpl-hero--banner .tpl-hero-bio {
  color: var(--pal-text-dim);
}
/* 824 响应式巡逻：无代表作时横幅收为内容高——
   不留 62vh 空白带（空态三档视口实测顶部大块空白） */
.tpl-hero--no-art {
  min-height: 0;
  padding-top: 56px;
}

/* ===== fullscreen（gallery）===== */
.tpl-hero--fullscreen {
  position: relative;
  height: 100vh;
  min-height: 560px;
  overflow: hidden;
}
.tpl-hero-full-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tpl-hero-full-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, transparent 45%);
}
.tpl-hero-plaque {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 1;
  max-width: 460px;
  margin: 0 0 48px 48px;
  padding: 28px 32px;
  background: color-mix(in srgb, var(--pal-bg) 82%, transparent);
  backdrop-filter: blur(10px);
  border-left: 3px solid var(--color-primary);
}
.tpl-hero-name--plaque {
  font-family: var(--font-display);
  font-size: clamp(30px, 5vw, 40px);
  font-weight: 700;
  color: var(--pal-text);
  margin: 0 0 8px;
  letter-spacing: 1px;
}
.tpl-hero-bio--plaque {
  margin-bottom: 14px;
}
.tpl-hero-actions--plaque {
  margin-top: 18px;
}

/* ===== split（folio）===== */
.tpl-hero--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 48px;
  align-items: center;
  min-height: 82vh;
  max-width: 1100px;
  margin: 0 auto;
  padding: 120px 32px 64px;
}
.tpl-hero-name--split {
  font-family: var(--font-display);
  font-size: clamp(44px, 6vw, 72px);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -1px;
  color: var(--pal-text);
  margin: 18px 0 16px;
}
.tpl-hero-bio {
  font-size: 17px;
  line-height: 1.7;
  color: var(--pal-text-dim);
  margin: 0 0 28px;
}
.tpl-hero-links {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
}
.tpl-hero-links a {
  color: var(--pal-text-dim);
  text-decoration: none;
  font-size: 14px;
  transition: color var(--dur-mid);
}
.tpl-hero-links a:hover {
  color: var(--color-primary);
}
.tpl-hero-sep {
  color: var(--pal-border);
}
.tpl-hero-split-art {
  position: relative;
  height: 480px;
}
.tpl-hero-split-img {
  position: absolute;
  width: 78%;
  max-height: 420px;
  object-fit: cover;
  border-radius: 8px;
  box-shadow: 0 24px 64px color-mix(in srgb, var(--pal-text) 22%, transparent);
}
.tpl-hero-split-img:nth-child(1) {
  top: 0;
  left: 0;
}
.tpl-hero-split-img:nth-child(2) {
  bottom: 0;
  right: 0;
  /* F4: 第二张缩窄（56%），避免与第一张（78%）对角叠放时遮挡作品主体 */
  width: 56%;
}

@media (max-width: 768px) {
  .tpl-hero--split {
    grid-template-columns: 1fr;
    padding-top: 96px;
    min-height: auto;
  }
  .tpl-hero-split-art {
    height: 320px;
  }
  .tpl-hero-plaque {
    margin: 0 20px 28px;
    max-width: none;
  }
  .tpl-hero-name--plaque {
    font-size: clamp(24px, 6vw, 30px);
  }
}
</style>
