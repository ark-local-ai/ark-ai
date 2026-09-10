// ===== 对话会话 API（M19，持久化）=====
// GET    /api/chat/sessions         会话列表（多用户隔离）
// GET    /api/chat/sessions/:id/messages   某会话完整消息
// DELETE /api/chat/sessions/:id     删除会话（含消息）
// 会话/消息由 POST /api/chat 自动落库；这里是读取与管理的补充接口。
// M58：POST /:id/distill 提炼候选记忆（不落库）+ POST /:id/distill/save 保存选中的。

import type { FastifyInstance } from "fastify";
import {
  listChatSessions, getChatMessages, deleteChatSession, createMemory,
} from "../db/store.js";
import { currentUser } from "./auth.js";
import { distillMemoryCandidates, type MemoryCandidate } from "../tools/distill.js";

export async function chatSessionRoutes(app: FastifyInstance) {
  app.get("/", async (req) => listChatSessions(currentUser(req)?.id));

  app.get<{ Params: { id: string } }>("/:id/messages", async (req, reply) => {
    const msgs = getChatMessages(req.params.id);
    return reply.send({ messages: msgs });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!deleteChatSession(req.params.id)) {
      return reply.code(404).send({ error: "会话不存在" });
    }
    return reply.send({ ok: true });
  });

  // M58：对一个会话提炼「值得记住的候选记忆」，只返回不落库，前端展示让用户勾选确认。
  app.post<{ Params: { id: string } }>("/:id/distill", async (req, reply) => {
    const msgs = getChatMessages(req.params.id);
    if (!msgs.length) return reply.code(404).send({ error: "会话没有消息" });
    const r = await distillMemoryCandidates(msgs);
    return reply.send({ candidates: r.candidates, viaLLM: r.viaLLM, error: r.error });
  });

  // M58：把用户确认过的候选记忆落库。body.factIds 传入要保存的候选索引（按 distill 返回顺序）。
  app.post<{ Params: { id: string }; Body: { facts?: MemoryCandidate[] } }>(
    "/:id/distill/save", async (req, reply) => {
      const facts = Array.isArray(req.body?.facts) ? req.body.facts : [];
      if (!facts.length) return reply.code(400).send({ error: "没有要保存的记忆" });
      const saved: { kind: string; content: string }[] = [];
      const out: { id: string; kind: string; content: string }[] = [];
      for (const f of facts) {
        const content = (f.content ?? "").trim();
        if (!content) continue;
        const kind = f.kind ?? "note";
        // M60：source 记为 "chat-distill:<sessionId>"，标记这条记忆由 M58 从本会话提炼
        const id = createMemory(
          { kind, content, source: `chat-distill:${req.params.id}` },
          currentUser(req)?.id,
        );
        out.push({ id, kind, content });
        saved.push({ kind, content });
      }
      return reply.send({ ok: true, saved: out });
    },
  );
}
