// ===== 内置浏览器渲染工具（M49 browser.render） =====
// web.read（M43）只做「剥 HTML 取正文」，无法执行 JS——SPA / 客户端渲染页拿不到真实内容。
// browser.render 用无头 Chromium（playwright-core warapped）真渲染后再抽正文，补上这一环。
// 本地优先：复用本机 ms-playwright 缓存里的 Chromium，不自动联网下浏览器（找不到就给安装提示）。

import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";

export interface BrowserRenderResult {
  url: string;
  title: string;
  /** 渲染后抽出的正文（合并空白、去脚本/样式/标签） */
  text: string;
  length: number;
  error?: string;
}

const CANDIDATE_BUILDS = ["1234", "1223", "1187", "1169"];

/** 在本机 ms-playwright 缓存里找可用的 Chromium 可执行文件（不联网下载） */
export function findChromeExecutable(): string | null {
  const base = `${process.env.LOCALAPPDATA ?? `${homedir()}\\AppData\\Local`}\\ms-playwright`;
  const isWin = platform() === "win32";
  for (const build of CANDIDATE_BUILDS) {
    const candidates = isWin
      ? [
          `${base}\\chromium_headless_shell-${build}\\chrome-headless-shell-win64\\chrome-headless-shell.exe`,
          `${base}\\chromium-${build}\\chrome-win64\\chrome.exe`,
        ]
      : [
          `${base}/chromium_headless_shell-${build}/chrome-headless-shell-linux64/chrome-headless-shell`,
          `${base}/chromium-${build}/chrome-linux/chrome`,
        ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  return null;
}

const MAX_TEXT = 12000; // 渲染正文截断，防止撑爆上下文

/** 渲染一个 URL 并抽取正文；失败返回 error（不抛），便于编排降级。 */
export async function renderPage(
  url: string,
  opts: { maxLength?: number; jsTimeout?: number } = {},
): Promise<BrowserRenderResult> {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return { url: u, title: "", text: "", length: 0, error: "仅支持 http/https 协议" };

  let browser: Browser | null = null;
  try {
    const exe = process.env.ARK_CHROME_PATH ?? findChromeExecutable() ?? "";
    browser = await chromium.launch({
      headless: true,
      ...(exe ? { executablePath: exe } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.goto(u, { waitUntil: "domcontentloaded", timeout: opts.jsTimeout ?? 15000 }).catch(() => {});
    // 等一小段让客户端 JS 跑起来（SPA 填充内容）
    await page.waitForTimeout(opts.jsTimeout ?? 2500);
    // 用 playwright 自带 API 读正文，避免在 Node 编译期引用 document/HTMLElement（后端 tsconfig 无 DOM lib）
    const main = page.locator("article, main, [role='main']");
    let text = "";
    if (await main.count()) {
      try { text = (await main.first().innerText()) || ""; } catch { text = ""; }
    }
    if (!text.trim()) {
      try { text = (await page.locator("body").innerText()) || ""; } catch { text = ""; }
    }
    const title = (await page.title().catch(() => "")).split(" - ")[0] ?? "";
    const max = opts.maxLength ?? MAX_TEXT;
    const body = text.replace(/\n{3,}/g, "\n\n").trim();
    return { url: u, title, text: body.slice(0, max), length: Math.min(body.length, max) };
  } catch (e) {
    return {
      url: u,
      title: "",
      text: "",
      length: 0,
      error:
        e instanceof Error && /executable|launch/i.test(e.message)
          ? "未找到本地 Chromium，请先执行 `npx playwright install chromium` 或设 ARK_CHROME_PATH"
          : e instanceof Error ? e.message : "浏览器渲染失败",
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
