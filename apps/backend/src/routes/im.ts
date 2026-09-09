// ===== IM 消息桥（M45，默认关闭） =====
// 本地 webhook 网关：外部 IM（企业微信/钉钉/飞书/自建机器人…）把消息 POST 到 /api/im，
// 命中工作意图即入队成真实任务。**默认关闭**——必须先在 /app/im 配置页打开并填 secret，
// 且「数据不出机器」：这就是一个监听本机端口的路由，消息只在本地处理。
// GET  /api/im           读配置（含 enabled/secret/name/endpoint）
// PUT  /api/im           更新配置（{enabled?, name?, rotateSecret?}）
// POST /api/im           入站消息（{message, from?, secret?}）——仅 enabled 且 secret 匹配才处理

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getImSettings, setImEnabled, setImName, rotateImSecret } from "../db/store";
import { enqueueTask } from "./../agent/runner.js";
import { looksLikeTask } from "./chat";
import { currentUser } from "./auth";

export async function imRoutes(app: FastifyInstance) {
  // 读配置
  app.get("/", async () => getImSettings());

  // 改配置（写 → 走 M36 门禁 + M29 审计）
  app.put<{ Body: { enabled?: boolean; name?: string; rotateSecret?: boolean } }>("/", async (req) => {
    const s = getImSettings();
    const body = req.body ?? {};
    const out = { ...s };
    if (typeof body.enabled === "boolean") { setImEnabled(body.enabled); out.enabled = body.enabled; }
    if (typeof body.name === "string") { setImName(body.name); out.name = body.name.trim() || "IM 消息"; }
    if (body.rotateSecret === true) { out.secret = rotateImSecret(); }
    return out;
  });

  // 入站消息 webhook
  app.post<{ Body: { message?: string; from?: string; secret?: string } }>("/", async (req, reply) => {
    const cfg = getImSettings();
    if (!cfg.enabled) return reply.code(404).send({ error: "IM 桥未启用" });
    if (cfg.secret && req.body?.secret !== cfg.secret) {
      return reply.code(403).send({ error: "secret 不匹配" });
    }
    const message = (req.body?.message ?? "").trim();
    if (!message) return reply.code(400).send({ error: "message 必填" });
    const from = req.body?.from?.slice(0, 40) || "外部 IM";

    // 命中工作意图 → 入队真实任务（走与主页/对话同一管线）；否则只回执已收到
    if (looksLikeTask(message)) {
      const taskId = randomUUID().slice(0, 8);
      enqueueTask(taskId, message, currentUser(req)?.id);
      return reply.send({ ok: true, taskId, source: from, handled: true });
    }
    return reply.send({ ok: true, source: from, handled: false, note: "非任务意图，未创建任务" });
  });
}
