<template>
  <el-drawer v-model="visible" :title="`${artist?.name || ''} — ${$t('admin.artistDetail')}`" size="560px" destroy-on-close class="detail-drawer">
    <el-tabs v-model="tab" v-if="artist" class="detail-tabs">
      <!-- 基本资料 -->
      <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
        <!-- P1-B：资料加载失败不再静默——错误横幅 + 重试 + 禁用保存（复用公告页 P0 模式） -->
        <div v-if="profileLoadFailed" class="load-error-banner" role="alert">
          <span>{{ t('common.networkError') }}</span>
          <el-button size="small" @click="loadProfile">{{ t('dashboard.retry') }}</el-button>
        </div>
        <!-- 819-I：一行一事——说明在左、控件在右（结构微调，交互与保存逻辑不动） -->
        <div class="group detail-group" v-loading="profileLoading">
          <!-- 登录留痕批（v72）：上次登录时间+IP（只读；登录成功时记录，仅管理端可见） -->
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('admin.lastLogin.detail') }}</div>
              <div class="desc">{{ lastLoginText }}</div>
            </div>
          </div>
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('settings.nameLabel') }}</div>
              <div class="desc">{{ $t('admin.detailNameHint') }}</div>
            </div>
            <el-input v-model="profile.name" class="field-input" />
          </div>
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('settings.codeLabel') }}</div>
              <div class="desc">{{ $t('settings.codeHint') }}</div>
            </div>
            <el-input v-model="profile.artist_code" maxlength="10" class="field-input" />
          </div>
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('settings.bioLabel') }}</div>
              <div class="desc">{{ $t('admin.detailBioHint') }}</div>
            </div>
            <el-input v-model="profile.bio" type="textarea" :rows="3" class="field-textarea" />
          </div>
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('settings.statusLabel') }}</div>
              <div class="desc">{{ $t('admin.detailStatusHint') }}</div>
            </div>
            <el-radio-group v-model="profile.status">
              <el-radio-button value="open">{{ $t('settings.statusOpen') }}</el-radio-button>
              <el-radio-button value="full">{{ $t('settings.statusFull') }}</el-radio-button>
              <el-radio-button value="break">{{ $t('settings.statusBreak') }}</el-radio-button>
              <el-radio-button value="hidden">{{ $t('settings.statusHidden') }}</el-radio-button>
            </el-radio-group>
          </div>
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('settings.contactQqLabel') }}</div>
              <div class="desc">{{ $t('settings.contactQqHint') }}</div>
            </div>
            <el-input v-model="profile.contact_qq" maxlength="15" class="field-input" />
          </div>
          <div class="form-actions">
            <el-button type="primary" @click="saveProfile" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
          </div>
        </div>
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
            <el-button
              text size="small" type="danger"
              :aria-label="$t('common.delete')"
              :loading="removingArtworkId === a.id"
              :disabled="removingArtworkId !== null"
              @click="removeArtwork(a)"
            >
              ✕
            </el-button>
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
        <!-- P1-B：须知加载失败不再静默——错误横幅 + 重试 + 禁用保存 -->
        <div v-if="rulesLoadFailed" class="load-error-banner" role="alert">
          <span>{{ t('common.networkError') }}</span>
          <el-button size="small" @click="loadRules">{{ t('dashboard.retry') }}</el-button>
        </div>
        <!-- 819-I：一行一事——说明在左、正文编辑在右 -->
        <div class="group detail-group">
          <div class="row">
            <div class="field-text">
              <div class="lab">{{ $t('menu.rules') }}</div>
              <div class="desc">{{ $t('admin.detailRulesHint') }}</div>
            </div>
            <el-input v-model="rulesContent" type="textarea" :rows="10" v-loading="rulesLoading" class="rules-input" />
          </div>
          <div class="form-actions">
            <el-button type="primary" size="small" @click="saveRules" :loading="savingRules" :disabled="rulesLoadFailed">
              {{ $t('settings.save') }}
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { PropType } from 'vue'
import { adminApi } from '../../api/index'
import type { AdminArtistItem, Artwork, ArtistPricingOverviewItem } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'
import GreetingTable from '../../components/admin/GreetingTable.vue'
import { formatYuanValue } from '../../utils/money'
import { formatDateTime } from '../../utils/datetime'

