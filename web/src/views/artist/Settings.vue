<template>
  <ArtistLayout>
    <h2 class="font-display">{{ $t('settings.title') }}</h2>

    <!-- BUG-7 修复：profile 加载失败横幅——此时表单是默认值，禁止保存防止覆盖真实配置 -->
    <el-alert
      v-if="profileLoadFailed"
      type="error" :closable="false" show-icon
      style="margin-top: 16px"
      :title="$t('settings.loadFailedTitle')"
    >
      <div>{{ $t('settings.loadFailedDesc') }}</div>
      <el-button size="small" type="primary" style="margin-top: 8px" @click="loadProfile">{{ $t('settings.retry') }}</el-button>
    </el-alert>

    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <!-- 基本资料 -->
      <el-tab-pane :label="$t('settings.tabProfile')" name="profile">
        <el-card style="max-width: 600px" v-loading="loading">
          <el-form :model="form" label-position="top" size="large">
            <!-- R48: 头像上传（即时保存，不等 Save 按钮） -->
            <el-form-item :label="$t('settings.avatarLabel')">
              <div class="avatar-upload" @click="triggerAvatarUpload">
                <el-avatar :size="72" :src="avatarPreviewUrl" class="avatar-preview">
                  {{ form.name?.charAt(0) || '?' }}
                </el-avatar>
                <span class="avatar-upload-hint">{{ $t('settings.avatarHint') }}</span>
              </div>
              <input ref="avatarInputEl" type="file" accept="image/*" hidden @change="handleAvatarSelect" />
            </el-form-item>
            <el-form-item :label="$t('settings.nameLabel')">
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item :label="$t('settings.codeLabel')">
              <el-input v-model="form.artistCode" :placeholder="$t('settings.codePlaceholder')" maxlength="10" />
              <div class="form-hint">{{ $t('settings.codeHint') }}</div>
            </el-form-item>
            <el-form-item :label="$t('settings.bioLabel')">
              <el-input v-model="form.bio" type="textarea" :rows="3" :placeholder="$t('settings.bioPlaceholder')" />
            </el-form-item>
            <el-form-item :label="$t('settings.contactQqLabel')">
              <el-input v-model="form.contactQq" :placeholder="$t('settings.contactQqPlaceholder')" maxlength="15" />
              <div class="form-hint">{{ $t('settings.contactQqHint') }}</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- REQ-016 A: 主页展示（客户看到什么：公告/外链/平台链接/灵感标签/须知） -->
      <el-tab-pane :label="$t('settings.tabShowcase')" name="showcase" lazy>
        <el-card style="max-width: 700px" v-loading="loading">
          <el-form :model="form" label-position="top" size="large">
            <!-- F3: 主页公告（客户主页首屏展示，可选过期时间） -->
            <el-form-item :label="$t('settings.announcementLabel')">
              <el-input
                v-model="form.announcement" type="textarea" :rows="3"
                :placeholder="$t('settings.announcementPlaceholder')"
                maxlength="500" show-word-limit
              />
              <div class="form-hint">{{ $t('settings.announcementHint') }}</div>
              <el-date-picker
                v-model="form.announcementExpiresAt"
                type="date"
                value-format="YYYY-MM-DD"
                :placeholder="$t('settings.announcementExpiresLabel')"
                :disabled-date="(d) => d < new Date()"
                :shortcuts="announcementShortcuts"
                clearable
                style="margin-top: 8px; width: 220px"
              />
              <div class="form-hint">{{ $t('settings.announcementExpiresHint') }}</div>
            </el-form-item>

            <!-- REQ-022 F2: 链接编辑器（外链/平台链接合一，粘贴自动识别平台） -->
            <el-form-item :label="$t('settings.linksLabel')">
              <div class="link-editor">
                <div v-for="(link, index) in form.customLinks" :key="link.__k ?? index" class="link-row">
                  <el-select
                    v-model="link.platformId"
                    class="link-platform-select"
                    disabled
                    :placeholder="$t('settings.linkOther')"
                  >
                    <el-option :value="null" :label="$t('settings.linkOther')" />
                    <el-option v-for="p in platforms" :key="p.id" :value="p.id" :label="p.name" />
                  </el-select>
                  <el-input
                    v-model="link.url"
                    :placeholder="$t('settings.linkUrlPlaceholder')"
                    class="link-url-input"
                    @input="detectLinkPlatform(link)"
                  />
                  <div class="link-actions">
                    <el-button text size="small" :disabled="index === 0" @click="moveLink(index, -1)">↑</el-button>
                    <el-button text size="small" :disabled="index === form.customLinks.length - 1" @click="moveLink(index, 1)">↓</el-button>
                    <el-button text size="small" type="danger" @click="removeLink(index)">✕</el-button>
                  </div>
                </div>
                <p v-if="!form.customLinks.length" class="link-empty">{{ $t('settings.linksEmpty') }}</p>
                <el-button size="small" @click="addLink" :disabled="form.customLinks.length >= MAX_LINKS">
                  + {{ $t('settings.addLink') }}
                </el-button>
                <div class="form-hint">{{ $t('settings.linksHint') }}</div>
              </div>
            </el-form-item>

            <!-- R58-8: 灵感标签（客户下单页展示，点击注入描述框） -->
            <el-form-item :label="$t('settings.inspireLabel')">
              <div class="tag-editor">
                <div class="tag-list">
                  <el-tag
                    v-for="(tag, index) in form.inspirationTags"
                    :key="tag + index"
                    closable
                    @close="removeTag(index)"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
                <el-input
                  v-model="newTag"
                  class="tag-input"
                  :placeholder="$t('settings.inspireInputPlaceholder')"
                  maxlength="30"
                  show-word-limit
                  @keyup.enter="addTag"
                />
                <div class="form-hint">{{ $t('settings.inspireHint') }}</div>
              </div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="save" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- R42b: 须知编辑（并入主页展示，独立卡片 + 独立保存） -->
        <el-card style="max-width: 700px; margin-top: 16px" v-loading="rulesLoading">
          <template #header><span>{{ $t('settings.tabRules') }}</span></template>
          <!-- BUG-7 修复：须知加载失败错误态——禁止保存防止空内容覆盖真实须知 -->
          <div v-if="rulesLoadFailed" class="rules-load-failed">
            <el-alert type="error" :closable="false" show-icon :title="$t('settings.rulesLoadFailed')" />
            <el-button size="small" type="primary" style="margin-top: 8px" @click="loadRules">{{ $t('settings.retry') }}</el-button>
          </div>
          <template v-else>
            <p class="form-hint" style="margin-bottom: 16px">{{ $t('rules.hint') }}</p>
            <el-input
              v-model="rulesContent" type="textarea" :rows="16"
              :placeholder="$t('rules.placeholder')"
            />
            <div class="preview" v-if="rulesContent">
              <h4 class="preview-section-title">{{ $t('rules.preview') }}</h4>
              <el-card shadow="never" class="preview-card">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div v-html="sanitizedRulesPreview"></div>
              </el-card>
            </div>
            <el-button type="primary" style="margin-top: 16px" @click="saveRules" :loading="rulesSaving" :disabled="rulesLoadFailed || !rulesLoaded">
              {{ $t('rules.save') }}
            </el-button>
          </template>
        </el-card>
      </el-tab-pane>

      <!-- 模板与风格 -->
      <el-tab-pane :label="$t('settings.tabTemplate')" name="template" lazy>
        <el-card style="max-width: 700px" v-loading="loading">
          <p class="form-hint" style="margin-bottom: 20px">{{ $t('templates.hint') }}</p>
          <p class="template-label">{{ $t('templates.label') }}</p>
          <div class="template-grid">
            <div
              v-for="tpl in templates"
              :key="tpl.id"
              class="template-card"
              :class="{ active: form.templateId === tpl.id }"
              @click="form.templateId = tpl.id"
              tabindex="0"
              role="button"
              @keyup.enter="form.templateId = tpl.id"
            >
              <div class="template-preview">
                <el-icon v-for="(icon, idx) in tpl.preview" :key="idx" class="template-preview-icon"><component :is="icon" /></el-icon>
              </div>
              <div class="template-info">
                <div class="template-name">{{ tpl.name }}</div>
                <div class="template-desc">{{ tpl.desc }}</div>
              </div>
            </div>
          </div>

          <p class="template-label" style="margin-top: 24px">{{ $t('templates.palette') }}</p>
          <p class="form-hint" style="margin-bottom: 12px">{{ $t('templates.paletteHint') }}</p>
          <div class="palette-grid">
            <div
              v-for="pal in palettes"
              :key="pal.id"
              class="palette-card"
              :class="{ active: form.paletteId === pal.id }"
              @click="form.paletteId = pal.id"
              tabindex="0"
              role="button"
              @keyup.enter="form.paletteId = pal.id"
            >
              <div class="palette-swatch">
                <span class="swatch-light" :style="{ background: pal.light }"></span>
                <span class="swatch-dark" :style="{ background: pal.dark }"></span>
              </div>
              <div class="template-info">
                <div class="template-name">{{ pal.name }}</div>
                <div class="template-desc">{{ pal.desc }}</div>
              </div>
            </div>
          </div>

          <!-- R49: 强调色选择器（5 色预设 + 清除，后端白名单校验） -->
          <p class="template-label" style="margin-top: 24px">{{ $t('settings.accentLabel') }}</p>
          <p class="form-hint" style="margin-bottom: 12px">{{ $t('settings.accentHint') }}</p>
          <div class="accent-picker">
            <button
              v-for="a in ACCENT_PRESETS" :key="a.color"
              class="accent-swatch-btn" :class="{ active: form.accentColor === a.color }"
              :style="{ background: a.color }"
              :title="$t(a.nameKey)"
              @click="form.accentColor = a.color"
            >
              <span v-if="form.accentColor === a.color" class="swatch-check">✓</span>
            </button>
            <button
              class="accent-clear-btn" :class="{ active: !form.accentColor }"
              @click="form.accentColor = null"
            >
              {{ $t('settings.accentClear') }}
            </button>
          </div>
          <p class="form-hint" style="margin-top: 8px">{{ $t('settings.accentDarkHint') }}</p>

          <!-- REQ-017: 封面预览 + 作品管理链接（不搬作品列表，约束 3） -->
          <p class="template-label" style="margin-top: 24px">{{ $t('settings.coverTitle') }}</p>
          <div class="cover-preview-row" v-loading="coverLoading">
            <el-image
              v-if="coverPreview"
              :src="`/uploads/${coverPreview.image_path}`"
              fit="cover" class="cover-preview-thumb" :alt="coverPreview.title || ''"
            />
            <div v-else class="cover-preview-empty">{{ $t('settings.coverEmpty') }}</div>
            <div class="cover-preview-info">
              <p class="form-hint">{{ $t('settings.coverHint') }}</p>
              <router-link to="/artworks" class="cover-manage-link">{{ $t('settings.coverManageLink') }} →</router-link>
            </div>
          </div>

          <!-- R50: 预览按钮（新窗口打开，参数覆盖渲染层） -->
          <div class="template-actions">
            <el-button @click="openPreview" :disabled="!form.subdomain">{{ $t('settings.previewBtn') }}</el-button>
            <el-button type="primary" @click="save" :loading="saving" :disabled="profileLoadFailed">{{ $t('settings.save') }}</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { artistApi, artistPublicApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { sanitizeHtml } from '../../utils/sanitize.js'
import { validateLink, MAX_LINK_COUNT as MAX_LINKS } from '../../utils/linkValidation.js'
import { trackEvent } from '../../utils/track.js'
// v0.34 任务3：模板卡预览 SVG 图标
import { Notebook, Brush, Picture, Sunny, Collection, Moon, Document, MagicStick } from '@element-plus/icons-vue'
// #44: 偏好已拆出为独立页面（/preferences），此处只保留主页设置

const { t } = useI18n()
const route = useRoute()
// REQ-016 A: 3 Tab（基本资料/主页展示/模板与风格），偏好已拆为独立页面 /preferences
// 旧 tab 名兼容映射：rules→showcase（须知并入主页展示）、commission/prefs→重定向到 /preferences
const VALID_TABS = ['profile', 'showcase', 'template']
const TAB_ALIASES = { rules: 'showcase' }
const rawTab = route.query.tab
// #44: prefs/commission 旧链接重定向到独立偏好页
if (rawTab === 'prefs' || rawTab === 'commission') {
  window.location.replace('/preferences')
}
const activeTab = ref(
  VALID_TABS.includes(rawTab) ? rawTab
    : TAB_ALIASES[rawTab] || 'profile'
)
const loading = ref(true)
const saving = ref(false)

// ─── R42b: 须知编辑（原 RulesEditor.vue 逻辑迁入） ───
const rulesContent = ref('')
const rulesSaving = ref(false)
const rulesLoading = ref(false)
// BUG-7 修复：须知加载失败标记——失败时禁用保存，防止空内容覆盖真实须知
const rulesLoadFailed = ref(false)
// BUG-7 修复：改为 ref 以便模板 :disabled 绑定（未加载成功前禁用保存）
const rulesLoaded = ref(false)

// XSS 防护：预览也消毒
const sanitizedRulesPreview = computed(() => sanitizeHtml(rulesContent.value))

async function loadRules() {
  if (rulesLoaded.value) return
  rulesLoading.value = true
  rulesLoadFailed.value = false
  try {
    const rules = await artistApi.getRules()
    rulesContent.value = rules?.content || ''
    rulesLoaded.value = true
  } catch {
    // BUG-7: 不再静默吞错——标记失败，禁用保存按钮，显示错误态+重试入口
    rulesLoadFailed.value = true
  } finally { rulesLoading.value = false }
}

async function saveRules() {
  // BUG-7 修复：须知未加载成功前禁止保存，防止空内容覆盖真实须知
  if (rulesLoadFailed.value || !rulesLoaded.value) return
  rulesSaving.value = true
  try {
    await artistApi.updateRules(rulesContent.value)
    ElMessage.success(t('rules.saved'))
    trackEvent('artist_action', { action: 'settings_save', tab: 'rules' })
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    rulesSaving.value = false
  }
}

// 首次切到主页展示 tab 时加载须知内容（懒加载，须知并入主页展示）
watch(activeTab, (tab) => { if (tab === 'showcase') loadRules() }, { immediate: true })

// REQ-022 F2: 链接编辑器（外链/平台链接合一）
// 每行: { url, platformId } —— platformId 为识别结果（保存时不提交，后端重推导）
const platforms = ref([])

// 粘贴/输入即时识别：更新行内 platformId（识别不出 → null=其他）
function detectLinkPlatform(link) {
  const raw = String(link.url || '').trim()
  if (!raw) { link.platformId = null; return }
  const res = validateLink(raw, platforms.value)
  link.platformId = res.ok ? (res.platformId ?? null) : null
}

const form = reactive({
  name: '', bio: '',
  customLinks: [],
  inspirationTags: [],
  contactQq: '',
  artistCode: '',
  templateId: 'classic',
  paletteId: 'paper',
  accentColor: null,
  avatar: '',
  // F3: 主页公告（announcement 文本 + 可选过期日期）
  announcement: '',
  announcementExpiresAt: null
})

// ─── REQ-018: 公告过期日快捷预设 ───
const announcementShortcuts = [
  { text: t('settings.shortcut7d'), value: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d } },
  { text: t('settings.shortcut30d'), value: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d } },
  { text: t('settings.shortcutMonthEnd'), value: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0) } }
]

