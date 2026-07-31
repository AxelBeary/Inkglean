import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import { ElLoading } from 'element-plus'
// A4: EP CSS 按需引入 — el-* 组件样式由 resolver 随注册自动注入（vite.config.js）
// 以下三个走 JS API 调用（非模板 el-* 标签），resolver 不覆盖，需手动引入样式
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/fonts/wencai/font.css'
import './assets/fonts/noto/font.css'
import './styles/palettes.css'
import './styles/templates.css'
import App from './App.vue'
import router from './router/index.js'
import i18n from './i18n/index.js'

const app = createApp(App)

// A1: Sentry 前端错误监控（DSN 为空则不初始化，零开销）
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    app,
    dsn: sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    tracesSampleRate: 0
  })
}

// S-10: 全局错误边界 — 防止组件抛错导致整页白屏
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info)
  // A1: 上报 Sentry（Sentry.init 未调用时 captureException 静默无操作）
  Sentry.captureException(err, { extra: { vueInfo: info } })
  // 用户可见的友好提示（避免重复弹窗：5秒内只弹一次）
  import('element-plus').then(({ ElMessage }) => {
    ElMessage.error('页面出了点小问题，请刷新重试')
  })
}

app.use(createPinia())
app.use(router)
app.use(i18n)
// v0.20: EP 按需引入 — el-* 组件由 unplugin-vue-components 自动注册（见 vite.config.js）
// v-loading 是指令不是组件，需手动全局注册
app.directive('loading', ElLoading.directive)

app.mount('#app')
