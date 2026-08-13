<template>
  <el-drawer v-model="visible" :title="`${artist?.name || ''} — ${$t('admin.artistDetail')}`" size="560px" destroy-on-close>
    <el-tabs v-model="tab" v-if="artist" class="detail-tabs">
      <!-- 基本资料 -->
      <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
        <el-form label-position="top" size="default" v-loading="profileLoading">
          <el-form-item :label="$t('settings.nameLabel')">
            <el-input v-model="profile.name" />
          </el-form-item>
          <el-form-item :label="$t('settings.codeLabel')">
            <el-input v-model="profile.artist_code" maxlength="10" />
          </el-form-item>
          <el-form-item :label="$t('settings.bioLabel')">
            <el-input v-model="profile.bio" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="$t('settings.statusLabel')">
            <el-radio-group v-model="profile.status">
              <el-radio-button value="open">{{ $t('settings.statusOpen') }}</el-radio-button>
              <el-radio-button value="full">{{ $t('settings.statusFull') }}</el-radio-button>
              <el-radio-button value="break">{{ $t('settings.statusBreak') }}</el-radio-button>
              <el-radio-button value="hidden">{{ $t('settings.statusHidden') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="$t('settings.contactQqLabel')">
            <el-input v-model="profile.contact_qq" maxlength="15" />
          </el-form-item>
          <el-button type="primary" @click="saveProfile" :loading="saving">{{ $t('settings.save') }}</el-button>
        </el-form>
      </el-tab-pane>

      <!-- 价格概览（SPEC-PRICE-2：画风/尺寸只读；价格由画师在「画风与价格」页维护） -->
      <el-tab-pane :label="$t('menu.tiers')" name="pricing" lazy>
        <div v-loading="pricingLoading">
          <div v-for="style in stylesOverview" :key="style.id" class="pricing-style">
            <div class="pricing-style-name">{{ style.name }}<span v-if="!style.is_active" class="pricing-inactive">（{{ $t('styleManage.styleInactiveTag') }}）</span></div>
            <div v-for="sz in style.sizes" :key="sz.id" class="tier-row">
              <span class="tier-name">{{ sz.name }}</span>
              <el-tag size="small" effect="plain" :type="sizeStatusType(sz.display_status)">{{ sizeStatusLabel(sz.display_status) }}</el-tag>
              <span class="tier-price text-gold">{{ formatYuanValue(sz.base_price) }}</span>
            </div>
            <div v-if="style.sizes.length === 0" class="pricing-empty">{{ $t('styleManage.sizeEmpty') }}</div>
          </div>
          <el-empty v-if="!pricingLoading && stylesOverview.length === 0" :image-size="40" />
          <p class="hint">{{ $t('admin.pricingHint') }}</p>
        </div>
      </el-tab-pane>

      <!-- 作品管理 -->
      <el-tab-pane :label="$t('menu.artworks')" name="artworks" lazy>
        <div v-loading="artworksLoading" class="artwork-grid">
          <div v-for="a in artworks" :key="a.id" class="artwork-item">
            <el-image
              :src="`/uploads/${a.image_path}`" fit="cover" class="artwork-img"
              :preview-src-list="artworkUrls" :initial-index="artworks.indexOf(a)"
              preview-teleported
            />
            <el-button text size="small" type="danger" :aria-label="$t('common.delete')" @click="removeArtwork(a.id)">✕</el-button>
          </div>
        </div>
        <el-empty v-if="!artworksLoading && artworks.length === 0" :image-size="40" />
        <p class="hint">{{ $t('admin.artworkHint') }}</p>
      </el-tab-pane>

      <!-- 流程与比例 -->
      <el-tab-pane :label="$t('settings.tabWorkflow')" name="workflow" lazy>
        <WorkflowPaymentEditor :artist-id="artist.id" mode="admin" />
      </el-tab-pane>

      <!-- 问候语（专属库） -->
      <el-tab-pane :label="$t('admin.greetingTab')" name="greetings" lazy>
        <GreetingTable :artist-id="artist.id" :preview-name="artist.name" />
      </el-tab-pane>

      <!-- 约稿须知 -->
      <el-tab-pane :label="$t('menu.rules')" name="rules" lazy>
        <el-input v-model="rulesContent" type="textarea" :rows="10" v-loading="rulesLoading" />
        <el-button type="primary" size="small" style="margin-top: 8px" @click="saveRules" :loading="savingRules">
          {{ $t('settings.save') }}
        </el-button>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'
import GreetingTable from '../../components/admin/GreetingTable.vue'
import { formatYuanValue } from '../../utils/money.js'

const { t } = useI18n()
const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ artist: { type: Object, default: null } })

const tab = ref('profile')
const saving = ref(false)

