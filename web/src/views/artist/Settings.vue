<template>
  <h2 class="font-display">{{ $t('settings.title') }}</h2>

  <!-- BUG-7 修复：profile 加载失败横幅 -->
  <el-alert
    v-if="profileLoadFailed"
    type="error" :closable="false" show-icon
    style="margin-top: 16px"
    :title="$t('settings.loadFailedTitle')"
  >
    <div>{{ $t('settings.loadFailedDesc') }}</div>
    <el-button size="small" type="primary" style="margin-top: 8px" @click="loadProfile">{{ $t('settings.retry') }}</el-button>
  </el-alert>

  <el-tabs v-model="activeTab" :before-leave="beforeTabLeave" style="margin-top: 16px">
    <!-- 基本资料 -->
    <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
      <SettingsProfileTab
        :name="form.name"
        :artist-code="form.artistCode"
        :bio="form.bio"
        :contact-qq="form.contactQq"
        :avatar="form.avatar"
        :loading="loading"
        :saving="saving"
        :profile-load-failed="profileLoadFailed"
        @save="save"
        @update:name="form.name = $event"
        @update:artist-code="form.artistCode = $event"
        @update:bio="form.bio = $event"
        @update:contact-qq="form.contactQq = $event"
        @avatar-pick="handleAvatarSelect"
      />
    </el-tab-pane>

    <!-- REQ-016 A: 主页展示 -->
    <el-tab-pane :label="$t('settings.tabShowcase')" name="showcase" lazy>
      <SettingsShowcaseTab
        :form="form"
        :loading="loading"
        :saving="saving"
        :profile-load-failed="profileLoadFailed"
        :platforms="platforms"
        :new-tag="newTag"
        :rules-content="rulesContent"
        :rules-loading="rulesLoading"
        :rules-saving="rulesSaving"
        :rules-load-failed="rulesLoadFailed"
        :rules-loaded="rulesLoaded"
        :sanitized-rules-preview="sanitizedRulesPreview"
        @save="save"
        @update:status="form.status = $event"
        @add-link="addLink"
        @remove-link="removeLink"
        @move-link="moveLink"
        @detect-link="detectLinkPlatform"
        @add-tag="addTag"
        @remove-tag="removeTag"
        @save-rules="saveRules"
        @retry-rules="loadRules"
        @update:new-tag="(v) => newTag = v"
        @update:rules-content="(v) => rulesContent = v"
      />
    </el-tab-pane>

    <!-- 模板与风格 -->
    <el-tab-pane :label="$t('settings.tabTemplate')" name="template" lazy>
      <SettingsTemplateTab
        :form="form"
        :loading="loading"
        :saving="saving"
        :profile-load-failed="profileLoadFailed"
        :templates="templates"
        :palettes="palettes"
        :accent-presets="ACCENT_PRESETS"
        :cover-preview="coverPreview"
        :cover-loading="coverLoading"
        @save="save"
        @preview="openPreview"
        @pick-template="(id) => form.templateId = id"
        @pick-palette="(id) => form.paletteId = id"
        @pick-accent="(color) => form.accentColor = color"
      />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { artistApi, artistPublicApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sanitizeHtml } from '../../utils/sanitize.js'
import { validateLink, MAX_LINK_COUNT as MAX_LINKS } from '../../utils/linkValidation.js'
import { trackEvent } from '../../utils/track.js'
import { Notebook, Brush, Picture, Sunny, Collection, Moon, Document, MagicStick } from '@element-plus/icons-vue'
import SettingsProfileTab from '../../components/artist/settings/SettingsProfileTab.vue'
import SettingsShowcaseTab from '../../components/artist/settings/SettingsShowcaseTab.vue'
import SettingsTemplateTab from '../../components/artist/settings/SettingsTemplateTab.vue'

const { t } = useI18n()
const route = useRoute()
const VALID_TABS = ['profile', 'showcase', 'template']
const TAB_ALIASES = { rules: 'showcase' }
const rawTab = route.query.tab
if (rawTab === 'prefs' || rawTab === 'commission') {
  window.location.replace('/preferences')
}
const activeTab = ref(
  VALID_TABS.includes(rawTab) ? rawTab
    : TAB_ALIASES[rawTab] || 'profile'
)
const loading = ref(true)
const saving = ref(false)

// Rules
const rulesContent = ref('')
const rulesSaving = ref(false)
const rulesLoading = ref(false)
const rulesLoadFailed = ref(false)
const rulesLoaded = ref(false)

const sanitizedRulesPreview = computed(() => sanitizeHtml(rulesContent.value))

