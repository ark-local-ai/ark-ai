// ===== 编排上下文采集（M46：web.read + search.knowledge 接入编排管线） =====
// 任务开始时，把「提示词里出现的网址」读成正文、把「本地知识」检索出来，
// 一并作为参考资料注入交付内容，并作为 LLM 的补充上下文。让 Agent 不只是
// 凭空生成，而是能引用外部网页与本地资料。失败单项静默降级，不阻塞任务。
import { webRead, type WebReadResult } from "./web";
import { searchKnowledge, type KnowledgeHit } from "./knowledge";
import { searchWeb, type WebSearchHit } from "./websearch";

export interface PipelineContext {
  web: WebReadResult[];
  knowledge: KnowledgeHit[];
  search?: WebSearchHit[];
  /** 拼成一段可读上下文文本（给提示词/模型用） */
  contextText: string;
  /** 是否有可引用的资料（决定是否注入「参考资料」section） */
  hasRef: boolean;
}

const URL_RE = /https?:\/\/[^\s"'<>()，。；、]+/gi;
// M47：提示词命中这类“调研/了解最新”意图（且未给具体网址）→ 触发一次联网搜索
const RESEARCH_RE = /(调研|调查|竞品|市场|最新|趋势|了解|查一下|查下|搜索|搜集|research|市场分析|行业)/i;

export function extractUrls(text: string): string[] {
  const m = (text ?? "").match(URL_RE);
  if (!m) return [];
  return [...new Set(m.map((u) => u.replace(/[),.;，。]$/, "").trim()))].slice(0, 2);
}

function buildContextText(ctx: Pick<PipelineContext, "web" | "knowledge" | "search">): string {
  const parts: string[] = [];
  for (const w of ctx.web) {
    if (w.error) continue;
    parts.push(`【网页 ${w.title || w.url}】\n${w.text}`);
  }
  for (const k of ctx.knowledge) {
    parts.push(`【本地资料·${k.source}·${k.title}】\n${k.snippet}`);
  }
    for (const h of ctx.search ?? []) {
    parts.push(`【搜索结果·${h.title}】\n${h.snippet}\n${h.url}`);
  }
  return parts.join("\n\n---\n\n");
}

/** 采集上下文：读提示词内网址 + 检索本地知识。userId 用于多用户隔离。 */
export async function gatherContext(prompt: string, userId?: string): Promise<PipelineContext> {
  const urls = extractUrls(prompt);
  const web: WebReadResult[] = [];
  for (const u of urls) {
    try { web.push(await webRead(u, { maxLength: 2000 })); } catch { /* 单项失败静默 */ }
  }
  let knowledge: KnowledgeHit[] = [];
  try { knowledge = (await searchKnowledge(prompt, userId, 4)).hits; } catch { /* 静默降级 */ }
  // M47：未给网址且是调研/搜索意图 → 联网搜索一次，取回标题/片段（不自动读全文，用户可再 web.read）
  let search: WebSearchHit[] = [];
  if (urls.length === 0 && RESEARCH_RE.test(prompt)) {
    try { search = (await searchWeb(prompt)).hits; } catch { /* 静默降级 */ }
  }
  const contextText = buildContextText({ web, knowledge, search });
  const hasRef = web.some((w) => !w.error) || knowledge.length > 0 || search.length > 0;
  return { web, knowledge, search, contextText, hasRef };
}

/** 把参考资料追加为一个 section（有引用才加）。 */
export function appendRefSection(
  sections: { title: string; paragraphs: string[] }[],
  ctx: Pick<PipelineContext, "web" | "knowledge" | "search">,
): { title: string; paragraphs: string[] }[] {
  const paras: string[] = [];
  for (const w of ctx.web) {
    if (w.error) continue;
    paras.push(`出处：${w.title || w.url}（${w.url}）`);
    paras.push(w.text);
  }
  for (const k of ctx.knowledge) {
    paras.push(`本地资料「${k.title}」：${k.snippet}`);
  }
    for (const h of ctx.search ?? []) {
    paras.push(`搜索结果「${h.title}」：${h.snippet}（${h.url}）`);
  }
  if (!paras.length) return sections;
  return [...sections, { title: "参考资料", paragraphs: paras }];
}