// ─── R49: 强调色预设（5 色与 ThemePicker 一致，后端白名单校验） ───
const ACCENT_PRESETS = [
  { color: '#356B69', nameKey: 'pref.accentNames.teal' },
  { color: '#3F5E80', nameKey: 'pref.accentNames.turquoise' },
  { color: '#5E5494', nameKey: 'pref.accentNames.blue' },
  { color: '#346edb', nameKey: 'pref.accentNames.indigo' },
  { color: '#3445db', nameKey: 'pref.accentNames.violet' }
]

// ─── R48: 头像上传（即时保存，uploadApi.image → PUT profile avatar） ───
const avatarInputEl = ref(null)
const avatarPreviewUrl = computed(() => form.avatar ? `/uploads/${form.avatar}` : undefined)

function triggerAvatarUpload() {
  avatarInputEl.value?.click()
}

async function handleAvatarSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
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

// ─── R50: 预览主页（新窗口，参数覆盖渲染层，不碰数据层） ───
function openPreview() {
  const params = new URLSearchParams({
    _tpl: form.templateId,
    _pal: form.paletteId
  })
  if (form.accentColor) params.set('_accent', form.accentColor)
  window.open(`/artist/${form.subdomain}?${params.toString()}`, '_blank', 'noopener')
}

// ─── REQ-017: 封面预览（星标操作已移至作品管理页，此处只展示当前封面 + 跳转链接） ───
const coverArtworks = ref([])
const coverLoading = ref(false)
let coverLoaded = false

