<template>
  <article
    class="artist-card"
    tabindex="0"
    role="button"
    :aria-label="cardLabel"
    @click="$emit('enter')"
    @keyup.enter="$emit('enter')"
    @keyup.space.prevent="$emit('enter')"
  >
    <div class="artist-avatar">
      <!-- U3: 原生 img + loading="lazy"（el-avatar 不透传 attrs 到 img，改用等价圆形头像）；
           名字就在下方正文里，头像是装饰，故 alt 留空 -->
      <img
        v-if="artist.avatar"
        :src="`/uploads/${artist.avatar}`"
        alt=""
        loading="lazy"
        class="artist-avatar-img"
      />
      <span v-else class="artist-avatar-fallback" aria-hidden="true">{{ initial }}</span>
    </div>
    <h3 class="artist-name">{{ artist.name }}</h3>
    <p class="artist-status">
      <el-tag :type="statusType" effect="dark" size="small">
        {{ $t(`common.status.${artist.status}`) }}
      </el-tag>
    </p>
    <p class="artist-bio">{{ artist.bio || $t('landing.noBio') }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ArtistListItem } from '../../api/types'
import { ARTIST_STATUS_TYPE } from '../../constants/order'

const props = defineProps<{ artist: ArtistListItem }>()
defineEmits<{ (e: 'enter'): void }>()

const { t } = useI18n()

const statusType = computed(() => ARTIST_STATUS_TYPE[props.artist.status] || 'info')
const initial = computed(() => props.artist.name?.charAt(0) ?? '')
// P1-3：可访问名必须含状态——可约性是目录页最关键的信息，读屏不能只听得到名字
const cardLabel = computed(() => `${props.artist.name} · ${t(`common.status.${props.artist.status}`)}`)
</script>

<style scoped>
.artist-card {
  text-align: center;
  cursor: pointer;
  /* 同一行卡片等高：简介 2 行截断 + 网格 stretch 时，短简介卡会矮一截（768 实测行高差）。
     这里让卡片自身撑满网格行高，内部用 flex 把状态/简介压到底部对齐。 */
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--r-card);
  /* T 波：hover/active 禁位移——位移换背景加深 + 阴影加深 */
  transition: box-shadow var(--dur-fast), background var(--dur-slow), border-color var(--dur-fast);
}
.artist-card:hover {
  border-color: var(--border-color-strong);
  box-shadow: var(--shadow-card-hover);
}
.artist-card:active { background: var(--bg-hover); }
.artist-avatar { margin-bottom: 12px; }
.artist-avatar-img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  display: inline-block;
  background: var(--bg-inset);
}
.artist-avatar-fallback {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--text-secondary);
  background: var(--bg-inset);
}
.artist-name {
  font-size: 18px;
  line-height: 1.4;
  color: var(--text-primary);
}
.artist-status { margin-top: 8px; }
.artist-status {
  /* P0-2：状态标签对比度。EP 的 el-tag--dark 走 theme.css 里「深字压亮底」那套覆写
     （#0E3D20 on #2F7D54=2.45:1、#4d320b on #966C0A=2.50:1、#5c1616 on #BC3A2B=2.39:1）。
     底色后来被 issue #73-1 换成暗调纸墨盘，深字就压不住了。
     本批不动那条全站 token（admin 的 el-tag--dark 也吃它，须先逐页确认，见 SPEC §6.5-4），
     只在门面页卡片内把文字改回白：白 on #2F7D54=5.02、白 on #966C0A=4.72、白 on #BC3A2B=5.56，三条全过 AA。
     变量必须落在 el-tag 元素自身上（父级继承会被元素自身声明压过），故用 .artist-card 前缀把特异性提到 0,4,0。 */
}
.artist-card .artist-status .el-tag.el-tag--dark { --el-tag-text-color: #ffffff; }
/* 暗色：底色已提亮，白字反过来不达标 → 回到深字（success 5.57 / warning 5.50）；「休息中」原 #6b1a1a 仅 4.04，压深到 #3d0c0c → 5.74 */
html.dark .artist-card .artist-status .el-tag.el-tag--dark.el-tag--success { --el-tag-text-color: #123D20; }
html.dark .artist-card .artist-status .el-tag.el-tag--dark.el-tag--warning { --el-tag-text-color: #54370c; }
html.dark .artist-card .artist-status .el-tag.el-tag--dark.el-tag--danger  { --el-tag-text-color: #3d0c0c; }

.artist-bio {
  margin-top: 12px;
  width: 100%;
  font-size: 13px;
  line-height: 1.6;
  min-height: 40px;
  color: var(--text-secondary);
  /* P2-1：简介上限 500 字，不截断会把整行卡片拉高 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
</style>