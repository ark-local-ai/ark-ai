import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { enqueueTask } from "../agent/runner.js";
import { getTask, listTasks, deleteTask, setTaskArchived, createTaskTemplate } from "../db/store.js";
import { subscribe } from "../agent/events.js";
import { currentUser } from "./auth.js";

export async function taskRoutes(app: FastifyInstance) {
  // 创建任务并开始编排（后台异步推进，SSE 接收进度）
  // M52：可选 refs=[{title?,url?,text}] 作为「送给任务」的参考资料跟随任务注入上下文
  app.post<{ Body: { prompt?: string; refs?: { title?: string; url?: string; text: string }[] } }>("/", async (req, reply) => {
    const prompt = req.body?.prompt?.trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt 不能为空" });
    }
    const rawRefs = Array.isArray(req.body?.refs) ? req.body!.refs : [];
    const refs = rawRefs
      .filter((r) => r && typeof r.text === "string" && r.text.trim())
      .map((r) => ({ title: r.title?.trim() || undefined, url: r.url?.trim() || undefined, text: r.text.trim() }));
    const id = randomUUID().slice(0, 8);
    const userId = currentUser(req)?.id; // 归属当前登录用户；未登录 → 全局
    // 立即返回任务 id；编排入队后台串行执行（队列 + 失败兜底 + 超时，见 runner）
    enqueueTask(id, prompt, userId, refs.length ? { refs } : undefined);
    return reply.code(201).send({ taskId: id });
  });

  // 任务列表摘要（侧栏「最近任务」）；多用户隔离：登录用户只见自己的+全局
  // ?archived=1 只列归档任务（默认只看活跃）
  app.get("/", async (req) => {
    const q = (req.query as { archived?: string })?.archived === "1";
    return listTasks(50, currentUser(req)?.id, q);
  });

  // 归档 / 取消归档任务（仅终态任务可归档，M22）
  app.post<{ Params: { id: string }; Body: { archived?: boolean } }>("/:id/archive", async (req, reply) => {
    const id = req.params.id;
    const task = getTask(id);
    if (!task) return reply.code(404).send({ error: "任务不存在" });
    const archived = req.body?.archived ?? true;
    if (archived && (task.status === "queue" || task.status === "running")) {
      return reply.code(409).send({ error: "任务正在执行中，不能归档" });
    }
    if (!setTaskArchived(id, archived)) return reply.code(404).send({ error: "任务不存在" });
    return reply.send({ ok: true, archived });
  });

  // 查询任务当前快照
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: "任务不存在" });
    return reply.send(task);
  });

  // 另存为模板（C1）：从已完成任务一键固化为模板（复用 prompt/expert/skills/model）
  app.post<{ Params: { id: string }; Body: { name?: string } }>("/:id/template", async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: "任务不存在" });
    if (task.status !== "done") {
      return reply.code(409).send({ error: "只有已完成的任务可以固化为模板" });
    }
    const id = createTaskTemplate(
      {
        name: req.body?.name?.trim() || `模板 · ${task.title}`,
        desc: task.prompt.slice(0, 80) || undefined,
        prompt: task.prompt,
        expert: task.expert,
        skills: task.skills,
        model: task.model,
      },
      currentUser(req)?.id,
    );
    return reply.code(201).send({ id });
  });

  // 重试：把 failed / done 任务用原 prompt 重新入队再跑一次（M17）
  app.post<{ Params: { id: string } }>("/:id/retry", async (req, reply) => {
    const id = req.params.id;
    const task = getTask(id);
    if (!task) return reply.code(404).send({ error: "任务不存在" });
    if (task.status === "running" || task.status === "queue") {
      return reply.code(409).send({ error: "任务正在执行中，暂不能重试" });
    }
    enqueueTask(id, task.prompt, currentUser(req)?.id);
    return reply.send({ taskId: id, status: "queue" });
  });

  // 删除任务（含其步骤/产物，M17）
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const ok = deleteTask(req.params.id);
    if (!ok) return reply.code(404).send({ error: "任务不存在" });
    return reply.send({ ok: true });
  });

  // SSE：订阅任务进度事件流
  app.get<{ Params: { id: string } }>("/:id/events", async (req, reply) => {
    const id = req.params.id;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: { type: string; taskId: string; data: unknown }) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    const unsub = subscribe(id, (e) => send(e));
    // 心跳防断连
    const hb = setInterval(() => reply.raw.write(": ping\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(hb);
      unsub();
    });
  });
}
