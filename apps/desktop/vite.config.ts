import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Desktop (Tauri) build config.
// - Reuses the web UI directly from ../frontend (cross-package relative imports).
// - No browser APIs are needed by the UI, so no special shims.
// - port 5174 to avoid colliding with the web dev server (5173).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: './',
  // 桌面壳走自定义协议（无 Vite 服务器），相对 /api 接不到后端；
  // 构建期把 API base 指向本地后端（仅本机，数据不出本机）。
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('http://127.0.0.1:4000'),
  },
  server: {
    port: 5174,
    strictPort: true,
    // Allow Vite to serve files outside this package root (../frontend/src).
    fs: { allow: ['..'] },
  },
})
