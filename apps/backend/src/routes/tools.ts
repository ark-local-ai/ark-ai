// ===== 工具列表 API（M43） =====
// GET /api/tools —— 当前可用的「真工具」清单（web.read 等），供前端连接器/技能页如实展示。

import type { FastifyInstance } from "fastify";
import { webRead } from "../tools/web";
import { searchKnowledge } from "../tools/knowledge";
import { searchWeb } from "../tools/websearch";
import { currentUser } from "./auth";

export interface ToolInfo {
  name: string;
  describe: string;
  /** 是否已真正可用（无需额外 key/配置） */
  ready: boolean;
  kind: "read" | "search" | "generate" | "file";
}

export async function toolRoutes(app: FastifyInstance) {
  app.get("/", async (): Promise<ToolInfo[]> => {
    return [
      {
        name: "web.read",
        describe: "读取网页正文为可读文本（本地 fetch + 去标签），供编排层引用资料",
        ready: true,
        kind: "read",
      },
      {
        name: "search.knowledge",
        describe: "检索本地知识（记忆 + 工作空间文件名），返回相关片段，RAG-lite、多用户隔离",
        ready: true,
        kind: "search",
      },
      {
        name: "web.search",
        describe: "联网搜索（默认免 key 的 DuckDuckGo；可配 ARK_WEBSEARCH_ENDPOINT+KEY），返回标题/链接/摘要，供调研类提示词自动联网",
        ready: true,
        kind: "search",
      },
    ];
  });

  // 真工具调用入口：POST /api/tools/web.read { url, maxLength? }
  app.post<{ Body: { url?: string; maxLength?: number } }>("/web.read", async (req, reply) => {
    const url = (req.body?.url ?? "").trim();
    if (!url) return reply.code(400).send({ error: "url 必填" });
    const result = await webRead(url, { maxLength: req.body?.maxLength });
    if (result.error) return reply.code(502).send(result);
    return reply.send(result);
  });

  // 真工具调用入口：POST /api/tools/search.knowledge { query, limit? }
  app.post<{ Body: { query?: string; limit?: number } }>("/search.knowledge", async (req, reply) => {
    const query = (req.body?.query ?? "").trim();
    if (!query) return reply.code(400).send({ error: "query 必填" });
    const result = await searchKnowledge(query, currentUser(req)?.id, req.body?.limit ?? 8);
    return reply.send(result);
  });

  // 真工具调用入口：POST /api/tools/web.search { query }
  app.post<{ Body: { query?: string } }>("/web.search", async (req, reply) => {
    const query = (req.body?.query ?? "").trim();
    if (!query) return reply.code(400).send({ error: "query 必填" });
    const result = await searchWeb(query);
    if (result.error) return reply.code(502).send(result);
    return reply.send(result);
  });
}

