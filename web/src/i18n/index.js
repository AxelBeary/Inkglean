import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.js'
import en from '../locales/en.js'

const STORAGE_KEY = 'huiyue-locale'

function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return saved
  const nav = navigator.language.toLowerCase()
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en }
})

export function setLocale(locale) {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en'
}

export default i18n