/** 当前封面（第一张 is_cover=1 的作品），无封面时为 null */
const coverPreview = computed(() => coverArtworks.value.find(a => a.is_cover) || null)

async function loadCoverArtworks() {
  if (coverLoaded) return
  coverLoading.value = true
  try {
    const list = await artistApi.getArtworks()
    coverArtworks.value = Array.isArray(list) ? list : []
    coverLoaded = true
  } catch { /* 加载失败静默，区域显示空态 */ } finally { coverLoading.value = false }
}

// 切到模板 tab 时加载封面预览数据（懒加载，与须知 tab 同模式）
watch(activeTab, (tab) => { if (tab === 'template') loadCoverArtworks() }, { immediate: true })

// REQ-022 F2: 链接编辑器操作（上限 8，保存只传 [{url}]）
// 稳定 key（__k 自增）：↑↓ 变序/删除后 v-for index 会漂移，输入状态必须跟对象走（保存不提交 __k）
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

// ─── R58-8: 灵感标签操作 ───
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

// v0.34 任务3：模板卡预览 emoji 改 SVG（markRaw 防组件对象被 reactive 代理）
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
  // BUG-7 修复：profile 未加载成功时表单仍是默认值，禁止保存防止默认值覆盖真实配置
  if (profileLoadFailed.value) {
    ElMessage.warning(t('settings.loadFailedHint'))
    return
  }
  saving.value = true
  try {
    // REQ-016 A: 按当前 tab 拆分提交（后端 PUT /api/artist/profile 为部分更新语义）
    if (activeTab.value === 'template') {
      await artistApi.updateProfile({ templateId: form.templateId, paletteId: form.paletteId, accentColor: form.accentColor })
    } else if (activeTab.value === 'showcase') {
      // 主页展示：公告/链接/灵感标签（须知走独立 saveRules）
      // REQ-022 F2: 保存前逐行前端校验（后端子集：补 https/协议/长度），只传 [{url}]
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
      await artistApi.updateProfile({
        customLinks: links,
        inspirationTags: form.inspirationTags.map(tag => tag.trim()).filter(Boolean),
        // F3: 公告（空文本 → null 清除；过期日期空 → null 长期显示）
        announcement: form.announcement.trim() || null,
        announcementExpiresAt: form.announcementExpiresAt || null
      })
    } else {
      // 基本资料：头像/昵称/编码/简介/联系QQ（头像走即时上传）
      await artistApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        artistCode: form.artistCode.trim(),
        contactQq: form.contactQq.trim()
      })
    }
    ElMessage.success(t('settings.saved'))
    trackEvent('artist_action', { action: 'settings_save', tab: activeTab.value })
  } catch (err) { ElMessage.error(err.message) }
  finally { saving.value = false }
}

