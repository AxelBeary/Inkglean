import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage.js'

const BASE_KEY = 'huiyue-theme-base'
const ACCENT_KEY = 'huiyue-theme-accent'
const OLD_KEY = 'huiyue-theme' // v0.4~v0.7 旧 key，向后兼容
const ACCENTS = ['1', '2', '3', '4', '5']

// v0.38: 画师后台宣纸/墨黑双主题（REQ-026），与客户端 base/accent 完全独立
const ARTIST_THEME_KEY = 'huiyue-artist-theme'
const ARTIST_ATTR = 'data-artist-theme'

function detectBase() {
  // 迁移旧 key（'dark'/'light' → 新 base 格式）
  // P3-10: 安全读取，存储禁用时按默认值走（防 state 工厂抛错白屏）
  const old = safeGetItem(OLD_KEY)
  if (old === 'dark' || old === 'light') {
    safeSetItem(BASE_KEY, old)
    safeRemoveItem(OLD_KEY)
    return old
  }
  const saved = safeGetItem(BASE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'auto'
}

function detectAccent() {
  const saved = safeGetItem(ACCENT_KEY)
  return ACCENTS.includes(saved) ? saved : '1'
}

function resolveDark(base) {
  if (base === 'dark') return true
  if (base === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(base, accent) {
  document.documentElement.classList.toggle('dark', resolveDark(base))
  document.documentElement.setAttribute('data-accent', accent)
}

/** v0.38: 读取后台主题持久化值（默认宣纸） */
function detectArtistTheme() {
  return safeGetItem(ARTIST_THEME_KEY) === 'ink' ? 'ink' : 'paper'
}

/** v0.38: 把后台主题属性挂到 html（token 作用域开关；客户端路由下不挂） */
function applyArtistTheme(theme) {
  document.documentElement.setAttribute(ARTIST_ATTR, theme)
}

function removeArtistTheme() {
  document.documentElement.removeAttribute(ARTIST_ATTR)
}

export const useThemeStore = defineStore('theme', () => {
  const base = ref(detectBase())
  const accent = ref(detectAccent())

  // 初始化立即应用
  applyTheme(base.value, accent.value)

  // 监听系统主题变化（仅 auto 模式生效）
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => {
    if (base.value === 'auto') applyTheme(base.value, accent.value)
  })

  // 持久化 + 应用
  watch(base, (b) => {
    safeSetItem(BASE_KEY, b)
    applyTheme(b, accent.value)
  })
  watch(accent, (a) => {
    safeSetItem(ACCENT_KEY, a)
    applyTheme(base.value, a)
  })

  const isDark = computed(() => resolveDark(base.value))

  function setBase(b) { base.value = b }
  function setAccent(a) { accent.value = a }

  // 向后兼容：旧 ThemeToggle 调用 toggle()
  function toggle() {
    base.value = isDark.value ? 'light' : 'dark'
  }

  // ─── v0.38: 画师后台宣纸/墨黑双主题（REQ-026 §1.2） ───
  // 与客户端 base/accent 互不干扰：客户端用 html.dark + data-accent，
  // 后台用 html[data-artist-theme]（仅在后台骨架挂载期间存在，客户端零影响）。
  const artistTheme = ref(detectArtistTheme())

  watch(artistTheme, (t) => {
    safeSetItem(ARTIST_THEME_KEY, t)
    // 只有作用域激活期间才同步 DOM（离开后台后切换不残留属性）
    if (document.documentElement.hasAttribute(ARTIST_ATTR)) applyArtistTheme(t)
  })

  const isArtistInk = computed(() => artistTheme.value === 'ink')

  /** 宣纸 ↔ 墨黑 切换 */
  function toggleArtistTheme() {
    artistTheme.value = artistTheme.value === 'ink' ? 'paper' : 'ink'
  }

  /** 进入后台作用域（ArtistLayout 挂载时调用）：恢复持久化的主题属性 */
  function enterArtistScope() {
    applyArtistTheme(artistTheme.value)
  }

  /** 离开后台作用域（ArtistLayout 卸载时调用）：摘除属性，客户端拿不到后台 token */
  function leaveArtistScope() {
    removeArtistTheme()
  }

  return {
    base, accent, isDark, setBase, setAccent, toggle,
    artistTheme, isArtistInk, toggleArtistTheme, enterArtistScope, leaveArtistScope
  }
})
