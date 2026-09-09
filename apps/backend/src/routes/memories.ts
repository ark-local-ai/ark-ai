// ===== 记忆 API（M41）=====
// GET    /api/memories           列表（可 ?kind= 过滤，多用户隔离）
// GET    /api/memories/search?q=  记忆全文检索（FTS5 trigram）
// POST   /api/memories           创建（{kind?, content, tags?}）
// GET    /api/memories/:id       单条
// PUT    /api/memories/:id       编辑
// DELETE /api/memories/:id       删除

import type { FastifyInstance } from "fastify";
import { currentUser } from "./auth";
import {
  createMemory, listMemories, getMemory, updateMemory, deleteMemory, searchMemories,
} from "../db/store";

export async function memoryRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const kind = (req.query as { kind?: string }).kind?.trim() || undefined;
    return listMemories(currentUser(req)?.id, kind);
  });

  // 全文检索：必须放在 /:id 之前，否则「search」会被当 id 命中
  app.get<{ Querystring: { q?: string } }>("/search", async (req) => {
    return searchMemories(req.query.q ?? "", currentUser(req)?.id);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const m = getMemory(req.params.id);
    if (!m) return reply.code(404).send({ error: "记忆不存在" });
    return reply.send(m);
  });

  app.post<{ Body: { kind?: string; content?: string; tags?: string } }>("/", async (req, reply) => {
    const content = (req.body?.content ?? "").trim();
    if (!content) return reply.code(400).send({ error: "记忆内容必填" });
    const id = createMemory(
      { kind: req.body?.kind, content, tags: req.body?.tags },
      currentUser(req)?.id,
    );
    return reply.code(201).send({ id });
  });

  app.put<{ Params: { id: string }; Body: { kind?: string; content?: string; tags?: string } }>(
    "/:id", async (req, reply) => {
      const ok = updateMemory(req.params.id, req.body ?? {}, currentUser(req)?.id);
      if (!ok) return reply.code(404).send({ error: "记忆不存在" });
      return reply.send({ ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const ok = deleteMemory(req.params.id);
    if (!ok) return reply.code(404).send({ error: "记忆不存在" });
    return reply.send({ ok: true });
  });
}
