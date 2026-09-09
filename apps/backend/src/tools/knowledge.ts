// ===== 内置知识检索工具（M44 search.knowledge, RAG-lite） =====
// 零 embedding、零 LLM：给定查询，跨「记忆 + 工作空间文件名」检索相关片段返回，
// 供编排层/对话把本地资料带进上下文。多用户隔离（记忆按 user；工作空间全局可见）。
import { searchMemoriesFor } from "../db/store.js";
import { searchWorkspaceFiles } from "./searchIndex.js";

export interface KnowledgeHit {
  source: "memory" | "workspace";
  kind: string;
  title: string;
  /** 命中片段/说明（记忆存 content，文件存名字+大小） */
  snippet: string;
  id?: string;
  space?: string;
}

export interface KnowledgeResult {
  query: string;
  hits: KnowledgeHit[];
  count: number;
}

/**
 * 检索本地知识。limit 控制返回条数（memory 与 workspace 平分）。
 * memory 用 `searchMemoriesFor`（CJK 二元组高召回，多用户隔离）；
 * workspace 用文件名 FTS/LIKE（全局）。
 */
export async function searchKnowledge(query: string, userId?: string, limit = 8): Promise<KnowledgeResult> {
  const q = (query ?? "").trim();
  if (!q) return { query: q, hits: [], count: 0 };

  const memHits = searchMemoriesFor(q, userId ?? undefined);
  const fileHits = searchWorkspaceFiles(q).slice(0, limit);

  const memShare = Math.min(memHits.length, Math.max(1, Math.floor(limit / 2)));
  const hits: KnowledgeHit[] = [];
  for (const m of memHits.slice(0, memShare)) {
    hits.push({ source: "memory", kind: m.kind ?? "note", title: m.content.slice(0, 24), snippet: m.content, id: m.id });
  }
  for (const f of fileHits) {
    hits.push({
      source: "workspace",
      kind: f.kind,
      title: f.name,
      snippet: `${f.name}（${f.spaceName}，${f.sizeText}）`,
      space: f.spaceName,
    });
  }
  return { query: q, hits: hits.slice(0, limit), count: hits.slice(0, limit).length };
}
