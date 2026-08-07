import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.js'   // 默认 locale 同步（保首屏翻译）；en 懒加载

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
  messages: { 'zh-CN': zhCN }   // en 不预载
})

// 懒加载 en（切英文时才 import；失败回落 zh-CN）
let enPromise = null
function ensureEn() {
  if (!enPromise) {
    enPromise = import('../locales/en.js')
      .then(m => {
        i18n.global.setLocaleMessage('en', m.default)
        return m.default
      })
      .catch(() => null)
  }
  return enPromise
}

// async：切 'en' 时先确保消息载入再切 locale，调用点无需 await 也无竞态
export async function setLocale(locale) {
  if (locale === 'en') await ensureEn()
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en'
}

// 英文用户首访：预载 en（不阻塞首屏，先中文回退再切英文）
if (i18n.global.locale.value === 'en') ensureEn()

export default i18n
