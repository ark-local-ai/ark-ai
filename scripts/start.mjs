// ===== Ark · 方舟 一键本地启动器 =====
// 启动后端 + 用 vite preview（带 /api 代理）托管构建好的前端，然后打开浏览器。
// 仅本机、数据不出本机。退出（Ctrl+C）时一并收尾两个子进程。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_DIST = path.join(root, 'apps/backend/dist/server.js')
const FRONTEND_DIST = path.join(root, 'apps/frontend/dist')

const BACKEND_PORT = '4000'
const NEW_PORT = '4173'
const URL = `http://127.0.0.1:${NEW_PORT}/app`

// 未构建先提示，避免吐出「白屏但无报错」的假可用。
for (const [label, p] of [['后端', BACKEND_DIST], ['前端', FRONTEND_DIST]]) {
  if (!existsSync(p)) {
    console.error(`[启动] 缺少${label}构建产物（${p}）。请先执行: npm run build`)
    process.exit(1)
  }
}

// 后端监听 127.0.0.1:4000
const backend = spawn('node', [BACKEND_DIST], {
  cwd: path.join(root, 'apps/backend'),
  env: { ...process.env, PORT: BACKEND_PORT },
  stdio: ['ignore', 'inherit', 'inherit'],
})

// vite preview 托管 dist 并代理 /api → 后端
// 直接以 node 调 vite 的 CLI JS（Windows 下 spawn "npx" 找不到 .cmd shim）
const VITE_CLI = path.join(root, 'apps/frontend/node_modules/vite/bin/vite.js')
const preview = spawn('node', [VITE_CLI, 'preview', '--host', '127.0.0.1', '--port', NEW_PORT, '--strictPort'], {
  cwd: path.join(root, 'apps/frontend'),
  stdio: ['ignore', 'inherit', 'inherit'],
})

let opened = false
function tryOpen() {
  // 两个进程都起来了、且能看到 4000 时再开浏览器，避免抢跑
  if (opened) return
  fetch(`http://127.0.0.1:${BACKEND_PORT}/health`, { signal: AbortSignal.timeout(1500) })
    .then((r) => (r.ok ? (opened = true, openBrowser(), true) : false))
    .catch(() => false)
    .then((ok) => { if (!ok && !opened) setTimeout(tryOpen, 500) })
}

function openBrowser() {
  console.log(`\n[Ark] 已就绪，正在打开 ${URL}\n按 Ctrl+C 退出（会一并停止本地服务）`)
  const win = process.platform === 'win32'
  const mac = process.platform === 'darwin'
  const cmd = win ? 'cmd' : mac ? 'open' : 'xdg-open'
  const args = win ? ['/c', 'start', '', URL] : [URL]
  const sub = spawn(cmd, args, { stdio: 'ignore', detached: true })
  sub.unref()
}

function shutdown() {
  console.log('\n[Ark] 正在停止本地服务…')
  for (const p of [preview, backend]) {
    if (p && !p.killed) p.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
preview.on('exit', (code) => { if (code) shutdown() })
backend.on('exit', (code) => { if (code) shutdown() })

console.log(`[Ark] 后端 http://127.0.0.1:${BACKEND_PORT}  前端预览 http://127.0.0.1:${NEW_PORT}`)
tryOpen()
