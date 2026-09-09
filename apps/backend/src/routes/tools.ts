// ===== 工具列表 API（M43） =====
// GET /api/tools —— 当前可用的「真工具」清单（web.read 等），供前端连接器/技能页如实展示。

import type { FastifyInstance } from "fastify";
import { webRead } from "../tools/web";

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
}

