<template>
  <!-- v127④：标题补全站口径样式（文楷 28/700，与作品管理/账号安全一致） -->
  <h2 class="font-display settings-page-title">{{ $t('settings.title') }}</h2>

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
        :guestbook-enabled="form.guestbookEnabled"
        :avatar="form.avatar"
        :loading="loading"
        :saving="saving"
        :profile-load-failed="profileLoadFailed"
        @save="save"
        @update:name="form.name = $event"
        @update:artist-code="form.artistCode = $event"
        @update:bio="form.bio = $event"
        @update:contact-qq="form.contactQq = $event"
        @update:guestbook-enabled="form.guestbookEnabled = $event"
        @avatar-pick="handleAvatarSelect"
      />
    </el-tab-pane>

    <!-- REQ-016 A: 主页展示 -->
    <el-tab-pane :label="$t('settings.tabShowcase')" name="showcase" lazy>
      <SettingsShowcaseTab
        :form="showcaseForm"
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

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, markRaw } from 'vue'
import type { ArtistStatus, ArtworkWithTags, PlatformDTO, PublicArtistDTO, SensitiveWarning } from '../../api/types.js'
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
import { MAX_IMAGE_BYTES } from '../../constants/upload.js'

const { t } = useI18n()
const route = useRoute()
const VALID_TABS = ['profile', 'showcase', 'template']
const TAB_ALIASES: Record<string, string> = { rules: 'showcase' }
const rawTab = typeof route.query.tab === 'string' ? route.query.tab : ''
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
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    rulesSaving.value = false
  }
}

watch(activeTab, (tab) => { if (tab === 'showcase') loadRules() }, { immediate: true })

// Platforms
const platforms = ref<PlatformDTO[]>([])

/** 表单自定义链接行（__k = 排序/复用键） */
interface CustomLinkRow {
  url: string
  platformId: number | null
  __k?: number
}

function detectLinkPlatform(link: CustomLinkRow) {
  const raw = String(link.url || '').trim()
  if (!raw) { link.platformId = null; return }
  const res = validateLink(raw, platforms.value)
  link.platformId = res.ok ? (res.platformId ?? null) : null
}

const form = reactive({
  name: '', bio: '',
  status: 'open',
  customLinks: [] as CustomLinkRow[],
  inspirationTags: [] as string[],
  contactQq: '',
  // 820-L：留言功能画师手动开关（与「新消息通知」同类的账号设置项，默认开启）
  guestbookEnabled: true,
  artistCode: '',
  templateId: 'classic',
  paletteId: 'paper',
  accentColor: null as string | null,
  avatar: '',
  subdomain: '',
  announcement: '',
  announcementExpiresAt: null as string | null
})


// 战役波 S 留账清收：accent 五色单一来源 = theme.css 的 --accent-1..5，运行时读 hex（不再硬编码副本；DB 需存 hex 值故取计算值）
const ACCENT_PRESETS = (() => {
  const style = getComputedStyle(document.documentElement)
  const names = ['teal', 'turquoise', 'blue', 'indigo', 'violet']
  return names.map((n, i) => ({
    color: style.getPropertyValue(`--accent-${i + 1}`).trim(),
    nameKey: `pref.accentNames.${n}`
  }))
})()



async function handleAvatarSelect(file: File | null) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('settings.avatarNotImage'))
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    ElMessage.error(t('settings.avatarTooBig'))
    return
  }
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.updateProfile({ avatar: uploaded.filePath })
    form.avatar = uploaded.filePath
    ElMessage.success(t('settings.avatarUpdated'))
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
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

const coverArtworks = ref<ArtworkWithTags[]>([])
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
/** 主页展示 Tab 表单投影（子组件 ShowcaseForm 私有类型 status 收 ArtistStatus；经 unknown 中转断言，运行时引用不变） */
const showcaseForm = computed(() => form as unknown as {
  status: ArtistStatus
  announcement: string
  announcementExpiresAt: string | null
  customLinks: CustomLinkRow[]
  inspirationTags: string[]
})

