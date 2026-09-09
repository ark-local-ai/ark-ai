import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { enqueueTask } from "../agent/runner.js";
import {
  createTaskTemplate, listTaskTemplates, getTaskTemplate,
  updateTaskTemplate, deleteTaskTemplate,
} from "../db/store.js";
import { currentUser } from "./auth.js";

// ===== M33 任务模板：CRUD + 一键应用模板建任务 =====
// PUT/POST/DELETE 写请求会自动落审计（根 onResponse 钩子）。
export async function templateRoutes(app: FastifyInstance) {
  // 列表（多用户隔离：登录用户可见自己的+全局）
  app.get("/", async (req) => {
    return listTaskTemplates(currentUser(req)?.id);
  });

  // 单个（详情/编辑回填）
  app.get("/:id", async (req, reply) => {
    const t = getTaskTemplate((req.params as { id: string }).id);
    if (!t) return reply.code(404).send({ error: "模板不存在" });
    return reply.send(t);
  });

  // 创建模板
  app.post<{ Body: { name?: string; desc?: string; prompt?: string; expert?: string; skills?: string[]; model?: string } }>(
    "/",
    async (req, reply) => {
      const b = req.body ?? {};
      const name = b.name?.trim();
      const prompt = b.prompt?.trim();
      if (!name) return reply.code(400).send({ error: "模板名称不能为空" });
      if (!prompt) return reply.code(400).send({ error: "模板提示词不能为空" });
      const id = createTaskTemplate(
        { name, desc: b.desc?.trim(), prompt, expert: b.expert?.trim(), skills: b.skills, model: b.model?.trim() },
        currentUser(req)?.id,
      );
      return reply.code(201).send({ id });
    },
  );

  // 更新模板
  app.put<{ Params: { id: string }; Body: { name?: string; desc?: string; prompt?: string; expert?: string; skills?: string[]; model?: string } }>(
    "/:id",
    async (req, reply) => {
      const b = req.body ?? {};
      const ok = updateTaskTemplate(req.params.id, {
        name: b.name?.trim(), desc: b.desc?.trim(), prompt: b.prompt?.trim(),
        expert: b.expert?.trim(), skills: b.skills, model: b.model?.trim(),
      });
      if (!ok) return reply.code(404).send({ error: "模板不存在" });
      return reply.send({ ok: true });
    },
  );

  // 删除模板
  app.delete("/:id", async (req, reply) => {
    const ok = deleteTaskTemplate((req.params as { id: string }).id);
    if (!ok) return reply.code(404).send({ error: "模板不存在" });
    return reply.send({ ok: true });
  });

  // 应用模板：以模板的提示词创建并启动一个真实任务（与首页建任务同管线）
  // C2：模板的 expert/skills/model 真正生效——经 AgentOptions 传入编排列成任务与渠道偏好
  app.post<{ Params: { id: string } }>("/:id/run", async (req, reply) => {
    const t = getTaskTemplate((req.params as { id: string }).id);
    if (!t) return reply.code(404).send({ error: "模板不存在" });
    const taskId = randomUUID().slice(0, 8);
    enqueueTask(taskId, t.prompt, currentUser(req)?.id, {
      expert: t.expert,
      skills: t.skills,
      modelHint: t.model,
    });
    return reply.code(201).send({ taskId });
  });
}
