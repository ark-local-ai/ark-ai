import { afterEach, describe, expect, it, vi } from "vitest";
import { findChromeExecutable } from "./browser";

// 注意：renderPage 依赖真实无头 Chromium，单测里不真启动浏览器。
// 这里只测纯逻辑：executable 探测（依赖本机缓存，可能为 null 也不断言失败）与协议守卫。

describe("内置浏览器渲染工具（M49 browser.render）", () => {
  it("findChromeExecutable 返回路径或 null（不抛错）", () => {
    const exe = findChromeExecutable();
    // 本机有 ms-playwright 缓存则为字符串；CI/无缓存则为 null——只要求类型正确不抛
    expect(exe === null || typeof exe === "string").toBe(true);
  });

  it("非 http/https 协议直接返回 error（不发启动浏览器）", async () => {
    const { renderPage } = await import("./browser");
    const r = await renderPage("file:///c:/x");
    expect(r.error).toBeTruthy();
    expect(r.text).toBe("");
  });

  it("缺 URL 直接返回 error", async () => {
    const { renderPage } = await import("./browser");
    const r = await renderPage("   ");
    expect(r.error).toBeTruthy();
  });
});