function removeLink(index: string | number) {
  form.customLinks.splice(Number(index), 1)
}
function moveLink(index: string | number, direction: number) {
  const target = Number(index) + direction
  if (target < 0 || target >= form.customLinks.length) return
  const [item] = form.customLinks.splice(Number(index), 1)
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
function removeTag(index: string | number) {
  form.inspirationTags.splice(Number(index), 1)
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
      const links: Array<{ url: string }> = []
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
      }) as PublicArtistDTO & { warning?: SensitiveWarning }
      // REQ-042: 主页公告命中敏感词 → 提示（不硬拦，先发后审）
      if (res?.warning?.sensitiveWords?.length) {
        ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
      }
    } else {
      await artistApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        artistCode: form.artistCode.trim(),
        contactQq: form.contactQq.trim(),
        guestbookEnabled: form.guestbookEnabled
      })
    }
    ElMessage.success(t('settings.saved'))
    // 围剿 a1-10: showcase 保存只落 profile 字段——rulesContent 未随本次保存入库，
    // 不得把未保存的规则计入基线（否则规则脏标记被误清）；规则自身保存仍走 saveRules 全量基线
    markTabSaved(activeTab.value as SettingsTab, activeTab.value !== 'showcase')
    trackEvent('artist_action', { action: 'settings_save', tab: activeTab.value })
  } catch (err) { ElMessage.error((err instanceof Error ? err.message : '') || String(err)) }
  finally { saving.value = false }
}

const TAB_BASELINE_FIELDS = {
  profile: ['name', 'bio', 'artistCode', 'contactQq', 'guestbookEnabled'],
  template: ['templateId', 'paletteId', 'accentColor']
}
type SettingsTab = 'profile' | 'showcase' | 'template'
const tabBaseline: Record<SettingsTab, string | null> = { profile: null, showcase: null, template: null }

function snapshotTab(tab: SettingsTab, includeRules = true): string {
  if (tab === 'showcase') {
    return JSON.stringify({
      status: form.status,
      links: form.customLinks.map(l => l.url || ''),
      tags: [...form.inspirationTags],
      announcement: form.announcement,
      announcementExpiresAt: form.announcementExpiresAt,
      // 仅规则保存/加载时把 rulesContent 计入基线（见 save() 的 a1-10 注释）
      ...(includeRules ? { rules: rulesContent.value } : {})
    })
  }
  return JSON.stringify(TAB_BASELINE_FIELDS[tab].map(k => form[k as keyof typeof form]))
}
function markTabSaved(tab: SettingsTab, includeRules = true) {
  tabBaseline[tab] = snapshotTab(tab, includeRules)
}
function isTabDirty(tab: SettingsTab) {
  if (tabBaseline[tab] === null) return false
  return snapshotTab(tab) !== tabBaseline[tab]
}
async function beforeTabLeave(_newName: string, oldName: string) {
  if (!isTabDirty(oldName as SettingsTab)) return true
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
    const LEGACY: Record<string, string> = { 'default': 'classic', 'dark-gallery': 'gallery', 'single-page': 'folio' }
    const rawTpl = profile.template_id || 'classic'

    let customLinks: CustomLinkRow[] = []
    if (profile.custom_links) {
      try {
        const parsed: unknown = JSON.parse(profile.custom_links)
        if (Array.isArray(parsed)) {
          customLinks = (parsed as Array<string | { url?: string; platformId?: number | null }>)
            .map(item => typeof item === 'string' ? { url: item, platformId: null } : { url: item.url || '', platformId: item.platformId ?? null })
            .filter((item): item is CustomLinkRow => Boolean(item.url))
            .map(l => ({ ...l, __k: linkKey++ }))
        }
      } catch { customLinks = [] }
    }

    let inspirationTags: string[] = []
    if (profile.inspiration_tags) {
      try {
        const parsed: unknown = JSON.parse(profile.inspiration_tags)
        if (Array.isArray(parsed)) inspirationTags = parsed.filter((tag): tag is string => typeof tag === 'string' && tag !== '')
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
      guestbookEnabled: profile.guestbook_enabled !== 0,
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
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
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
/* v127④：页题口径与作品管理/账号安全拉齐（文楷 28/700） */
.settings-page-title {
  font-size: calc(var(--font-scale, 1) * 28px);
  font-weight: 700;
  color: var(--ink);
  letter-spacing: .02em;
}
</style>
