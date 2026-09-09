// ===== 专家 API（C6：内置目录 + 用户自建落库 CRUD） =====
// GET    /api/experts      列表（内置种子 + 用户自建，按是否内置区分）
// POST   /api/experts      创建专属专家
// PUT    /api/experts/:id  编辑
// DELETE /api/experts/:id  删除

import type { FastifyInstance } from "fastify";
import { experts as builtinExperts } from "../data/experts";
import { currentUser } from "./auth";
import {
  createExpert, listCustomExperts, updateExpert, deleteExpert,
} from "../db/store";

export async function expertRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const me = currentUser(req);
    const custom = listCustomExperts(me?.id);
    return [
      ...builtinExperts,
      ...custom.map((c) => ({
        id: c.id, name: c.name, icon: c.icon ?? "专", color: c.color ?? "#8B5E34",
        desc: c.desc ?? "", skills: c.skills ?? "0", connectors: c.connectors ?? "0",
        builtin: false,
      })),
    ];
  });

  app.post<{ Body: { name: string; icon?: string; color?: string; desc?: string; skills?: string; connectors?: string } }>(
    "/", async (req, reply) => {
      const name = (req.body?.name ?? "").trim();
      if (!name) return reply.code(400).send({ error: "专家名称必填" });
      const me = currentUser(req);
      const id = createExpert(
        {
          name,
          icon: req.body?.icon ?? "专",
          color: req.body?.color ?? "#8B5E34",
          desc: req.body?.desc ?? "",
          skills: req.body?.skills ?? "0",
          connectors: req.body?.connectors ?? "0",
        },
        me?.id,
      );
      return reply.code(201).send({ id });
    },
  );

  app.put<{ Params: { id: string }; Body: { name?: string; icon?: string; color?: string; desc?: string; skills?: string; connectors?: string } }>(
    "/:id", async (req, reply) => {
      const ok = updateExpert(req.params.id, req.body ?? {});
      if (!ok) return reply.code(404).send({ error: "专家不存在" });
      return reply.send({ ok: true });
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const ok = deleteExpert(req.params.id);
    if (!ok) return reply.code(404).send({ error: "专家不存在" });
    return reply.send({ ok: true });
  });
}
