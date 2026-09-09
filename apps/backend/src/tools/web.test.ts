import { afterEach, describe, expect, it } from "vitest";
import { webRead } from "./web";

function stubFetch(status: number, body: string) {
  const fn = async () =>
    new Response(body, { status, headers: { "Content-Type": "text/html" } });
  vi.stubGlobal("fetch", fn);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("网页读取工具（M43 web.read）", () => {
  it("只接受 http/https 协议", async () => {
    const r = await webRead("file:///C:/x/y.html");
    expect(r.error).toBeTruthy();
  });

  it("抓取 HTML 并抽正文可读文本 + title", async () => {
    stubFetch(200, "<html><head><title>测试页</title></head><body><script>var x=1;</script><h1>标题</h1><p>这是　正文内容。</p><style>.a{}</style></body></html>");
    const r = await webRead("https://example.com/a");
    expect(r.error).toBeUndefined();
    expect(r.title).toBe("测试页");
    expect(r.text).toContain("标题");
    expect(r.text).toContain("正文内容");
    // script/style 内容被剥离
    expect(r.text).not.toContain("var x");
    expect(r.text).not.toContain(".a{");
  });

  it("超长正文按 maxLength 截断并标注", async () => {
    const long = "<p>" + "字".repeat(1000) + "</p>";
    stubFetch(200, `<html><body>${long}</body></html>`);
    const r = await webRead("https://example.com/b", { maxLength: 100 });
    expect(r.text.length).toBeLessThanOrEqual(120);
    expect(r.text).toContain("已截断");
  });

  it("HTTP 错误如实返回 error", async () => {
    stubFetch(404, "not found");
    const r = await webRead("https://example.com/nope");
    expect(r.error).toBeTruthy();
  });
});
