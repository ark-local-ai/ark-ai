import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { runTask } from "../agent/orchestrator.js";
import { getTask } from "../db/store.js";
import { subscribe } from "../agent/events.js";

export async function taskRoutes(app: FastifyInstance) {
  // 创建任务并开始编排（后台异步推进，SSE 接收进度）
  app.post<{ Body: { prompt?: string } }>("/", async (req, reply) => {
    const prompt = req.body?.prompt?.trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt 不能为空" });
    }
    const id = randomUUID().slice(0, 8);
    // 立即返回任务 id；编排在后台异步执行
    void runTask(id, prompt);
    return reply.code(201).send({ taskId: id });
  });

  // 查询任务当前快照
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: "任务不存在" });
    return reply.send(task);
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