const { t } = useI18n()
const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ artist: { type: Object as PropType<AdminArtistItem | null>, default: null } })

const tab = ref('profile')
const saving = ref(false)

// ─── 登录留痕批（v72）：上次登录时间+IP（数据源为列表行，管理端接口专属字段） ───
const lastLoginText = computed(() => {
  const a = props.artist
  if (!a?.last_login_at) return t('admin.lastLogin.detailNone')
  const parts = [formatDateTime(a.last_login_at)]
  if (a.last_login_ip) parts.push(`IP ${a.last_login_ip}`)
  return parts.join(' · ')
})

/** 资料表单状态（抽屉编辑字段；初始空对象与原实现一致，断言仅为补形状） */
interface ProfileForm {
  name: string
  bio: string
  status: string
  artist_code: string
  contact_qq: string
}

// 资料
const profileLoading = ref(false)
const profileLoadFailed = ref(false)
const profile = ref<ProfileForm>({} as ProfileForm)
const originalProfile = ref<ProfileForm>({} as ProfileForm) // M-2: 记录初始值，只发送有变化的字段
// 价格概览（SPEC-PRICE-2：画风/尺寸只读）
const pricingLoading = ref(false)
const stylesOverview = ref<ArtistPricingOverviewItem[]>([])
// 作品
const artworksLoading = ref(false)
const artworks = ref<Artwork[]>([])
const artworkUrls = computed(() => artworks.value.map(a => `/uploads/${a.image_path}`))
// 须知
const rulesLoading = ref(false)
const rulesLoadFailed = ref(false)
const rulesContent = ref('')
const savingRules = ref(false)
// P1-B：删除作品行级 loading/禁用（防连点）
const removingArtworkId = ref<number | null>(null)

watch(() => props.artist, async (a) => {
  if (!a) return
  tab.value = 'profile'
  // 加载资料
  await loadProfile()
  // 预加载价格概览
  loadPricing()
}, { immediate: true })

async function loadProfile() {
  if (!props.artist) return
  profileLoading.value = true
  profileLoadFailed.value = false
  try {
    const p = await adminApi.getArtistProfile(props.artist.id)
    if (!props.artist) return
    profile.value = { name: p.name, bio: p.bio || '', status: p.status, artist_code: p.artist_code || '', contact_qq: p.contact_qq || '' }
    originalProfile.value = { ...profile.value } // M-2: 快照初始值
  } catch {
    profileLoadFailed.value = true
  }
  finally { profileLoading.value = false }
}

watch(tab, (tabName) => {
  if (tabName === 'pricing') loadPricing()
  if (tabName === 'artworks') loadArtworks()
  if (tabName === 'rules') loadRules()
})

async function loadPricing() {
  if (!props.artist) return
  pricingLoading.value = true
  try { stylesOverview.value = await adminApi.getArtistPricingOverview(props.artist.id) }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { pricingLoading.value = false }
}

/** 尺寸三态展示（与后端 display_status 枚举对齐） */
function sizeStatusLabel(status: string) {
  if (status === 'showcase') return t('styleManage.sizeStatusShow')
  if (status === 'closed') return t('styleManage.sizeStatusClose')
  return t('styleManage.sizeStatusOpen')
}
function sizeStatusType(status: string) {
  return ({ available: 'success', showcase: 'warning', closed: 'danger' } as Record<string, string>)[status] || 'info'
}

async function loadArtworks() {
  if (!props.artist) return
  artworksLoading.value = true
  try { artworks.value = await adminApi.getArtistArtworks(props.artist.id) }
  catch (err) { ElMessage.error((err as Error).message) }
  finally { artworksLoading.value = false }
}

