import { afterEach, describe, expect, it } from "vitest";
import { searchWeb, parseDuckDuckGo } from "./websearch";
import { setQuota, setWebSearchEnabled } from "./searchSettings";

function stubFetch(status: number, body: string) {
  vi.stubGlobal("fetch", async () =>
    new Response(body, { status, headers: { "Content-Type": "text/html" } }));
}
afterEach(() => vi.unstubAllGlobals());

describe("内置联网搜索（M47 search.web）", () => {
  it("解析 DuckDuckGo HTML 提取 title/url/snippet（去尾标点、去锚点）", () => {
    const html = `<h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=x">示例标题一</a>
      <a class="result__snippet">这是一段摘要内容。</a>
    </h2>
    <h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Second Result</a>
      <a class="result__snippet">not a link; snippet.</a>
    </h2>`;
    const hits = parseDuckDuckGo(html);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe("示例标题一");
    expect(hits[0].snippet).toContain("摘要");
  });

  it("默认走 DuckDuckGo 免 key（stub fetch 200）成功返回 hits", async () => {
    stubFetch(200,
      `<h2 class="result__title"><a class="result__a" href="//d/l/?uddg=https%3A%2F%2Fa.test">Alpha</a><a class="result__snippet">s1</a></h2>`);
    const r = await searchWeb("竞品分析");
    expect(r.error).toBeUndefined();
    expect(r.count).toBeGreaterThan(0);
    expect(r.hits[0].title).toBe("Alpha");
  });

  it("HTTP 错误如实返回 error", async () => {
    stubFetch(500, "boom");
    const r = await searchWeb("x");
    expect(r.error).toBeTruthy();
  });

  it("空/过短 query 返回 error 不发请求", async () => {
    expect((await searchWeb("")).error).toBeTruthy();
    expect((await searchWeb("a")).error).toBeTruthy();
  });
});

describe("联网搜索配额（M53）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setWebSearchEnabled(true);
    setQuota(30);
  });

  it("searchWeb 消耗配额，超额后返回 error 且不再发请求", async () => {
    setWebSearchEnabled(true);
    setQuota(1);
    const html =
      `<h2 class="result__title"><a class="result__a" href="//d/l/?uddg=https%3A%2F%2Fa.test">Alpha</a><a class="result__snippet">s1</a></h2>`;
    vi.stubGlobal("fetch", async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }));

    const first = await searchWeb("配额测试一");
    expect(first.error).toBeUndefined(); // 消耗掉唯一额度并成功

    // 第二次：达到配额 → error，且 fetch 不应再被调用
    let called = 0;
    vi.stubGlobal("fetch", async () => { called++; return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }); });
    const second = await searchWeb("配额测试二");
    expect(second.error).toContain("配额");
    expect(called).toBe(0); // 没发出网请求
  });

  it("searchWeb 在联网已关闭时返回关闭错误（不消耗配额路径）", async () => {
    setWebSearchEnabled(false);
    const r = await searchWeb("测试搜索");
    expect(r.error).toBe("联网搜索已关闭");
  });
});
