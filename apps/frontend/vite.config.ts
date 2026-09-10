import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 后端仅监听本机 127.0.0.1:4000（数据不出本机）。
// dir 统一「dev 代理」与「preview 代理」，保证生产构建产物也能连上后端。
const API_TARGET = 'http://127.0.0.1:4000'
const proxy = {
  '/api': {
    target: API_TARGET,
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 开发时把 /api 代理到本地后端（仅本机，数据不出本机）
    proxy,
  },
  preview: {
    // 生产构建后 `vite preview` 同样代理 /api，直接当可用本地服务跑
    proxy,
  },
})
