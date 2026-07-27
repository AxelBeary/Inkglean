import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'

const BASE_KEY = 'huiyue-theme-base'
const ACCENT_KEY = 'huiyue-theme-accent'
const OLD_KEY = 'huiyue-theme' // v0.4~v0.7 旧 key，向后兼容

const ACCENTS = ['1', '2', '3', '4', '5']

function detectBase() {
  // 迁移旧 key（'dark'/'light' → 新 base 格式）
  const old = localStorage.getItem(OLD_KEY)
  if (old === 'dark' || old === 'light') {
    localStorage.setItem(BASE_KEY, old)
    localStorage.removeItem(OLD_KEY)
    return old
  }
  const saved = localStorage.getItem(BASE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'auto'
}

function detectAccent() {
  const saved = localStorage.getItem(ACCENT_KEY)
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
    localStorage.setItem(BASE_KEY, b)
    applyTheme(b, accent.value)
  })
  watch(accent, (a) => {
    localStorage.setItem(ACCENT_KEY, a)
    applyTheme(base.value, a)
  })

  const isDark = computed(() => resolveDark(base.value))

  function setBase(b) { base.value = b }
  function setAccent(a) { accent.value = a }

  // 向后兼容：旧 ThemeToggle 调用 toggle()
  function toggle() {
    base.value = isDark.value ? 'light' : 'dark'
  }

  return { base, accent, isDark, setBase, setAccent, toggle }
})
