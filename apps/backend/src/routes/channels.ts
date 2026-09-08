// ===== 模型渠道 API（DB 持久化 CRUD + 验活） =====
// GET    /api/channels            列表（含成功率统计）
// POST   /api/channels            {id?,name,proto,model,baseUrl,apiKey?} 新增
// PUT    /api/channels/:id        patch
// DELETE /api/channels/:id
// POST   /api/channels/:id/default  设为默认
// POST   /api/channels/:id/test     验活（GET {baseUrl}/models）

import type { FastifyInstance } from "fastify";
import { getChannelStats } from "../models/router";
import {
  createChannel, updateChannel, deleteChannel, setDefaultChannel, getChannelById,
} from "../config/channels";

async function testEndpoint(baseUrl: string, apiKey?: string): Promise<boolean> {
  const url = `${(baseUrl || "").replace(/\/$/, "")}/models`;
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function channelRoutes(app: FastifyInstance) {
  app.get("/", async () => getChannelStats());

  app.post<{ Body: { id?: string; name?: string; proto?: "openai" | "anthropic"; model?: string; baseUrl?: string; apiKey?: string } }>(
    "/", async (req, reply) => {
      const { id, name, proto, model, baseUrl, apiKey } = req.body ?? {};
      if (!name?.trim() || !baseUrl?.trim()) {
        return reply.code(400).send({ error: "name 与 baseUrl 不能为空" });
      }
      const ch = createChannel({
        id: id?.trim() || undefined,
        name: name.trim(), proto: proto ?? "openai",
        model: model?.trim() || "默认模型",
        baseUrl: baseUrl.trim(), apiKey: apiKey?.trim() || undefined,
      });
      return reply.code(201).send(ch);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<{ name: string; proto: "openai" | "anthropic"; model: string; baseUrl: string; apiKey: string }> }>(
    "/:id", async (req, reply) => {
      const ch = updateChannel(req.params.id, req.body ?? {});
      if (!ch) return reply.code(404).send({ error: "渠道不存在" });
      return reply.send(ch);
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!deleteChannel(req.params.id)) return reply.code(404).send({ error: "渠道不存在" });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/default", async (req, reply) => {
    if (!setDefaultChannel(req.params.id)) return reply.code(404).send({ error: "渠道不存在" });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/:id/test", async (req, reply) => {
    const ch = getChannelById(req.params.id);
    if (!ch) return reply.code(404).send({ error: "渠道不存在" });
    const ok = await testEndpoint(ch.baseUrl, ch.apiKey);
    return reply.send({ ok, id: ch.id, name: ch.name });
  });
}
