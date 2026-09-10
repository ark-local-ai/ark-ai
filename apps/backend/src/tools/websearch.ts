import { isWebSearchEnabled, getConfiguredSearch, tryConsumeQuota } from "./searchSettings";

// ===== 内置联网搜索工具（M47 search.web） =====
// 本地优先、默认免 key：直接 fetch 一个搜索端点取回标题/链接/摘要，供编排层「调研/搜索」
// 类提示词自动联网（配合 web.read 读正文组成完整链路），也走 /api/tools 真工具调用入口。
//
// Provider 抽象：
//   · 默认 DuckDuckGo HTML（免 key、无需登录、数据经本机出网），解析 `result__a`/`result__snippet`
//   · 可选配置 `ARK_WEBSEARCH_ENDPOINT` + `ARK_WEBSEARCH_KEY`：POST 到该端点
//     `{ query }`，期望 `{ results:[{title,url,snippet}] }`（兼容自建/代理商）
// 失败返回 error（不抛），编排层静默降级。

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  query: string;
  hits: WebSearchHit[];
  count: number;
  error?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'");
}

/** 从 DuckDuckGo HTML 页提取结果（无依赖正则） */
export function parseDuckDuckGo(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const blocks = html.split(/<h2 class="result__title">/i).slice(1);
  for (const b of blocks) {
    const titleM = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>(.*?)<\/a>/i)
      || b.match(/<a[^>]*rel="nofollow"[^>]*>(.*?)<\/a>/i);
    const linkM = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/i)
      || b.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]+)"/i);
    const snipM = b.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/i)
      || b.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/span>/i);
    if (!titleM || !linkM) continue;
    // DuckDuckGo 的链接是相对重定向 `//duckduckgo.com/l/?uddg=<真实URL>&rut=...`，解出 uddg 拿真实目标
    const raw = linkM[1].trim();
    const uddg = raw.match(/[?&]uddg=([^&]+)/);
    let url = uddg ? decodeURIComponent(uddg[1]) : raw;
    if (!/^https?:\/\//i.test(url)) continue;
    const title = decodeEntities(titleM[1].replace(/<[^>]+>/g, "")).trim();
    const snippet = snipM
      ? decodeEntities(snipM[1].replace(/<[^>]+>/g, "")).trim()
      : "";
    if (title) hits.push({ title, url, snippet });
    if (hits.length >= 8) break;
  }
  return hits;
}

/** 走配置的 endpoint（M53 起库内 websearch_endpoint 优先，env 兜底） */
async function configuredSearch(query: string): Promise<WebSearchHit[]> {
  const { endpoint, key } = getConfiguredSearch();
  if (!endpoint) throw new Error("未配置搜索 endpoint");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`搜索代理 HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { title?: string; url?: string; snippet?: string }[] };
  return (json.results ?? [])
    .filter((r) => r?.title && r?.url)
    .slice(0, 8)
    .map((r) => ({ title: r.title!, url: r.url!, snippet: r.snippet ?? "" }));
}

/** 联网搜索。未配置代理时用免 key 的 DuckDuckGo HTML。失败返回 error。 */
export async function searchWeb(query: string): Promise<WebSearchResult> {
  const q = (query ?? "").trim();
  if (!q) return { query: q, hits: [], count: 0, error: "query 为空" };
  if (q.length < 2) return { query: q, hits: [], count: 0, error: "query 太短" };
  if (!isWebSearchEnabled()) return { query: q, hits: [], count: 0, error: "联网搜索已关闭" };
  // M53 配额：滑动窗口限流，超限不发出网请求（避免脚本/误触打爆）
  if (!tryConsumeQuota()) {
    return { query: q, hits: [], count: 0, error: "已达到本分钟搜索配额，请稍后再试" };
  }
  try {
    let hits: WebSearchHit[];
    if (getConfiguredSearch().provider === "custom") {
      hits = await configuredSearch(q);
    } else {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Ark-LocalAI/1.0 (web search)" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`搜索 HTTP ${res.status}`);
      hits = parseDuckDuckGo(await res.text());
    }
    return { query: q, hits, count: hits.length };
  } catch (e) {
    return {
      query: q, hits: [], count: 0,
      error: e instanceof Error ? e.message : "联网搜索失败",
    };
  }
}