async function loadRules() {
  if (rulesLoaded.value) return
  rulesLoading.value = true
  rulesLoadFailed.value = false
  try {
    const rules = await artistApi.getRules()
    rulesContent.value = rules?.content || ''
    rulesLoaded.value = true
    markTabSaved('showcase')
  } catch {
    rulesLoadFailed.value = true
  } finally { rulesLoading.value = false }
}

async function saveRules() {
  if (rulesLoadFailed.value || !rulesLoaded.value) return
  rulesSaving.value = true
  try {
    await artistApi.updateRules(rulesContent.value)
    ElMessage.success(t('rules.saved'))
    markTabSaved('showcase')
    trackEvent('artist_action', { action: 'settings_save', tab: 'rules' })
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    rulesSaving.value = false
  }
}

watch(activeTab, (tab) => { if (tab === 'showcase') loadRules() }, { immediate: true })

// Platforms
const platforms = ref([])

function detectLinkPlatform(link) {
  const raw = String(link.url || '').trim()
  if (!raw) { link.platformId = null; return }
  const res = validateLink(raw, platforms.value)
  link.platformId = res.ok ? (res.platformId ?? null) : null
}

const form = reactive({
  name: '', bio: '',
  status: 'open',
  customLinks: [],
  inspirationTags: [],
  contactQq: '',
  artistCode: '',
  templateId: 'classic',
  paletteId: 'paper',
  accentColor: null,
  avatar: '',
  subdomain: '',
  announcement: '',
  announcementExpiresAt: null
})


const ACCENT_PRESETS = [
  { color: '#356B69', nameKey: 'pref.accentNames.teal' },
  { color: '#3F5E80', nameKey: 'pref.accentNames.turquoise' },
  { color: '#5E5494', nameKey: 'pref.accentNames.blue' },
  { color: '#346edb', nameKey: 'pref.accentNames.indigo' },
  { color: '#3445db', nameKey: 'pref.accentNames.violet' }
]



