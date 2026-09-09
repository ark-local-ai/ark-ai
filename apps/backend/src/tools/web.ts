// ===== 内置网页读取工具（M43 web.read） =====
// 本地、零依赖、无 key：fetch URL → 抽正文可读文本。配合路由/编排作为「真工具」使用。
// 只做「读取」不执行脚本（不渲染 JS），目标是拿到可分发的文字内容，而非完整浏览器。

export interface WebReadResult {
  url: string;
  title: string;
  /** 清理后的大段正文（合并空白、去脚本/样式/标签） */
  text: string;
  length: number;
  error?: string;
}

function stripHtml(html: string): string {
  // 先移除 script/style/noscript 及其内容
  return html
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ") // 去标签
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim().slice(0, 120) : "";
}

/**
 * 读取网页正文。默认最多保留 maxLength 字符（默认 6000），防把超大页拖爆上下文。
 * 失败返回 error（不抛异常），便于编排层降级。
 */
export async function webRead(url: string, opts: { maxLength?: number } = {}): Promise<WebReadResult> {
  const maxLength = opts.maxLength ?? 6000;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { url, title: "", text: "", length: 0, error: "仅支持 http/https 协议" };
    }
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Ark-LocalAI/1.0 (local read tool)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { url, title: "", text: "", length: 0, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const title = extractTitle(html);
    const text = stripHtml(html);
    const trimmed = text.length > maxLength ? text.slice(0, maxLength) + "…（已截断）" : text;
    return { url, title, text: trimmed, length: trimmed.length };
  } catch (e) {
    return {
      url, title: "", text: "", length: 0,
      error: e instanceof Error ? e.message : "读取失败",
    };
  }
}
