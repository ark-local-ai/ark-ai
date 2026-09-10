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
  deleteMemories, findDuplicateMemories, mergeMemories,
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

  // 查重复：归一化后内容相同的记忆分组成列表（canonical 保留最早，duplicates 待删），?kind= 可只查某类；同样须在 /:id 之前
  app.get<{ Querystring: { kind?: string } }>("/duplicates", async (req) => {
    return findDuplicateMemories(currentUser(req)?.id, req.query.kind?.trim() || undefined);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const m = getMemory(req.params.id);
    if (!m) return reply.code(404).send({ error: "记忆不存在" });
    return reply.send(m);
  });

  app.post<{ Body: { kind?: string; content?: string; tags?: string; source?: string } }>("/", async (req, reply) => {
    const content = (req.body?.content ?? "").trim();
    if (!content) return reply.code(400).send({ error: "记忆内容必填" });
    const id = createMemory(
      { kind: req.body?.kind, content, tags: req.body?.tags, source: req.body?.source ?? "manual" },
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

  // 批量删除：必须在 /:id 之前注册，否则 POST /batch-delete 会撞进 /:id 无关（POST 无 /:id）
  app.post<{ Body: { ids?: string[] } }>("/batch-delete", async (req, reply) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return reply.code(400).send({ error: "请选择要删除的记忆" });
    const n = deleteMemories(ids, currentUser(req)?.id);
    return reply.send({ ok: true, deleted: n });
  });

  // M59：一键合并重复记忆——把 removeIds 的 tags 并入 keepId 后再删除 removeIds
  app.post<{ Body: { keepId?: string; removeIds?: string[] } }>("/merge", async (req, reply) => {
    const keepId = (req.body?.keepId ?? "").trim();
    const removeIds = Array.isArray(req.body?.removeIds) ? req.body.removeIds.filter(Boolean) : [];
    if (!keepId || !removeIds.length) return reply.code(400).send({ error: "缺少要合并的记忆" });
    const r = mergeMemories(keepId, removeIds, currentUser(req)?.id);
    if (!r.kept) return reply.code(404).send({ error: "记忆不存在或不可见" });
    return reply.send({ ok: true, kept: r.kept, removed: r.removed });
  });
}
