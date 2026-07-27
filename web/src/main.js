import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/fonts/wencai/font.css'
import App from './App.vue'
import router from './router/index.js'
import i18n from './i18n/index.js'

const app = createApp(App)

// S-10: 全局错误边界 — 防止组件抛错导致整页白屏
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info)
}

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(ElementPlus)

app.mount('#app')