// BUG-7 修复：profile 加载失败标记——失败时表单仍是默认值，必须禁用保存防止默认值覆盖真实配置
const profileLoadFailed = ref(false)

async function loadProfile() {
  loading.value = true
  profileLoadFailed.value = false
  try {
    const profile = await artistApi.getProfile()
    // 旧模板 ID 映射到新布局 ID，确保选择器正确高亮
    const LEGACY = { 'default': 'classic', 'dark-gallery': 'gallery', 'single-page': 'folio' }
    const rawTpl = profile.template_id || 'classic'

    // REQ-022 F2: 解析 custom_links JSON（新结构 [{platformId, url}]）
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

    Object.assign(form, {
      name: profile.name,
      bio: profile.bio || '',
      customLinks,
      inspirationTags,
      contactQq: profile.contact_qq || '',
      artistCode: profile.artist_code || '',
      templateId: LEGACY[rawTpl] || rawTpl,
      paletteId: profile.palette_id || 'paper',
      accentColor: profile.accent_color || null,
      avatar: profile.avatar || '',
      subdomain: profile.subdomain || '',
      // F3: 公告回显（announcement_expires_at 为 DATETIME 字符串，取日期部分）
      announcement: profile.announcement || '',
      announcementExpiresAt: profile.announcement_expires_at ? String(profile.announcement_expires_at).slice(0, 10) : null
    })
  } catch (err) {
    ElMessage.error(err.message)
    // BUG-7: 标记失败——此时 form 仍是默认值，保存会覆盖真实配置
    profileLoadFailed.value = true
  }
  finally { loading.value = false }
}

