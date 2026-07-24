import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 开发时代理 API 请求到后端
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 上传文件的静态访问
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    // 构建产物由后端静态服务
    emptyOutDir: true
  }
})
