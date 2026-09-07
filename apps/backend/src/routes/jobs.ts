// ===== 自动化定时任务 API =====
// GET    /api/jobs            任务列表
// POST   /api/jobs            {name,schedule,action,push,enabled?} 新建
// PUT    /api/jobs/:id        patch
// DELETE /api/jobs/:id
// POST   /api/jobs/:id/run    手动立即执行
// GET    /api/jobs/logs       最近执行历史

import type { FastifyInstance } from "fastify";
import {
  listJobs, getJob, createJob, updateJob, deleteJob, runJob, listJobLogs,
} from "../scheduler/jobs";

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", async () => listJobs());

  app.get("/logs", async () => listJobLogs());

  app.post<{ Body: { name?: string; schedule?: string; action?: string; push?: string; enabled?: boolean } }>(
    "/", async (req, reply) => {
      const { name, schedule, action, push, enabled } = req.body ?? {};
      if (!name?.trim() || !action?.trim()) {
        return reply.code(400).send({ error: "name 与 action 不能为空" });
      }
      const job = createJob({
        name: name.trim(), schedule: schedule?.trim() || "09:00",
        action: action.trim(), push: push ?? "", enabled,
      });
      return reply.code(201).send(job);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<{ name: string; schedule: string; action: string; push: string; enabled: boolean }> }>(
    "/:id", async (req, reply) => {
      const job = updateJob(req.params.id, req.body ?? {});
      if (!job) return reply.code(404).send({ error: "任务不存在" });
      return reply.send(job);
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!deleteJob(req.params.id)) return reply.code(404).send({ error: "任务不存在" });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/run", async (req, reply) => {
    const ok = await runJob(req.params.id);
    if (!ok && !getJob(req.params.id)) return reply.code(404).send({ error: "任务不存在" });
    return reply.send({ ok });
  });
}