// 资料
const profileLoading = ref(false)
const profile = ref({})
const originalProfile = ref({}) // M-2: 记录初始值，只发送有变化的字段
// 价格概览（SPEC-PRICE-2：画风/尺寸只读）
const pricingLoading = ref(false)
const stylesOverview = ref([])
// 作品
const artworksLoading = ref(false)
const artworks = ref([])
const artworkUrls = computed(() => artworks.value.map(a => `/uploads/${a.image_path}`))
// 须知
const rulesLoading = ref(false)
const rulesContent = ref('')
const savingRules = ref(false)

watch(() => props.artist, async (a) => {
  if (!a) return
  tab.value = 'profile'
  // 加载资料
  profileLoading.value = true
  try {
    const p = await adminApi.getArtistProfile(a.id)
    profile.value = { name: p.name, bio: p.bio || '', status: p.status, artist_code: p.artist_code || '', contact_qq: p.contact_qq || '' }
    originalProfile.value = { ...profile.value } // M-2: 快照初始值
  } catch (err) { ElMessage.error(err.message) }
  finally { profileLoading.value = false }
  // 预加载价格概览
  loadPricing()
}, { immediate: true })

watch(tab, (tabName) => {
  if (tabName === 'pricing') loadPricing()
  if (tabName === 'artworks') loadArtworks()
  if (tabName === 'rules') loadRules()
})

async function loadPricing() {
  if (!props.artist) return
  pricingLoading.value = true
  try { stylesOverview.value = await adminApi.getArtistPricingOverview(props.artist.id) }
  catch (err) { ElMessage.error(err.message) }
  finally { pricingLoading.value = false }
}

/** 尺寸三态展示（与后端 display_status 枚举对齐） */
function sizeStatusLabel(status) {
  if (status === 'showcase') return t('styleManage.sizeStatusShow')
  if (status === 'closed') return t('styleManage.sizeStatusClose')
  return t('styleManage.sizeStatusOpen')
}
function sizeStatusType(status) {
  return { available: 'success', showcase: 'warning', closed: 'danger' }[status] || 'info'
}

async function loadArtworks() {
  if (!props.artist) return
  artworksLoading.value = true
  try { artworks.value = await adminApi.getArtistArtworks(props.artist.id) }
  catch (err) { ElMessage.error(err.message) }
  finally { artworksLoading.value = false }
}

async function loadRules() {
  if (!props.artist) return
  rulesLoading.value = true
  try {
    const r = await adminApi.getArtistRules(props.artist.id)
    rulesContent.value = r?.content || ''
  } catch (err) { ElMessage.error(err.message) }
  finally { rulesLoading.value = false }
}

async function saveProfile() {
  saving.value = true
  try {
    // M-2 修复：只发送有变化的字段，避免未修改的 bio 被空字符串覆盖
    const changed = {}
    for (const key of Object.keys(profile.value)) {
      if (profile.value[key] !== originalProfile.value[key]) {
        changed[key] = profile.value[key]
      }
    }
    if (Object.keys(changed).length === 0) {
      ElMessage.info(t('settings.noChanges') || '没有修改')
      return
    }
    await adminApi.updateArtistProfile(props.artist.id, changed)
    originalProfile.value = { ...profile.value } // 保存成功后更新快照
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

async function removeArtwork(aid) {
  try { await adminApi.deleteArtistArtwork(props.artist.id, aid); await loadArtworks() }
  catch (err) { ElMessage.error(err.message) }
}

async function saveRules() {
  savingRules.value = true
  try {
    await adminApi.updateArtistRules(props.artist.id, rulesContent.value)
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error(err.message) }
  finally { savingRules.value = false }
}
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807）——抽屉统一纸墨样式 ═══ */
.detail-tabs :deep(.el-tabs__item) {
  color: var(--ink2);
}
.detail-tabs :deep(.el-tabs__item.is-active) {
  color: var(--hq);
  font-weight: 600;
}
.detail-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--hq);
}
.tier-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.tier-name { font-weight: 600; }
.tier-price { margin-left: auto; font-weight: 700; }
.pricing-style { margin-bottom: 12px; }
.pricing-style-name { font-weight: 700; padding: 4px 0; }
.pricing-inactive { font-weight: 400; color: var(--el-text-color-secondary); margin-left: 4px; }
.pricing-empty { color: var(--el-text-color-secondary); font-size: 12px; padding: 4px 0; }
.add-row { display: flex; gap: 8px; margin-top: 12px; }
.artwork-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.artwork-item { position: relative; }
.artwork-img { width: 100%; height: 120px; border-radius: 6px; }
.artwork-item .el-button { position: absolute; top: 4px; right: 4px; }
.hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }
</style>
