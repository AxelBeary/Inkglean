import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/fonts/wencai/font.css'
import './assets/fonts/noto/font.css'
import './styles/palettes.css'
import './styles/templates.css'
import App from './App.vue'
import router from './router/index.js'
import i18n from './i18n/index.js'

const app = createApp(App)

// S-10: 全局错误边界 — 防止组件抛错导致整页白屏
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info)
  // 用户可见的友好提示（避免重复弹窗：5秒内只弹一次）
  import('element-plus').then(({ ElMessage }) => {
    ElMessage.error('页面出了点小问题，请刷新重试')
  })
}

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(ElementPlus)

app.mount('#app')