async function loadRules() {
  if (!props.artist) return
  rulesLoading.value = true
  rulesLoadFailed.value = false
  try {
    const r = await adminApi.getArtistRules(props.artist.id)
    rulesContent.value = r?.content || ''
  } catch {
    rulesLoadFailed.value = true
  }
  finally { rulesLoading.value = false }
}

async function saveProfile() {
  // P1-B：未加载成功禁止保存（防止空表单覆盖现有资料）
  if (profileLoadFailed.value) {
    ElMessage.error(t('common.networkError'))
    return
  }
  saving.value = true
  try {
    // M-2 修复：只发送有变化的字段，避免未修改的 bio 被空字符串覆盖
    const changed: Record<string, unknown> = {}
    for (const key of Object.keys(profile.value)) {
      if ((profile.value as Record<string, unknown>)[key] !== (originalProfile.value as Record<string, unknown>)[key]) {
        changed[key] = (profile.value as Record<string, unknown>)[key]
      }
    }
    if (Object.keys(changed).length === 0) {
      ElMessage.info(t('settings.noChanges') || '没有修改')
      return
    }
    await adminApi.updateArtistProfile(props.artist!.id, changed)
    originalProfile.value = { ...profile.value } // 保存成功后更新快照
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { saving.value = false }
}

async function removeArtwork(a: Artwork) {
  const name = a.title?.trim() || a.description?.trim() || t('admin.artworkUntitled')
  try {
    await ElMessageBox.confirm(
      t('admin.artworkDeleteConfirm', { name }),
      t('common.confirmDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return } // 用户取消，非错误
  if (removingArtworkId.value === a.id) return
  removingArtworkId.value = a.id
  try {
    await adminApi.deleteArtistArtwork(props.artist!.id, a.id)
    ElMessage.success(t('common.deleted'))
    await loadArtworks()
  } catch (err) { ElMessage.error((err as Error).message) }
  finally { removingArtworkId.value = null }
}

async function saveRules() {
  // P1-B：未加载成功禁止保存（防止覆盖现有须知）
  if (rulesLoadFailed.value) {
    ElMessage.error(t('common.networkError'))
    return
  }
  savingRules.value = true
  try {
    await adminApi.updateArtistRules(props.artist!.id, rulesContent.value)
    ElMessage.success(t('settings.saved'))
  } catch (err) { ElMessage.error((err as Error).message) }
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

/* 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） */
.group {
  padding: 4px 16px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.field-text { min-width: 0; }
.field-input { width: 240px; }
.field-textarea { width: 300px; }
.rules-input { width: 300px; }
.form-actions { display: flex; justify-content: flex-end; padding-top: 12px; }

.tier-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.tier-name { font-weight: 600; }
.tier-price { margin-left: auto; font-weight: 700; }
.pricing-style { margin-bottom: 12px; }
.pricing-style-name { font-weight: 700; padding: 4px 0; }
.pricing-inactive { font-weight: 400; color: var(--el-text-color-secondary); margin-left: 4px; }
.pricing-empty { color: var(--el-text-color-secondary); font-size: 12px; padding: 4px 0; }
.artwork-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.artwork-item { position: relative; }
.artwork-img { width: 100%; height: 120px; border-radius: var(--r-m); }
.artwork-item .el-button { position: absolute; top: 4px; right: 4px; }
.hint { font-size: 12px; color: var(--ink2); margin-top: 8px; }

/* P1-B：加载失败横幅（复用公告页 P0 同款模式） */
.load-error-banner {
  padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--zs-t); color: var(--zs); border-radius: var(--r-m); font-size: 13px;
  margin-bottom: 12px;
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .field-input, .field-textarea, .rules-input { width: 100%; }
}

/* P1-B：≤600px 抽屉占满宽度（左右各留 12px），防 390px 窄屏挤出视口 */
@media (max-width: 600px) {
  .detail-drawer {
    width: calc(100% - 24px) !important;
  }
}
</style>