async function handleAvatarSelect(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('settings.avatarNotImage'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('settings.avatarTooBig'))
    return
  }
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.updateProfile({ avatar: uploaded.filePath })
    form.avatar = uploaded.filePath
    ElMessage.success(t('settings.avatarUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

function openPreview() {
  const params = new URLSearchParams({
    _tpl: form.templateId,
    _pal: form.paletteId
  })
  if (form.accentColor) params.set('_accent', form.accentColor)
  window.open(`/artist/${form.subdomain}?${params.toString()}`, '_blank', 'noopener')
}

const coverArtworks = ref([])
const coverLoading = ref(false)
let coverLoaded = false

const coverPreview = computed(() => coverArtworks.value.find(a => a.is_cover) || null)

async function loadCoverArtworks() {
  if (coverLoaded) return
  coverLoading.value = true
  try {
    const list = await artistApi.getArtworks()
    coverArtworks.value = Array.isArray(list) ? list : []
    coverLoaded = true
  } catch { /* ignore */ } finally { coverLoading.value = false }
}

watch(activeTab, (tab) => { if (tab === 'template') loadCoverArtworks() }, { immediate: true })

let linkKey = 1
function addLink() {
  if (form.customLinks.length >= MAX_LINKS) return
  form.customLinks.push({ url: '', platformId: null, __k: linkKey++ })
}
function removeLink(index) {
  form.customLinks.splice(index, 1)
}
function moveLink(index, direction) {
  const target = index + direction
  if (target < 0 || target >= form.customLinks.length) return
  const [item] = form.customLinks.splice(index, 1)
  form.customLinks.splice(target, 0, item)
}

const newTag = ref('')
function addTag() {
  const tag = newTag.value.trim()
  if (!tag) return
  if (tag.length > 30) {
    ElMessage.warning(t('settings.inspireTagTooLong'))
    return
  }
  if (form.inspirationTags.length >= 20) {
    ElMessage.warning(t('settings.inspireTagLimit'))
    return
  }
  if (form.inspirationTags.includes(tag)) {
    ElMessage.warning(t('settings.inspireTagDuplicate'))
    return
  }
  form.inspirationTags.push(tag)
  newTag.value = ''
}
function removeTag(index) {
  form.inspirationTags.splice(index, 1)
}

const templates = computed(() => [
  { id: 'atelier', name: t('templates.atelier'), desc: t('templates.atelierDesc'), preview: [markRaw(Notebook), markRaw(Brush)] },
  { id: 'classic', name: t('templates.classic'), desc: t('templates.classicDesc'), preview: [markRaw(Picture), markRaw(Sunny)] },
  { id: 'gallery', name: t('templates.gallery'), desc: t('templates.galleryDesc'), preview: [markRaw(Collection), markRaw(Moon)] },
  { id: 'folio',   name: t('templates.folio'),   desc: t('templates.folioDesc'),   preview: [markRaw(Document), markRaw(MagicStick)] }
])

const palettes = computed(() => [
  { id: 'paper', name: t('templates.palettePaper'), desc: t('templates.palettePaperDesc'), light: '#faf8f5', dark: '#1c1a17' },
  { id: 'ink',   name: t('templates.paletteInk'),   desc: t('templates.paletteInkDesc'),   light: '#f4f4f2', dark: '#0e0e0e' },
  { id: 'dusk',  name: t('templates.paletteDusk'),  desc: t('templates.paletteDuskDesc'),  light: '#eef1f6', dark: '#121a26' },
  { id: 'moss',  name: t('templates.paletteMoss'),  desc: t('templates.paletteMossDesc'),  light: '#f0f4ee', dark: '#131c13' }
])

async function save() {
  if (profileLoadFailed.value) {
    ElMessage.warning(t('settings.loadFailedHint'))
    return
  }
  saving.value = true
  try {
    if (activeTab.value === 'template') {
      await artistApi.updateProfile({ templateId: form.templateId, paletteId: form.paletteId, accentColor: form.accentColor })
    } else if (activeTab.value === 'showcase') {
      const links = []
      for (const l of form.customLinks) {
        const url = String(l.url || '').trim()
        if (!url) continue
        const res = validateLink(url, platforms.value)
        if (!res.ok) {
          ElMessage.error(res.reason === 'tooLong' ? t('settings.linkTooLong') : t('settings.linkInvalid'))
          return
        }
        links.push({ url: res.url })
      }
      const res = await artistApi.updateProfile({
        status: form.status,
        customLinks: links,
        inspirationTags: form.inspirationTags.map(tag => tag.trim()).filter(Boolean),
        announcement: form.announcement.trim() || null,
        announcementExpiresAt: form.announcementExpiresAt || null
      })
      // REQ-042: 主页公告命中敏感词 → 提示（不硬拦，先发后审）
      if (res?.warning?.sensitiveWords?.length) {
        ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
      }
    } else {
      await artistApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        artistCode: form.artistCode.trim(),
        contactQq: form.contactQq.trim()
      })
    }
    ElMessage.success(t('settings.saved'))
    markTabSaved(activeTab.value)
    trackEvent('artist_action', { action: 'settings_save', tab: activeTab.value })
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

const TAB_BASELINE_FIELDS = {
  profile: ['name', 'bio', 'artistCode', 'contactQq'],
  template: ['templateId', 'paletteId', 'accentColor']
}
const tabBaseline = { profile: null, showcase: null, template: null }

function snapshotTab(tab) {
  if (tab === 'showcase') {
    return JSON.stringify({
      status: form.status,
      links: form.customLinks.map(l => l.url || ''),
      tags: [...form.inspirationTags],
      announcement: form.announcement,
      announcementExpiresAt: form.announcementExpiresAt,
      rules: rulesContent.value
    })
  }
  return JSON.stringify(TAB_BASELINE_FIELDS[tab].map(k => form[k]))
}
function markTabSaved(tab) {
  tabBaseline[tab] = snapshotTab(tab)
}
function isTabDirty(tab) {
  if (tabBaseline[tab] === null) return false
  return snapshotTab(tab) !== tabBaseline[tab]
}
async function beforeTabLeave(newName, oldName) {
  if (!isTabDirty(oldName)) return true
  try {
    await ElMessageBox.confirm(t('settings.unsavedLeaveTip'), t('settings.unsavedLeaveTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    return true
  } catch {
    return false
  }
}

const profileLoadFailed = ref(false)

async function loadProfile() {
  loading.value = true
  profileLoadFailed.value = false
  try {
    const profile = await artistApi.getProfile()
    const LEGACY = { 'default': 'classic', 'dark-gallery': 'gallery', 'single-page': 'folio' }
    const rawTpl = profile.template_id || 'classic'

    let customLinks = []
    if (profile.custom_links) {
      try {
        const parsed = JSON.parse(profile.custom_links)
        if (Array.isArray(parsed)) {
          customLinks = parsed
            .map(item => typeof item === 'string' ? { url: item, platformId: null } : { url: item.url || '', platformId: item.platformId ?? null })
            .filter(item => item.url)
            .map(l => ({ ...l, __k: linkKey++ }))
        }
      } catch { customLinks = [] }
    }

    let inspirationTags = []
    if (profile.inspiration_tags) {
      try {
        const parsed = JSON.parse(profile.inspiration_tags)
        if (Array.isArray(parsed)) inspirationTags = parsed.filter(tag => typeof tag === 'string' && tag)
      } catch { inspirationTags = [] }
    }

    // Reset linkKey to avoid collisions on re-load
    linkKey = customLinks.reduce((max, l) => Math.max(max, l.__k || 0), 0) + 1

    Object.assign(form, {
      name: profile.name,
      bio: profile.bio || '',
      status: profile.status || 'open',
      customLinks,
      inspirationTags,
      contactQq: profile.contact_qq || '',
      artistCode: profile.artist_code || '',
      templateId: LEGACY[rawTpl] || rawTpl,
      paletteId: profile.palette_id || 'paper',
      accentColor: profile.accent_color || null,
      avatar: profile.avatar || '',
      subdomain: profile.subdomain || '',
      announcement: profile.announcement || '',
      announcementExpiresAt: profile.announcement_expires_at ? String(profile.announcement_expires_at).slice(0, 10) : null
    })
    markTabSaved('profile')
    markTabSaved('showcase')
    markTabSaved('template')
  } catch (err) {
    ElMessage.error(err.message)
    profileLoadFailed.value = true
  }
  finally { loading.value = false }
}

async function loadPlatforms() {
  try {
    const list = await artistPublicApi.getPlatforms()
    platforms.value = Array.isArray(list) ? list : []
  } catch { platforms.value = [] }
}

onMounted(() => {
  loadProfile()
  loadPlatforms()
})
</script>

<style scoped>
.form-hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }
.preview-section-title { margin: 16px 0 8px; color: var(--ink2); }
.preview-card { line-height: 1.8; color: var(--ink); }
.link-editor { width: 100%; }
.link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.link-platform-select { width: 150px; flex-shrink: 0; }
.link-url-input { flex: 1; }
.link-empty { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin: 0 0 8px; }
.link-actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}
.template-label { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; margin-bottom: 12px; color: var(--ink); }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.template-card {
  cursor: pointer; border: 2px solid var(--line); border-radius: var(--r-m);
  overflow: hidden; transition: border-color 0.2s ease, box-shadow 0.2s ease; background: var(--card);
}
.template-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); }
.template-card.active { border-color: var(--hq); box-shadow: 0 0 0 1px var(--hq); }
.template-preview {
  height: 80px; display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: calc(var(--font-scale, 1) * 28px); background: var(--paper2);
}
.template-preview-icon { color: var(--hq); opacity: 0.75; }
.template-info { padding: 12px; }
.template-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); margin-bottom: 4px; }
.template-desc { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.4; }
.palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
.palette-card {
  cursor: pointer; border: 2px solid var(--line); border-radius: var(--r-m);
  overflow: hidden; transition: border-color 0.2s ease, box-shadow 0.2s ease; background: var(--card);
}
.palette-card:hover { border-color: color-mix(in srgb, var(--hq) 50%, transparent); }
.palette-card.active { border-color: var(--hq); box-shadow: 0 0 0 1px var(--hq); }
.palette-swatch { height: 56px; display: flex; }
.swatch-light, .swatch-dark { flex: 1; }
.avatar-upload {
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; user-select: none;
}
.avatar-preview { transition: transform 0.15s, box-shadow 0.15s; }
.avatar-upload:hover .avatar-preview { transform: scale(1.05); box-shadow: 0 0 0 3px color-mix(in srgb, var(--hq) 50%, transparent); }
.avatar-upload-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.accent-picker { display: flex; align-items: center; gap: 10px; }
.accent-swatch-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s;
}
.accent-swatch-btn.active { border-color: var(--ink); }
.swatch-check { color: #fff; font-size: calc(var(--font-scale, 1) * 13px); font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.accent-clear-btn {
  padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px;
  background: transparent; cursor: pointer; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2);
  transition: border-color 0.15s, color 0.15s;
}
.accent-clear-btn:hover { border-color: var(--hq); color: var(--hq); }
.accent-clear-btn.active { border-color: var(--hq); color: var(--hq); background: var(--hq-t); }
.template-actions { display: flex; gap: 12px; margin-top: 20px; }
.cover-preview-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 12px; }
.cover-preview-thumb {
  width: 120px; height: 90px; flex-shrink: 0;
  border: 2px solid var(--line); border-radius: var(--r-l);
}
.cover-preview-empty {
  width: 120px; height: 90px; flex-shrink: 0;
  border: 2px dashed var(--line); border-radius: var(--r-l);
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); text-align: center; padding: 8px;
}
.cover-preview-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cover-preview-info .form-hint { margin: 0; }
.cover-manage-link {
  color: var(--hq); text-decoration: none;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; transition: opacity 0.2s;
}
.cover-manage-link:hover { opacity: 0.75; text-decoration: underline; }
.platform-select { width: 130px; flex-shrink: 0; }
.tag-editor { width: 100%; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.tag-input { max-width: 300px; }
.slot-config { width: 100%; }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 130px; }
.slot-unit { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.switch-grid { display: flex; flex-direction: column; gap: 10px; }
.switch-row { display: flex; align-items: center; gap: 10px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); }
</style>
