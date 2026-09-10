// ===== ESM 构建产物修复：补齐相对导入的 .js 扩展名 =====
// 源码用 bundler 解析（可省扩展名），但 Node ESM 运行时必须带扩展名。
// dev 用 tsx/vitest 不受影响；生产 `node dist/server.js` 会因 `from "../x"` 无法解析。
// 这里在 tsc 编译后遍历 dist/**/*.js，把相对路径导入补上 `.js`。
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')

/** 该相对 specifier 是否已带可执行扩展名 */
function hasExtension(spec) {
  return /\.[a-zA-Z0-9]+$/.test(spec)
}

function fixFile(file) {
  const src = readFileSync(file, 'utf8')
  // 只处理字符串字面量里的相对导入（from "..." 或 import("...")）
  const out = src.replace(
    /(from\s+|import\s*\()(["'])(\.\.?\/[^"']*?)\2/g,
    (m, pre, q, spec) => {
      if (hasExtension(spec)) return m
      return `${pre}${q}${spec}.js${q}`
    },
  )
  if (out !== src) writeFileSync(file, out)
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (extname(p) === '.js') fixFile(p)
  }
}

walk(dist)
console.log('[fix-esm] dist ESM 相对导入已补齐 .js')
