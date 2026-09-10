// ===== 工具列表 API（M43） =====
// GET /api/tools —— 当前可用的「真工具」清单（web.read 等），供前端连接器/技能页如实展示。

import type { FastifyInstance } from "fastify";
import { webRead } from "../tools/web";
import { searchKnowledge } from "../tools/knowledge";
import { searchWeb } from "../tools/websearch";
import { renderPage } from "../tools/browser";
import { saveToWorkspace } from "../tools/save";
import {
  getSearchSourceStatus, setWebSearchEnabled, isWebSearchEnabled,
  updateSearchProvider, setQuota, getQuotaStatus,
  type SearchProvider,
} from "../tools/searchSettings";
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
      {
        name: "browser.render",
        describe: "无头浏览器渲染 URL 再抽正文（真执行 JS，能拿到 web.read 拿不到的 SPA/客户端渲染内容），本地 Chromium",
        ready: true,
        kind: "read",
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
    if (!isWebSearchEnabled()) return reply.code(403).send({ error: "联网搜索已关闭" });
    const result = await searchWeb(query);
    if (result.error) return reply.code(502).send(result);
    return reply.send(result);
  });

  // 真工具调用入口：POST /api/tools/browser.render { url, maxLength? }
  app.post<{ Body: { url?: string; maxLength?: number } }>("/browser.render", async (req, reply) => {
    const url = (req.body?.url ?? "").trim();
    if (!url) return reply.code(400).send({ error: "url 必填" });
    const result = await renderPage(url, { maxLength: req.body?.maxLength });
    if (result.error) return reply.code(502).send(result);
    return reply.send(result);
  });

  // M50：把上网读到的正文「存进资料库」——写进当前活动工作空间（Markdown + 版本快照）
  app.post<{ Body: { title?: string; url?: string; text: string; source?: string } }>(
    "/save", async (req, reply) => {
      const r = await saveToWorkspace(req.body ?? { text: "" });
      if (r.error) return reply.code(400).send(r);
      return reply.send(r);
    },
  );

  // M50 副线 + M53 搜索源管理：联网搜索源设置（可控、可显式关停、provider 可配、配额限流）
  app.get("/search/source", async () => getSearchSourceStatus());
  app.post<{ Body: { enabled: boolean } }>("/search/source/enabled", async (req, reply) => {
    if (typeof req.body?.enabled !== "boolean") return reply.code(400).send({ error: "enabled 必填" });
    return { enabled: setWebSearchEnabled(req.body.enabled) };
  });
  // M53：切换/配置搜索 provider（endpoint/key 存库，custom 需给 endpoint）
  app.post<{ Body: { provider?: SearchProvider; endpoint?: string; key?: string } }>(
    "/search/source/provider", async (req, reply) => {
      const provider = req.body?.provider;
      if (provider !== "duckduckgo" && provider !== "custom") {
        return reply.code(400).send({ error: "provider 须为 duckduckgo 或 custom" });
      }
      const cfg = updateSearchProvider(provider, req.body?.endpoint, req.body?.key);
      // custom 但没配成 endpoint → 回落 duckduckgo，前端据此提示
      return {
        provider: cfg.provider,
        endpointConfigured: cfg.provider === "custom" && !!cfg.configuredEndpoint,
        configuredEndpoint: cfg.configuredEndpoint,
      };
    },
  );
  // M53：设置每分钟搜索配额
  app.post<{ Body: { rpm?: number } }>("/search/source/quota", async (req, reply) => {
    const rpm = Number(req.body?.rpm);
    if (!Number.isFinite(rpm)) return reply.code(400).send({ error: "rpm 必填" });
    return { quote: setQuota(rpm) };
  });
  // M53：查看当前配额使用（供前端实时展示已用/剩余）
  app.get("/search/source/quota", async () => ({ quote: getQuotaStatus() }));
}