// 加载平台列表（识别/展示用；失败静默——链接仍可保存，识别走「其他」）
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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
.form-hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 12px); margin-top: 4px; }

/* R42b: 须知预览（原 RulesEditor.vue 样式迁入） */
.preview-section-title { margin: 16px 0 8px; color: var(--ink2); }
.preview-card { line-height: 1.8; color: var(--ink); }

/* REQ-022 F2: 链接编辑器 */
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

/* ─── R48: 头像上传 ─── */
.avatar-upload {
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; user-select: none;
}
.avatar-preview { transition: transform 0.15s, box-shadow 0.15s; }
.avatar-upload:hover .avatar-preview { transform: scale(1.05); box-shadow: 0 0 0 3px color-mix(in srgb, var(--hq) 50%, transparent); }
.avatar-upload-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }

/* ─── R49: 强调色选择器 ─── */
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

/* ─── R50: 模板 tab 操作行 ─── */
.template-actions { display: flex; gap: 12px; margin-top: 20px; }

/* ─── REQ-017: 封面预览 + 作品管理链接 ─── */
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

/* ─── R58-8: 平台链接 + 灵感标签 ─── */
.platform-select { width: 130px; flex-shrink: 0; }
.tag-editor { width: 100%; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.tag-input { max-width: 300px; }

/* ─── SPEC-004: 名额与缓冲 ─── */
.slot-config { width: 100%; }
.slot-row { display: flex; align-items: center; gap: 12px; }
.slot-input { width: 130px; }
.slot-unit { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.switch-grid { display: flex; flex-direction: column; gap: 10px; }
.switch-row { display: flex; align-items: center; gap: 10px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); }
</style>
