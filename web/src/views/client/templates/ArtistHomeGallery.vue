<template>
  <div v-if="artist" class="gallery" ref="rootEl">
    <!-- 开场：全屏画作 + 角落展签 -->
    <TplHero :artist="artist" :artworks="artworks" :subdomain="subdomain" variant="fullscreen" ref="heroRef" />

    <!-- 作品画廊：大小交错 editorial -->
    <section class="gallery-section tpl-reveal" v-if="artworks.length">
      <p class="tpl-section-label gallery-label">{{ $t('artistHome.artworks') }}</p>
      <TplGallery :artworks="artworks" layout="editorial" />
    </section>

    <!-- 价格档位 -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="tiers.length">
      <div class="gallery-inner">
        <p class="tpl-section-label gallery-label">{{ $t('artistHome.priceList') }}</p>
        <TplTierGrid :tiers="tiers">
          <template #addons="{ tier }">
            <slot name="addons" :tier="tier"></slot>
          </template>
        </TplTierGrid>
      </div>
    </section>

    <!-- 约稿流程 -->
    <section class="gallery-section tpl-reveal" v-if="workflowStages.length">
      <div class="gallery-inner">
        <p class="tpl-section-label gallery-label">{{ $t('artistHome.workflow') }}</p>
        <WorkflowOverviewStrip :stages="workflowStages" vertical />
      </div>
    </section>

    <!-- 约稿须知 -->
    <section class="gallery-section gallery-section--alt tpl-reveal" v-if="rules">
      <TplRules :rules="rules" :sanitized-rules="sanitizedRules" />
    </section>

    <!-- 页脚 -->
    <footer class="gallery-footer">
      <ThemePicker />
      <Disclaimer />
    </footer>

    <!-- 吸底约稿条（滚过开场后浮现） -->
    <TplStickyCta :visible="ctaVisible" :artist="artist" :subdomain="subdomain" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useArtistData } from '../../../composables/useArtistData.js'
import { useScrollReveal } from '../../../composables/useScrollReveal.js'
import { useStickyCta } from '../../../composables/useStickyCta.js'
import TplHero from '../../../components/templates/TplHero.vue'
import TplGallery from '../../../components/templates/TplGallery.vue'
import TplTierGrid from '../../../components/templates/TplTierGrid.vue'
import TplRules from '../../../components/templates/TplRules.vue'
import TplStickyCta from '../../../components/templates/TplStickyCta.vue'
import ThemePicker from '../../../components/ThemePicker.vue'
import Disclaimer from '../../../components/Disclaimer.vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  artist: Object, tiers: Array, artworks: Array, rules: String,
  workflowStages: Array, subdomain: String, sanitizedRules: String, pricing: Object
})

useArtistData(props)

const rootEl = ref(null)
const heroRef = ref(null)
useScrollReveal(rootEl)

// 吸底 CTA：监听 Hero 哨兵元素（sentinelEl 是 TplHero expose 的 ref，需解两层）
const heroSentinel = computed(() => heroRef.value?.sentinelEl?.value)
const { visible: ctaVisible } = useStickyCta(heroSentinel)
</script>

<style scoped>
.gallery {
  min-height: 100vh;
  background: var(--pal-bg);
  transition: background 0.3s;
}

.gallery-section {
  padding: 88px 24px;
}
.gallery-section--alt {
  background: var(--pal-bg-alt);
}
.gallery-inner {
  max-width: 900px;
  margin: 0 auto;
}
.gallery-label {
  text-align: center;
  margin-bottom: 48px;
}

.gallery-footer {
  padding: 48px 24px 96px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

@media (max-width: 768px) {
  .gallery-section {
    padding: 56px 16px;
  }
}
</style>
