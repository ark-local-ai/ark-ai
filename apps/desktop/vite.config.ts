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
  server: {
    port: 5174,
    strictPort: true,
    // Allow Vite to serve files outside this package root (../frontend/src).
    fs: { allow: ['..'] },
  },
})
